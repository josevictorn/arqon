# ADR-0011: Escopo da infraestrutura local (Docker Compose)

- **Status:** Aceito
- **Data:** 2026-10-31
- **Decisores:** José Victor
- **Tasks relacionadas:** T1.06, T3.11
- **Docs afetados:** [11-code-quality.md](../architecture/11-code-quality.md), [01-tech-stack.md](../architecture/01-tech-stack.md)

## Contexto

O stack completo (Postgres, Mongo, Redis, Kafka KRaft, Schema Registry, Mailpit, MinIO, OTel Collector e um backend de traces) passa de 3–4 GB de RAM e demora a subir. Isso é **intencional**: o boilerplate quer demonstrar CQRS poliglota real. Mesmo assim, o DX diário e os testes não devem exigir tudo sempre.

## Opções consideradas

### Opção A — Um único `docker-compose.yml`, tudo sempre ligado
- ❌ Lento e pesado, inclusive em loops curtos de desenvolvimento.

### Opção B — Compose com **profiles**
- `core` (padrão): postgres, mongodb, redis.
- `messaging`: kafka, schema-registry (+ UI opcional, ex.: Redpanda Console / Kafka UI).
- `mail-storage`: mailpit, minio.
- `observability`: `grafana/otel-lgtm` (OTel Collector + Loki + Tempo + Prometheus + Grafana).
- `full`: todos.
- ✅ Cada task sobe só o que precisa; os testes de integração declaram suas dependências.

### Opção C — Testcontainers nos testes de integração/e2e
- ✅ Isolamento total, CI simples.
- ❌ Mais lento por suíte; no Mac exige Docker funcionando para os testes.

## Decisão

Adotar a **Opção B (Docker Compose com profiles)** para desenvolvimento e **reuso do compose nos testes** (com schemas isolados no PostgreSQL e databases isolados no MongoDB por worker).

Confirmado explicitamente: **PostgreSQL + MongoDB + Redis + Kafka (KRaft) + Schema Registry fazem parte obrigatória do núcleo arquitetural do boilerplate** (CQRS poliglota real), organizados nos profiles:
- `core`: PostgreSQL, MongoDB (replica set de 1 nó), Redis/Valkey.
- `messaging`: Apache Kafka (KRaft) + Schema Registry.
- `mail-storage`: Mailpit + MinIO.
- `observability`: `grafana/otel-lgtm`.
- `full`: todos os serviços acima.

## Regras para a IA

1. Todo serviço do compose tem `healthcheck`; scripts dependem de `service_healthy`.
2. Portas e credenciais vêm de `.env.example`; nada hardcoded no código.

