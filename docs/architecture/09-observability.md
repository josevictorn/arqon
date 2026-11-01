> Extraído do blueprint original. Decisões que alteram este conteúdo vivem em [docs/decisions](../decisions/README.md) — **um ADR aceito prevalece sobre este texto**.

# 10. Observabilidade Full-Stack (OpenTelemetry + `nestjs-pino` + Prometheus + Grafana LGTM)

1. **Distributed Tracing (OpenTelemetry SDK — ver [ADR-0006](../decisions/0006-observabilidade.md))**:
   - O SDK do OpenTelemetry inicializa antes do NestJS (`instrumentation.ts`), instrumentando automaticamente **Fastify**, **NestJS Core (Controllers/Guards/Interceptors/Pipes)**, **Prisma (PostgreSQL)**, **MongoDB Driver**, **Redis (ioredis)** e **Kafka** (`@confluentinc/kafka-javascript` / propagação de `traceparent` via headers — ver [ADR-0004](../decisions/0004-cliente-kafka.md)).
   - Quando um Command grava um evento no `Outbox`, o `traceparent` atual é salvo junto no registro do Outbox. Quando o `OutboxRelayWorker` publica no Kafka e o **Projector** atualiza a View no **MongoDB**, o trace continua na mesma linha do tempo ponta a ponta no Grafana Tempo!
2. **Logs Estruturados e Estratégia de Custo (`nestjs-pino` — ver [ADR-0013](../decisions/0013-estrategia-de-logging-canonical-logs-e-custo.md))**:
   - **Canonical Log Lines (Wide Events):** em vez de espalhar múltiplos `logger.info` por Controller, Use Case e Repository, cada unidade de trabalho emite **1 única linha canônica rica** no encerramento da fronteira, enriquecida durante a execução via `LogContextPort` (`AsyncLocalStorage`).
   - **Os 4 pontos estratégicos de emissão (`info`/`warn`/`error`):**
     1. **Fronteira HTTP (`CanonicalHttpLogInterceptor` + `GlobalDomainExceptionFilter`):** 1 log `event: "http.request.completed"` por requisição (com `method`, `route`, `statusCode`, `durationMs`, `tenantId`, `userId`, `errorCode`, `slow`). Auto-log bruto de entrada/saída do Fastify fica desativado.
     2. **Fronteira Kafka/Outbox (`BaseProjector`, `BaseSubscriber`, `OutboxRelayWorker`):** 1 log por mensagem consumida (`event: "kafka.event.processed" | "kafka.event.skipped_idempotent" | "kafka.event.retry" | "kafka.event.dlq"`). O `OutboxRelayWorker` só loga `info`/`error` em falhas; lotes vazios ou normais ficam em `debug`.
     3. **Fronteira de Resiliência (`ResilienceRegistry`):** loga apenas transições de Circuit Breaker (`resilience.circuit_breaker.opened | half_open | closed`), retries agendados (`resilience.retry.scheduled`) e timeouts (`resilience.timeout`).
     4. **Ciclo de Vida (`main.ts` / `main.worker.ts`):** startup, graceful shutdown e erros fatais de boot.
   - **Regras por camada:**
     - `domain/`: zero Logger.
     - `application/` (Use Cases): permitido apenas `LoggerPort.debug()` (desligado em prod onde `LOG_LEVEL=info`) e `LogContextPort.set({ ... })` para anexar atributos de negócio à linha canônica da requisição/evento.
     - `infra/` (Repositories/Adapters): proibido *log-and-rethrow* (a fronteira loga uma única vez).
   - **Severidade semântica estrita:**
     - `4xx` de negócio (`Either` `Left`) **não é `error`** e não serializa stack trace: sai no Canonical Log como `info` (ou `warn` em `401`/`403`/`429`).
     - `error` é exclusivo para `5xx`, exceções não tratadas, envio para **DLQ**, **Circuit Breaker aberto** ou queda de infra.
   - **Controle de volume e custo em produção:**
     - **Silenciamento de rotas de infra:** `/health/live`, `/health/ready` e `/metrics` não geram log quando `statusCode < 400`.
     - **Tail-based Sampling de leituras:** Commands (mutações), erros (`>= 400`), `warn`/`error` e requisições lentas (`durationMs > LOG_SLOW_THRESHOLD_MS`, default `500ms`) têm **100% de retenção**; Queries `GET`/`HEAD` rápidas `2xx` respeitam `LOG_READ_SAMPLE_RATE` (`1.0` em dev, ex.: `0.1` em prod).
     - **Higiene e Redact:** todo log inclui `{ traceId, spanId, tenantId, userId, event }`; nunca loga `req.body`/`res.body` brutos; strings em metadados são truncadas em 512 chars; dados sensíveis (`password`, `token`, `authorization`, `creditCard`, `secret`) passam por `redact` no Pino.
     - **Baixa cardinalidade no Loki:** apenas `service`, `env` e `level` são indexados como stream labels; `traceId`, `tenantId`, `userId` e `event` permanecem como JSON / Structured Metadata.
3. **Métricas & Healthchecks (Prometheus + Grafana)**:
   - Endpoint `/metrics` para Prometheus (latência HTTP p95/p99, lag de sincronização dos Projectors MongoDB, taxa de abertura de Circuit Breakers, tamanho da fila do Outbox).
   - Endpoints `/health/live` e `/health/ready` verificando PostgreSQL, MongoDB, Redis e Kafka.
   - Em dev local, o container `grafana/otel-lgtm` entrega Collector, Loki, Tempo, Prometheus e Grafana com dashboard de APM provisionado.

