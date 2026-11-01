# Roadmap de Implementação

Fonte única do **que falta fazer, em que ordem e com qual status**. Substitui o §14 do blueprint original.

- Tasks com arquivo detalhado → link na coluna ID. Sem link = ainda não detalhada (é detalhada *just-in-time* ao iniciar a fase, via skill [`detail-task`](../../.agents/skills/detail-task/SKILL.md)).
- **Bloqueios:** uma task não começa enquanto um ADR listado nela estiver ⏳ Proposto, ou enquanto uma dependência não estiver ✅.
- Status: ☐ A fazer · 📝 Detalhada · 🔄 Em andamento · 👀 Em review · ✅ Concluída · ⛔ Bloqueada

```mermaid
flowchart LR
  F0["F0 Docs e decisões"] --> F1["F1 Fundação e tooling"]
  F1 --> F2["F2 shared/core"]
  F2 --> F3["F3 shared/infra"]
  F3 --> F4["F4 Mensageria e Outbox"]
  F3 --> F5["F5 Gateways e integrações"]
  F4 --> F6["F6 iam (referência)"]
  F5 --> F6
  F6 --> F7["F7 billing"]
  F7 --> F8["F8 tenancy"]
  F8 --> F9["F9 notifications"]
  F8 --> F10["F10 audit"]
  F9 --> F11["F11 Hardening"]
  F10 --> F11
```

---

## F0 — Documentação e decisões

**Saída da fase:** estrutura de docs criada; ADRs que bloqueiam a F1 decididos.

| ID | Task | Depende de | ADRs | Status |
|---|---|---|---|---|
| T0.01 | Estrutura de docs, AGENTS.md, ADRs iniciais, roadmap, specs, skills de workflow | — | 0001, 0002 | ✅ |
| T0.02 | **(Humano)** Decidir ADRs iniciais (0003 a 0011 todos ✅ Aceitos) | T0.01 | 0003–0011 | ✅ |

## F1 — Fundação e tooling

**Saída da fase:** `pnpm verify` roda lint + typecheck + arch + testes no CI; `docker compose --profile core up` saudável; `GET /health/live` responde.

| ID | Task | Depende de | ADRs | Status |
|---|---|---|---|---|
| [T1.01](./tasks/T1.01-scaffold-nestjs-fastify.md) | Scaffold NestJS + Fastify + TS strict + pnpm + aliases + `/health/live` | T0.02 | 0003 | 📝 |
| [T1.02](./tasks/T1.02-biome-ultracite.md) | Biome + Ultracite + scripts de lint/format | T1.01 | 0003 | 📝 |
| [T1.03](./tasks/T1.03-vitest-setup.md) | Vitest + SWC: projetos unit / int / e2e + setups | T1.01 | 0003 | 📝 |
| [T1.04](./tasks/T1.04-lefthook-commitlint.md) | Lefthook (pre-commit, commit-msg, pre-push) + Conventional Commits | T1.02, T1.03 | — | 📝 |
| [T1.05](./tasks/T1.05-architecture-enforcement.md) | dependency-cruiser com as regras de camadas/módulos + `pnpm arch:check` | T1.01 | 0010 | 📝 |
| [T1.06](./tasks/T1.06-docker-compose.md) | Docker Compose com profiles e healthchecks + `.env.example` | T1.01 | 0003, 0011 | 📝 |
| [T1.07](./tasks/T1.07-ci-pipeline.md) | CI (GitHub Actions): `verify` + int/e2e com services | T1.02–T1.06 | — | 📝 |
| [T1.08](./tasks/T1.08-agents-md-refresh.md) | Atualizar comandos reais no AGENTS.md + AGENTS.md aninhados por camada | T1.07 | 0002 | 📝 |

## F2 — `src/shared/core` (blocos de DDD, zero framework)

**Saída da fase:** blocos com 100% de cobertura unitária; `arch:check` garante zero import de framework.

| ID | Task | Depende de | ADRs | Status |
|---|---|---|---|---|
| T2.01 | `Either` (left/right + helpers) + `DomainError` + `common-errors` | F1 | — | ☐ |
| T2.02 | `UniqueEntityID` (UUIDv7?) + `Entity` + `ValueObject` | T2.01 | pergunta "IDs" | ☐ |
| T2.03 | `AggregateRoot` + `DomainEvent` + registro/dispatch de domain events | T2.02 | 0009 | ☐ |
| T2.04 | `WatchedList` | T2.02 | — | ☐ |
| T2.05 | Envelope `IntegrationEvent` versionado + convenção de tópicos + helper de definição de contrato (schema Zod + tipo) | T2.03 | 0008, pergunta "envelope" | ☐ |

## F3 — `src/shared/infra` (plataforma)

