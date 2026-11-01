# ADR-0013: Estratégia de logging — Canonical Log Lines (Wide Events), taxonomia e controle de custo

- **Status:** Aceito
- **Data:** 2026-11-01
- **Decisores:** José Victor
- **Tasks relacionadas:** T3.02, T3.08, T3.10, T4.03, T4.04, T4.05
- **Docs afetados:** [09-observability.md](../architecture/09-observability.md), [AGENTS.md](../../AGENTS.md)

## Contexto

Em arquiteturas orientadas a eventos e CQRS, o uso indisciplinado de logs gera dois problemas graves em produção:
1. **Explosão de custo de ingestão e armazenamento (Loki, Datadog, CloudWatch, Elastic):** logar início/meio/fim dentro de Controllers, Use Cases e Repositories gera de 5 a 15 linhas por requisição HTTP, somadas a milhões de linhas inúteis de `GET /health/*` e `GET /metrics`, além de bodies completos e stack traces para erros de negócio comuns (4xx).
2. **Baixa relação sinal-ruído na investigação de incidentes:** informações da mesma operação ficam fragmentadas em várias linhas com formatos diferentes, ou o time sobe `LOG_LEVEL=warn` em produção para cortar custos e perde visibilidade sobre operações de escrita (Commands) e falhas de negócio.

Precisamos de uma estratégia onde **cada linha de log emitida em produção tenha alto valor semântico e custo previsível**.

## Opções consideradas

### Opção A — Logs espalhados por camada + `LOG_LEVEL=warn` em produção
- ✅ Simples de escrever inicialmente.
- ❌ Em `info` o custo explode; em `warn` perde-se o histórico de Commands, auditoria operacional e métricas derivadas de logs. Erros costumam ser logados em duplicidade (no repositório, no use case e no exception filter).

### Opção B — Canonical Log Lines (Wide Events) nas fronteiras + Sampling inteligente + `debug` restrito em Use Cases
- ✅ **1 unidade de trabalho = 1 linha de log rica (Wide Event):** toda requisição HTTP ou mensagem Kafka produz **uma única linha canônica** no encerramento, enriquecida ao longo da execução via `AsyncLocalStorage` (`traceId`, `spanId`, `tenantId`, `userId`, `command`/`query`, `domainError.code`, `durationMs`, `dbQueriesCount`).
- ✅ **Controle drástico de volume e custo:**
  - Rotas de infraestrutura (`/health/live`, `/health/ready`, `/metrics`) são silenciadas quando retornam `2xx`.
  - **Sampling diferenciado no coletor/interceptor:** 100% dos **Commands** (mutações), 100% dos erros (`4xx`/`5xx`) e 100% das requisições lentas (`durationMs > LOG_SLOW_THRESHOLD_MS`) são logados; **Queries (`GET` 2xx rápidas)** sofrem amostragem configurável (`LOG_READ_SAMPLE_RATE`, ex.: `1.0` em dev, `0.1` em prod).
  - Erros de negócio esperados (`Either` `Left` → 4xx) **não** geram stack trace nem nível `error`.
- ✅ **Flexibilidade para diagnóstico:** Use Cases podem usar `LoggerPort.debug()` (via contrato abstrato em `shared/core`) para inspeção pontual quando `LOG_LEVEL=debug`, sem poluir produção (`LOG_LEVEL=info`).
- ❌ Exige um `RequestLogContext` (`AsyncLocalStorage`) para que camadas internas possam anexar metadados (ex.: `organizationId`, `invoiceId`, `errorCode`) à linha canônica sem emitir novas linhas.

## Decisão

Adotar a **Opção B**:

