# Registro de Decisões Arquiteturais (ADRs)

Este é o **lugar único** para entender *por que* o boilerplate é como é. Leia o ADR antes de questionar uma escolha; para mudar uma decisão, crie um novo ADR que substitua o anterior.

- **Template:** [`_template.md`](./_template.md)
- **Como escrever:** skill [`write-adr`](../../.agents/skills/write-adr/SKILL.md)
- **Regra de ouro:** um ADR **Aceito** prevalece sobre `docs/architecture/*`. Um ADR **Proposto** bloqueia as tasks que dependem dele.

## Índice

| # | Decisão | Status | Bloqueia | Data |
|---|---|---|---|---|
| [0001](./0001-registrar-decisoes-com-adrs.md) | Registrar decisões com ADRs | ✅ Aceito | — | 2026-10-30 |
| [0002](./0002-documentacao-e-fluxo-para-ia.md) | Documentação e fluxo de trabalho para IA | ✅ Aceito | — | 2026-10-30 |
| [0003](./0003-runtime-versoes-e-package-manager.md) | Runtime, versões-base e package manager | ✅ Aceito | — | 2026-10-30 |
| [0004](./0004-cliente-kafka.md) | Cliente Kafka (`@confluentinc/kafka-javascript`) | ✅ Aceito | — | 2026-10-31 |
| [0005](./0005-biblioteca-de-resiliencia.md) | Biblioteca de resiliência (`cockatiel` + `@Resilient`) e Provider Factory sem fallback automático | ✅ Aceito | — | 2026-10-31 |
| [0006](./0006-observabilidade.md) | Observabilidade: 100% OpenTelemetry + Pino + Prometheus + Grafana (`otel-lgtm`) | ✅ Aceito | — | 2026-10-31 |
| [0007](./0007-outbox-relay.md) | Outbox Relay: `LISTEN / NOTIFY` + Fallback Polling de 60s (`FOR UPDATE SKIP LOCKED`) | ✅ Aceito | — | 2026-10-31 |
| [0008](./0008-idempotencia-de-consumers.md) | Idempotência co-localizada com o efeito (`BaseProjector` no Mongo + `processed_events` no PG) | ✅ Aceito | — | 2026-10-31 |
| [0009](./0009-domain-events-e-unit-of-work.md) | `UnitOfWork` com `AsyncLocalStorage` + Domain Events na tx + `addIntegrationEvent` no Outbox | ✅ Aceito | — | 2026-10-31 |
| [0010](./0010-enforcement-de-arquitetura.md) | Enforcement automático de arquitetura (`dependency-cruiser` + testes) | ✅ Aceito | — | 2026-10-31 |
| [0011](./0011-infraestrutura-local.md) | Infraestrutura local: Docker Compose com profiles (`core`, `messaging`, `mail-storage`, `observability`, `full`) | ✅ Aceito | — | 2026-10-31 |
| [0012](./0012-inicializacao-de-novos-projetos.md) | Inicialização de novos projetos (`create-arqon-app` + `pnpm init:project`) | ✅ Aceito | — | 2026-11-01 |

Legenda: ✅ Aceito · ⏳ Proposto · ❌ Rejeitado · ♻️ Substituído

## Perguntas abertas (viram ADR quando a task correspondente se aproximar)

| Tema | Pergunta | Quando decidir |
|---|---|---|
| IDs de entidades | UUIDv7 para tudo (entidades + eventos)? Gerado no domínio ou no banco? | Antes de T2.02 |
| Formato no Schema Registry | JSON Schema, Avro ou Protobuf? (Recomendação: JSON Schema, gerado a partir de Zod) | Antes de T4.02 |
| Envelope de Integration Event | Campos obrigatórios e headers Kafka | Antes de T2.05 |
| Algoritmo JWT | RS256 ou EdDSA (Ed25519)? Rotação de chaves / JWKS? | Antes de T5.01 |
| Isolamento multi-tenant no Postgres | Só `organizationId` na aplicação ou também Row-Level Security? | Antes de T8.01 |
| Tenant ativo | `activeTenantId` no JWT (exige reemitir token ao trocar de org) ou header `X-Organization-Id` validado por request? | Antes de T5.06 |
| Nome do evento de pagamento | O blueprint usa `billing.invoice.paid.v1` (§5.2) **e** `billing.subscription.paid.v1` (§12). Qual (ou ambos)? | Antes de T7.05 |