**Saída da fase:** app sobe com config validada, erros i18n em Problem Details, `/docs` (Scalar), Prisma + UoW + Outbox, Mongo, Redis, observabilidade, rate limit e resiliência; infra de testes isolados funcionando.

| ID | Task | Depende de | ADRs | Status |
|---|---|---|---|---|
| T3.01 | `EnvModule` (Zod), falha rápida no boot | F2 | — | ☐ |
| T3.02 | Camada HTTP: Fastify, Helmet, CORS, `GlobalDomainExceptionFilter` (RFC 7807), mapeamento `Either` → HTTP | T3.01 | — | ☐ |
| T3.03 | i18n (`en`, `pt-BR`) integrado ao filtro + teste que garante paridade de chaves | T3.02 | — | ☐ |
| T3.04 | Validação Zod (`nestjs-zod`) + OpenAPI + Scalar em `/docs` | T3.02 | 0003 | ☐ |
| T3.05 | `PrismaModule` + schema `OutboxEvent` + `PrismaUnitOfWork` (ALS) | T3.01 | 0007, 0009 | ☐ |
| T3.06 | `MongoReadModule` + `MongoReadService` + registro/sincronização de índices de views | T3.01 | — | ☐ |
| T3.07 | `RedisModule` + `CacheGateway` adapter + `DistributedLockService` | T3.01 | — | ☐ |
| T3.08 | Observabilidade: `nestjs-pino` (redact, contexto) + OTel `instrumentation.ts` + `/metrics` + `/health/ready` | T3.05–T3.07 | 0006 | ☐ |
| T3.09 | Rate limiting distribuído (Redis) por IP / usuário / tier | T3.07 | — | ☐ |
| T3.10 | `ResilienceModule` + `ResilienceRegistry` (`cockatiel`) + `@Resilient` + métricas de breaker | T3.08 | 0005 | ☐ |
| T3.11 | Infra de testes: schema PG / DB Mongo isolados por worker, limpeza do Redis, base de factories e fakes | T3.05–T3.07 | 0011 | ☐ |

## F4 — Mensageria, Outbox e BaseProjector

**Saída da fase:** teste e2e prova o pipeline Command fake → Outbox → Kafka → Projector → Mongo, com idempotência e DLQ.

| ID | Task | Depende de | ADRs | Status |
|---|---|---|---|---|
| T4.01 | Módulo Kafka: producer/consumer atrás de portas (`EventBusGateway`) | F3 | 0004 | ☐ |
| T4.02 | Schema Registry: registro/validação/serialização a partir dos contratos | T4.01, T2.05 | 0004, pergunta "formato" | ☐ |
| T4.03 | `OutboxRelayWorker` (`LISTEN/NOTIFY` + fallback 60s, entrypoint de worker) + propagação de `traceparent` | T4.01, T3.05 | 0007 | ☐ |
| T4.04 | Pipeline de consumo: retry com backoff + DLQ + métricas de lag | T4.01 | — | ☐ |
| T4.05 | Idempotência: `BaseProjector` (Mongo) + `BaseSubscriber` (`processed_events`) | T4.04 | 0008 | ☐ |
| T4.06 | Teste e2e do pipeline CQRS completo com um módulo `_example` descartável | T4.02–T4.05 | — | ☐ |

## F5 — Gateways compartilhados e integrações

**Saída da fase:** adapters reais + fakes para teste; autenticação/autorização base pronta.

| ID | Task | Depende de | ADRs | Status |
|---|---|---|---|---|
| T5.01 | `Argon2Hasher` + `JwtEncrypter` (chaves assimétricas) | F3 | pergunta "JWT" | ☐ |
| T5.02 | `S3StorageAdapter` (MinIO) + presigned URLs + `FakeStorage` | T3.10 | 0005 | ☐ |
| T5.03 | `NodemailerAdapter` (Mailpit) + templates i18n + `FakeMail` | T3.10, T3.03 | 0005 | ☐ |
| T5.04 | Payment: contrato + factory + Stripe adapter + ACL + `FakePaymentGateway` | T3.10 | 0005 | ☐ |
| T5.05 | Asaas adapter + ACL + resolução explícita do provedor na Factory | T5.04 | 0005 | ☐ |
| T5.06 | Auth infra: JWT guard, `@CurrentUser`, `@CurrentTenant`, `TenantAbilityFactory`, `PoliciesGuard` | T5.01, T3.07 | pergunta "tenant ativo" | ☐ |

## F6 — Módulo `iam` (módulo de referência)

**Saída da fase:** iam completo com testes nos 3 níveis; **skills e geradores extraídos e validados**. Spec: [iam](../modules/iam/spec.md).