### 1. Os 4 lugares estratégicos onde logs `info`/`warn`/`error` existem
Logs de nível `info` ou superior **só podem ser emitidos nas fronteiras de infraestrutura**:
1. **Fronteira HTTP (`CanonicalHttpLogInterceptor` + `GlobalDomainExceptionFilter`):** emite **1 única linha** ao finalizar a resposta (`http.request.completed`), contendo método, rota parametrizada (`route: '/v1/organizations/:id'`), `statusCode`, `durationMs`, `userId`, `tenantId` e, se houve `Left(DomainError)`, `errorCode` e `i18nKey` (sem stack trace). Desativa o auto-log padrão de entrada/saída do Fastify.
2. **Fronteira de Mensageria (`BaseProjector`, `BaseSubscriber`, `OutboxRelayWorker`):**
   - `BaseProjector` / `BaseSubscriber`: emite **1 linha por evento consumido** (`kafka.event.processed`, `kafka.event.skipped_idempotent`, `kafka.event.retry` ou `kafka.event.dlq`) com `topic`, `eventId`, `eventName`, `consumerGroup`, `durationMs` e `attempt`.
   - `OutboxRelayWorker`: loga apenas lotes com falha ou métricas agregadas de ciclo (`debug`), nunca 1 linha `info` por evento individual republicado em operação normal.
3. **Fronteira de Integrações e Resiliência (`ResilienceRegistry`):** emite log apenas em **transições de estado ou anomalias** (`resilience.circuit_breaker.opened`, `half_open`, `closed`, `resilience.retry.scheduled`, `resilience.timeout`), com `integration`, `operation`, `attempt` e `durationMs`. Chamadas externas `2xx` normais são medidas por spans OTel e métricas Prometheus, não por linhas de log extras.
4. **Ciclo de Vida do Processo (`main.ts` / `main.worker.ts`):** `app.bootstrap.completed`, `app.shutdown.initiated`, `app.shutdown.completed` e falhas fatais de boot (`EnvModule` / conexão inicial).

### 2. Uso de Logger em `domain/` e `application/`
- **`domain/`:** zero Logger (continua 100% TypeScript puro).
- **`application/` (Use Cases):**
  - Nunca emite `info`, `warn` ou `error` (o resultado `Either<DomainError, T>` já informa a fronteira, que loga o evento canônico uma única vez).
  - Pode enriquecer o evento canônico atual via `LogContextPort.set({ ... })` (ex.: anexar `planId`, `webhookEventId`) ou chamar `LoggerPort.debug('...', meta)` para diagnóstico detalhado em desenvolvimento/troubleshooting (custo zero em produção onde `LOG_LEVEL=info`).
- **`infra/` (Repositories / Adapters):** nunca faz `logger.error` antes de relançar ou traduzir uma exceção (**proibido log-and-rethrow**); deixa a fronteira logar uma única vez com a causa completa.

### 3. Taxonomia estrita de severidade
| Nível | Quando usar | Ação esperada |
|---|---|---|
| `debug` | Passos internos de Use Cases, queries/lotes normais do Outbox Relay, payloads sanitizados em dev | Desligado em prod (`LOG_LEVEL=info`); ativado sob demanda |
| `info` | Canonical log de Request HTTP `2xx`/`3xx`/`4xx` esperado (ex.: `400`, `404`, `409`, `422`), evento Kafka processado | Telemetria operacional normal (com sampling para `GET` 2xx rápidas) |
| `warn` | `401`/`403`/`429` (segurança/rate limit), evento Kafka ignorado por idempotência, retry de integração ou de consumer, request lenta (`> LOG_SLOW_THRESHOLD_MS`) | Atenção / investigação preventiva (100% retido, sem sampling) |
| `error` | HTTP `5xx`, exceção não tratada, mensagem enviada para **DLQ**, **Circuit Breaker aberto**, falha de infra (DB/Redis/Kafka indisponível) | Alerta imediato para engenharia (inclui `err.stack` e `cause`, 100% retido) |
| `fatal` | Falha na validação de env no boot ou perda irrecuperável de processo | Processo encerra imediatamente |

