# ADR-0006: Stack de observabilidade — OpenTelemetry + Pino + Prometheus + Grafana (otel-lgtm)

- **Status:** Aceito
- **Data:** 2026-10-31
- **Decisores:** José Victor
- **Tasks relacionadas:** T1.06, T3.08, T4.03
- **Docs afetados:** [09-observability.md](../architecture/09-observability.md), [01-tech-stack.md](../architecture/01-tech-stack.md), [T1.06-docker-compose.md](../roadmap/tasks/T1.06-docker-compose.md)

## Contexto

O blueprint original listava `@nestjs/observe` junto com `nestjs-pino`, OpenTelemetry SDK e Prometheus. O `@nestjs/observe` usa um protocolo/SDK próprio voltado para um dashboard específico, enquanto OpenTelemetry + Prometheus + Grafana (stack LGTM: Loki, Grafana, Tempo, Mimir/Prometheus) são padrões abertos CNCF/W3C, sem vendor lock-in e com a imagem unificada `grafana/otel-lgtm` para desenvolvimento local.

Queremos ter exatamente a mesma visibilidade de APM (waterfall de traces `HTTP → Guard/UseCase → Prisma → Outbox → Kafka → Projector → MongoDB`, correlação `Log ↔ Trace` em 1 clique e métricas de negócio/resiliência) tanto em dev local quanto em produção, sem duplicar instrumentação.

## Opções consideradas

### Opção A — OTel + Pino + Prometheus + `@nestjs/observe` opcional
- ❌ Manter duas instrumentações traz complexidade desnecessária.

### Opção B — `@nestjs/observe` como APM principal
- ❌ Alto vendor lock-in; protocolo próprio fora do padrão OTLP.

### Opção C — 100% Padrão Aberto: OpenTelemetry SDK + `nestjs-pino` + Prometheus + `grafana/otel-lgtm` (sem `@nestjs/observe`)
- ✅ Zero vendor lock-in: em produção aponta `OTEL_EXPORTER_OTLP_ENDPOINT` para qualquer backend compatível (Grafana Cloud, self-hosted LGTM, Datadog, Honeycomb, New Relic, etc.).
- ✅ Em dev local, um único container (`grafana/otel-lgtm`) entrega OTel Collector + Loki + Tempo + Prometheus + Grafana UI (com dashboard de APM provisionado no repositório).
- ✅ Tracing distribuído ponta a ponta via padrão W3C `traceparent` (HTTP → Postgres/Outbox → Kafka headers → Projector/MongoDB).

## Decisão

Adotar a **Opção C**: padronizar 100% em **OpenTelemetry SDK + `nestjs-pino` + Prometheus (`prom-client`) + Grafana (`grafana/otel-lgtm` em dev)**, removendo o `@nestjs/observe` do stack.

## Consequências

- **Positivas:** stack único e aberto em dev e prod; correlação nativa entre Logs (Loki), Traces (Tempo) e Métricas (Prometheus) no Grafana; zero dependência de serviço proprietário.
- **Ações decorrentes:**
  - Atualizar [01-tech-stack.md](../architecture/01-tech-stack.md) e [09-observability.md](../architecture/09-observability.md) removendo `@nestjs/observe`.
  - Na `T1.06`, usar a imagem `grafana/otel-lgtm` no profile `observability` do `docker-compose.yml` com dashboard de APM provisionado em `docker/grafana/`.

## Regras para a IA

1. Spans customizados usam exclusivamente `@opentelemetry/api`. Nunca instale nem importe `@nestjs/observe`.
2. Todo evento gravado na tabela `outbox_events` persiste o contexto W3C (`traceparent`), que o `OutboxRelayWorker` injeta nos headers do Kafka e o Consumer/Projector extrai para dar continuidade ao trace.
3. Logs só via logger Pino injetado (`nestjs-pino`); proibido `console.log` em `src/`.
4. Todo log carrega automaticamente `traceId`, `spanId`, `tenantId` e `userId` quando houver contexto; campos sensíveis (`password`, `token`, `authorization`, `creditCard`, `secret`) passam por `redact`.