| ID | Task | Depende de | ADRs | Status |
|---|---|---|---|---|
| T6.01 | Domínio: `User`, `Session`, `Email`, `Password`, erros + unit | F4, F5 | — | ☐ |
| T6.02 | `RegisterUserCommand` ponta a ponta (repo Prisma + mapper + controller + e2e) | T6.01 | 0009 | ☐ |
| T6.03 | `AuthenticateWithPassword` + `RefreshSessionToken` (rotação, reuso) | T6.02 | — | ☐ |
| T6.04 | `RequestPasswordReset` + `ResetPassword` | T6.02 | — | ☐ |
| T6.05 | `UpdateUserAvatarCommand` (storage) | T6.02 | — | ☐ |
| T6.06 | `UserProfileProjector` + `GetUserProfileQuery` | T6.02 | 0008 | ☐ |
| T6.07 | `IamFacade` + contrato em `shared/contracts` | T6.02 | — | ☐ |
| T6.08 | **Extrair skills + geradores** (create-module, create-command, create-query-projector, add-integration-event) e validar gerando um módulo dummy | T6.01–T6.07 | 0002 | ☐ |

## F7 — Módulo `billing`

Spec: [billing](../modules/billing/spec.md). **Primeiro módulo construído com as skills**: registrar atritos e melhorar as skills.

| ID | Task | Depende de | ADRs | Status |
|---|---|---|---|---|
| T7.01 | Domínio: `Plan`, `Subscription`, `Invoice`, `Money`, factory, `ProrationCalculator` | F6 | — | ☐ |
| T7.02 | Seed de planos + subscriber `tenancy.organization.created.v1` → assinatura Free | T7.01 | — | ☐ |
| T7.03 | `CreateCheckoutSessionCommand` | T7.01, T5.04 | — | ☐ |
| T7.04 | `ChangeSubscriptionPlanCommand` | T7.01 | — | ☐ |
| T7.05 | `ProcessPaymentWebhookCommand` (idempotente) | T7.01, T5.05 | pergunta "evento pagamento" | ☐ |
| T7.06 | `BillingOverviewProjector` + `GetBillingOverviewQuery` | T7.02 | 0008 | ☐ |
| T7.07 | `BillingFacade.checkFeatureQuota` | T7.01 | — | ☐ |

## F8 — Módulo `tenancy`

Spec: [tenancy](../modules/tenancy/spec.md).

| ID | Task | Depende de | ADRs | Status |
|---|---|---|---|---|
| T8.01 | Domínio: `Organization`, `Slug`, `Membership`, `WatchedList`, `Role`, `PermissionRule`, `RoleDomainFactory` + invariantes | F7 | pergunta "RLS" | ☐ |
| T8.02 | `CreateOrganizationCommand` | T8.01 | — | ☐ |
| T8.03 | Cargos customizados (create/update/delete) + invalidação de cache | T8.02 | — | ☐ |
| T8.04 | `AssignRolesToMember` + `TransferOwnership` | T8.02 | — | ☐ |
| T8.05 | `InviteMember` (BillingFacade) + `AcceptInvite` (UoW) + `CancelInvite` | T8.02, T7.07 | — | ☐ |
| T8.06 | CASL ponta a ponta: hidratação Redis, guard nível 1, `subject()` nível 2, testes de vazamento cross-tenant | T8.03, T5.06 | — | ☐ |
| T8.07 | `OrganizationMembersProjector` + `OrganizationRolesProjector` + queries | T8.02 | 0008 | ☐ |
| T8.08 | `TenancyFacade` | T8.02 | — | ☐ |

## F9 — Módulo `notifications`

| ID | Task | Depende de | ADRs | Status |
|---|---|---|---|---|
| T9.01 | Domínio + `SendNotification` / `MarkAsRead` | F8 | — | ☐ |
| T9.02 | `NotificationsInboxProjector` + `FetchUnreadNotificationsQuery` | T9.01 | 0008 | ☐ |
| T9.03 | Consumers: convite, falha de pagamento, reset de senha | T9.01, T5.03 | 0008 | ☐ |

## F10 — Módulo `audit`

| ID | Task | Depende de | ADRs | Status |
|---|---|---|---|---|
| T10.01 | Projector de audit (eventos críticos) + índices + TTL | F8 | 0008 | ☐ |
| T10.02 | `FetchOrganizationAuditLogsQuery` + policy CASL + paginação por cursor | T10.01 | — | ☐ |

## F11 — Hardening e entrega

| ID | Task | Depende de | ADRs | Status |
|---|---|---|---|---|
| T11.01 | Ferramenta de rebuild/replay de views do Mongo | F10 | — | ☐ |
| T11.02 | Revisão final de docs + validação das skills (implementar uma feature nova só com elas) | F10 | — | ☐ |
| T11.03 | README de onboarding (do clone ao primeiro endpoint em < 15 min) | T11.02 | — | ☐ |