### 4. Regras de controle de custo e higiene de dados
1. **Silenciamento de rotas de saúde/métricas:** `/health/live`, `/health/ready` e `/metrics` não geram log quando `statusCode < 400`.
2. **Tail-based Sampling de leitura em HTTP:** controlado por variáveis de ambiente no `EnvModule`:
   - `LOG_LEVEL` (`info` default em prod, `debug` em dev, `silent` em test).
   - `LOG_READ_SAMPLE_RATE` (`1.0` default em dev; ex.: `0.1` = 10% em prod): aplica-se **somente** a requisições `GET`/`HEAD` com `statusCode < 400` e `durationMs <= LOG_SLOW_THRESHOLD_MS`.
   - `LOG_SLOW_THRESHOLD_MS` (`500` ms default): qualquer requisição acima desse tempo ignora o sampling e é logada como `warn` (`slow: true`).
   - Mutação (`POST`, `PUT`, `PATCH`, `DELETE`), respostas `>= 400` e logs `warn`/`error` têm **100% de retenção** (nunca sofrem sampling).
3. **Proibição de bodies inteiros e truncamento:** o logger não serializa `req.body`, `res.body` nem headers brutos; strings em metadados são truncadas em `512` caracteres e arrays limitados aos primeiros `10` itens.
4. **Cardinalidade de labels no Loki (`otel-lgtm` / produção):** apenas campos de baixa cardinalidade (`service`, `env`, `level`) viram stream labels indexados; campos de alta cardinalidade (`traceId`, `spanId`, `tenantId`, `userId`, `requestId`, `eventId`) ficam no JSON estruturado / Structured Metadata do Loki.

## Consequências

- **Positivas:** redução de 80%–95% no volume e custo de logs em produção sem perder 1 único Command, erro, lentidão ou evento de segurança; zero duplicação de erros; cada linha tem `event` padronizado (`http.request.completed`, `kafka.event.processed`, etc.) fácil de filtrar no Grafana.
- **Negativas / trade-offs aceitos:** desenvolvedores e agentes precisam usar `LogContextPort` para adicionar atributos ao log da requisição em vez de espalhar `logger.info` pelo meio do código.
- **Ações decorrentes:**
  - Atualizar [09-observability.md](../architecture/09-observability.md) com a arquitetura de Canonical Log Lines, schema JSON, tabela de severidade e variáveis de sampling.
  - Atualizar escopo de `T3.08`, `T3.10`, `T4.04` e `T4.05` no `ROADMAP.md` para referenciar o [ADR-0013](./0013-estrategia-de-logging-canonical-logs-e-custo.md).
  - Adicionar as regras de logging no `AGENTS.md`.

## Regras para a IA

1. **Proibido `logger.info`, `logger.warn` ou `logger.error` dentro de `domain/`, `application/` (Use Cases) e Repositories:** em Use Cases, use apenas `LoggerPort.debug()` (para diagnóstico) ou `LogContextPort.set({ ... })` para enriquecer o Canonical Log da fronteira.
2. **Proibido *log-and-rethrow*:** nunca capture um erro apenas para dar `logger.error` e relançá-lo (ou retornar `Left`). Deixe a fronteira (`GlobalDomainExceptionFilter` ou `BaseProjector`/`BaseSubscriber`) logar uma única vez.
3. **Erros de domínio (`Either` `Left` / 4xx) não são `error` e não têm stack trace:** são registrados no Canonical Log com `errorCode` e `i18nKey` em nível `info` (ou `warn` para `401`/`403`/`429`). Nível `error` é exclusivo para `5xx`, exceções não tratadas, DLQ e Circuit Breaker aberto.
4. **Todo log emitido nas fronteiras deve conter o campo `event` em dot-notation** (ex.: `http.request.completed`, `kafka.event.processed`, `kafka.event.dlq`, `resilience.circuit_breaker.opened`) e nunca incluir `req.body` ou payloads brutos de terceiros.

