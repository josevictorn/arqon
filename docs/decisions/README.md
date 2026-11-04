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
| [0009](./0009-domain-events-e-unit-of-work.md) | `UnitOfWork` com `AsyncLocalStorage` + Domain Events na tx + `addIntegrationEvent` no Outbox | ✅ Aceito (complementado por 0025) | — | 2026-10-31 |
| [0010](./0010-enforcement-de-arquitetura.md) | Enforcement automático de arquitetura (`dependency-cruiser` + testes) | ✅ Aceito | — | 2026-10-31 |
| [0011](./0011-infraestrutura-local.md) | Infraestrutura local: Docker Compose com profiles (`core`, `messaging`, `mail-storage`, `observability`, `full`) | ✅ Aceito (♻️ parcialmente por 0021) | — | 2026-10-31 |
| [0012](./0012-inicializacao-de-novos-projetos.md) | Inicialização de novos projetos (`create-arqon-app` + `pnpm init:project`) | ✅ Aceito | — | 2026-11-01 |
| [0013](./0013-estrategia-de-logging-canonical-logs-e-custo.md) | Estratégia de logging: Canonical Log Lines (Wide Events), taxonomia e controle de custo | ✅ Aceito | — | 2026-11-01 |
| [0014](./0014-identificadores-uuidv7.md) | Padronizar identificadores com UUIDv7 gerados no domínio (`UniqueEntityID`) | ✅ Aceito | — | 2026-11-01 |
| [0015](./0015-jwt-assimetrico-eddsa-ed25519.md) | Assinatura de JWT assimétrica com EdDSA (Ed25519) via `jose` e Refresh Token Rotation | ✅ Aceito | — | 2026-11-01 |
| [0016](./0016-resolucao-tenant-ativo-por-requisicao.md) | Resolução do Tenant ativo por requisição (`:orgId` / `X-Organization-Id` validado no Redis) | ✅ Aceito | — | 2026-11-01 |
| [0017](./0017-isolamento-multi-tenant-rls.md) | Isolamento Multi-Tenant com Defesa em Profundidade (Aplicação + CASL + PostgreSQL RLS) | ✅ Aceito | — | 2026-11-01 |
| [0018](./0018-taxonomia-eventos-billing-e-catalogo-planos.md) | Taxonomia de eventos do `billing` (`invoice.paid` + `subscription.updated`) e catálogo `FREE` + `FLAT_RATE` extensível | ✅ Aceito | — | 2026-11-01 |
| [0019](./0019-envelope-integration-event.md) | Envelope padronizado de `IntegrationEvent` preenchido via `AsyncLocalStorage` | ✅ Aceito (complementado por 0023) | — | 2026-11-01 |
| [0020](./0020-schema-registry-json-schema.md) | Schema Registry com JSON Schema gerado automaticamente a partir dos contratos Zod | ✅ Aceito | — | 2026-11-01 |
| [0021](./0021-redpanda-e-rustfs-na-infra-local.md) | Infra local: Redpanda (Kafka API + Schema Registry) e RustFS (S3) no lugar de Kafka + Schema Registry separados e MinIO | ✅ Aceito | — | 2026-11-02 |
| [0022](./0022-politica-de-atualizacao-de-dependencias.md) | Atualização automática de dependências só em patch/minor (Dependabot); majors exigem ADR | ✅ Aceito | — | 2026-11-02 |
| [0023](./0023-semantica-de-schema-version.md) | `schemaVersion` é a revisão compatível dentro do tópico `.vN` (recomeça em 1 a cada novo `.vN`) | ✅ Aceito | — | 2026-11-03 |
| [0024](./0024-zod-fora-do-shared-core.md) | Zod fora de `src/shared/core`; schema Zod do envelope e `defineIntegrationEventContract` em `src/shared/contracts/events/` | ✅ Aceito | — | 2026-11-03 |
| [0025](./0025-dispatcher-de-domain-events-por-instancia.md) | Domain Events guardados no agregado + `DomainEventDispatcher` de instância (sem `DomainEvents` estático) | ✅ Aceito | — | 2026-11-03 |
| [0026](./0026-domain-error-nao-estende-error.md) | `DomainError` não estende `Error` (valor puro devolvido em `Left`, nunca lançado) | ✅ Aceito | — | 2026-11-03 |
| [0027](./0027-uuidv7-com-biblioteca-uuid.md) | Gerar UUIDv7 com a biblioteca `uuid` (monotônica), importada só por `UniqueEntityID` | ✅ Aceito | — | 2026-11-03 |
| [0028](./0028-verify-com-gate-de-cobertura.md) | `pnpm verify` roda `test:cov` com gate 100% de cobertura em `src/shared/core/**` | ✅ Aceito | — | 2026-11-03 |

Legenda: ✅ Aceito · ⏳ Proposto · ❌ Rejeitado · ♻️ Substituído

## Perguntas abertas (viram ADR quando a task correspondente se aproximar)

> Todas as perguntas arquiteturais iniciais foram decididas e convertidas nos ADRs 0001 a 0020. Novas decisões que surgirem durante a implementação das fases devem seguir a skill [`write-adr`](../../.agents/skills/write-adr/SKILL.md).

