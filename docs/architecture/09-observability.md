> Extraído do blueprint original. Decisões que alteram este conteúdo vivem em [docs/decisions](../decisions/README.md) — **um ADR aceito prevalece sobre este texto**.

# 10. Observabilidade Full-Stack (OpenTelemetry + `nestjs-pino` + Prometheus + Grafana LGTM)

1. **Distributed Tracing (OpenTelemetry SDK — ver [ADR-0006](../decisions/0006-observabilidade.md))**:
   - O SDK do OpenTelemetry inicializa antes do NestJS (`instrumentation.ts`), instrumentando automaticamente **Fastify**, **NestJS Core (Controllers/Guards/Interceptors/Pipes)**, **Prisma (PostgreSQL)**, **MongoDB Driver**, **Redis (ioredis)** e **Kafka** (`@confluentinc/kafka-javascript` / propagação de `traceparent` via headers — ver [ADR-0004](../decisions/0004-cliente-kafka.md)).
   - Quando um Command grava um evento no `Outbox`, o `traceparent` atual é salvo junto no registro do Outbox. Quando o `OutboxRelayWorker` publica no Kafka e o **Projector** atualiza a View no **MongoDB**, o trace continua na mesma linha do tempo ponta a ponta no Grafana Tempo!
2. **Logs Estruturados (`nestjs-pino`)**:
   - Todo log inclui automaticamente `{ traceId, spanId, tenantId, userId, context }`, permitindo saltar do log para o trace em 1 clique no Grafana (Loki ↔ Tempo).
   - Dados sensíveis (`password`, `token`, `authorization`, `creditCard`) passam por `redact` automático no Pino.
3. **Métricas & Healthchecks (Prometheus + Grafana)**:
   - Endpoint `/metrics` para Prometheus (latência HTTP p95/p99, lag de sincronização dos Projectors MongoDB, taxa de abertura de Circuit Breakers, tamanho da fila do Outbox).
   - Endpoints `/health/live` e `/health/ready` verificando PostgreSQL, MongoDB, Redis e Kafka.
   - Em dev local, o container `grafana/otel-lgtm` entrega Collector, Loki, Tempo, Prometheus e Grafana com dashboard de APM provisionado.

