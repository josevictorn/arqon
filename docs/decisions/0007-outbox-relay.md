# ADR-0007: Estratégia do Outbox Relay (`LISTEN / NOTIFY` + Fallback Polling de 60s com `FOR UPDATE SKIP LOCKED`)

- **Status:** Aceito
- **Data:** 2026-10-31
- **Decisores:** José Victor
- **Tasks relacionadas:** T3.05, T4.03
- **Docs afetados:** [04-cqrs-and-events.md](../architecture/04-cqrs-and-events.md)

## Contexto

O blueprint descrevia "Polling / CDC (a cada 500ms)" com `SELECT ... FOR UPDATE SKIP LOCKED`. Polling fixo a cada `500ms` gera `172.800` queries/dia mesmo com o sistema ocioso (o que encarece bancos serverless e impede *scale-to-zero*), enquanto CDC (Debezium + Kafka Connect) exige mais containers pesados e complexidade operacional.

Precisávamos de uma solução com latência de milissegundos, custo mínimo de queries em repouso, garantia de ordenação por agregado no Kafka e resiliência a falhas.

## Opções consideradas

### Opção A — Polling cego a cada 500ms com `FOR UPDATE SKIP LOCKED`
- ✅ Simples e sem infraestrutura extra.
- ❌ Faz `172.800` queries/dia mesmo sem tráfego; latência média de `250ms–500ms`.

### Opção B — CDC com Debezium (Kafka Connect + replicação lógica)
- ✅ Baixa latência, sem polling, ordem do WAL preservada.
- ❌ Mais containers pesados (Kafka Connect + Debezium), mais configuração operacional e atrito em testes e2e.

### Opção C — `LISTEN / NOTIFY` + Fallback Polling de 60s com `FOR UPDATE SKIP LOCKED`
- ✅ **Latência de tempo real (`~2ms–10ms`):** o PostgreSQL notifica o worker via socket TCP assim que a transação do Command faz `COMMIT`.
- ✅ **Redução de 99,2% nas queries ociosas:** cai de `172.800` queries/dia para `~1.440` queries/dia (1 checagem por minuto como fallback de segurança).
- ✅ Zero infraestrutura extra (100% PostgreSQL nativo).

## Decisão

Adotar a **Opção C (`LISTEN / NOTIFY` + Fallback Polling de 60s com `FOR UPDATE SKIP LOCKED`)** com a seguinte especificação:

1. **Despertar Instantâneo via `LISTEN / NOTIFY`:**
   - Ao inserir eventos em `outbox_events` dentro da transação do `PrismaUnitOfWork` (ou via trigger `AFTER INSERT ON outbox_events`), é executado `pg_notify('outbox_new_event', '')` (que o PostgreSQL só entrega após o `COMMIT` da transação).
   - O `OutboxRelayWorker` mantém uma conexão dedicando `LISTEN outbox_new_event` e aplica *coalescing/debounce* (`isProcessing`): se 500 sinais chegarem simultaneamente, ele executa um único ciclo de drenagem em lotes de 100 até esvaziar a fila.
2. **Fallback Polling Espaçado (a cada 60s) + Índice Parcial:**
   - Um timer de segurança roda a cada `60s` (e imediatamente no boot do worker) executando a mesma rotina de drenagem para capturar eventos inseridos durante um restart do worker ou eventos agendados para retry (`next_attempt_at <= NOW()`).
   - Query de drenagem: `SELECT * FROM outbox_events WHERE status = 'PENDING' AND next_attempt_at <= NOW() ORDER BY occurred_at ASC LIMIT 100 FOR UPDATE SKIP LOCKED`.
   - Índice parcial no PostgreSQL: `CREATE INDEX idx_outbox_pending ON outbox_events (next_attempt_at, occurred_at) WHERE status = 'PENDING'`.
3. **Garantia de Ordem no Kafka:**
   - A `key` da mensagem publicada no Kafka é sempre o `aggregateId`, garantindo que todos os eventos de um mesmo agregado caiam na mesma partição em ordem estrita.
4. **Ciclo de Vida, Retries e Limpeza:**
   - Status: `PENDING` → `PUBLISHED` | `FAILED`.
   - Em caso de falha ao publicar, incrementa `attempts`, grava `lastError` e reagenda `nextAttemptAt` com backoff exponencial. Após o limite máximo de tentativas, marca como `FAILED` e incrementa métrica no Prometheus (`outbox_failed_events_total`).
   - Um job de limpeza remove registros `PUBLISHED` mais antigos que `OUTBOX_RETENTION_DAYS` (ex.: 7 dias).
5. **Topologia de Execução (`main.ts` vs `main.worker.ts`):**
   - O Relay e os Consumers do Kafka possuem um entrypoint dedicado (`main.worker.ts`) para escalar separadamente da API HTTP em produção.
   - Em desenvolvimento local e testes E2E, a flag `RUN_WORKERS_IN_API=true` permite subir API + Worker no mesmo processo para máxima DX.

## Consequências

- **Ações decorrentes:**
  - A tabela `OutboxEvent` (T3.05) nasce com as colunas `id`, `aggregateId`, `topic`, `eventVersion`, `payload`, `headers` (`traceparent`), `status`, `attempts`, `lastError`, `nextAttemptAt`, `occurredAt`, `publishedAt`, o índice parcial e a notificação no canal `outbox_new_event`.
  - Atualizar [04-cqrs-and-events.md](../architecture/04-cqrs-and-events.md) e `T4.03` no `ROADMAP.md`.

## Regras para a IA

1. Nenhum código publica no Kafka diretamente a partir de um Command; tudo passa pela tabela `outbox_events` dentro da transação do `UnitOfWork`.
2. O `OutboxRelayWorker` desperta por `LISTEN outbox_new_event` com fallback de `60s` (configurável via env `OUTBOX_FALLBACK_POLL_MS=60000`), nunca por polling curto de 500ms.
3. O `OutboxRelayWorker` usa sempre `aggregateId` como `key` da mensagem no Kafka e propaga os `headers` (`traceparent`, `eventId`, `eventVersion`).
4. O relay não carrega lógica de negócio; ele apenas serializa/valida no Schema Registry e transporta.

