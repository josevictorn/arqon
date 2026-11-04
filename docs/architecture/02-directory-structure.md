> Extraído do blueprint original. Decisões que alteram este conteúdo vivem em [docs/decisions](../decisions/README.md) — **um ADR aceito prevalece sobre este texto**.

# 3. Estrutura de Diretórios Completa

```text
saas-boilerplate/
├── docker/                                      # Configurações de containers auxiliares (OTel, Kafka, etc.)
├── prisma/
│   ├── schema.prisma                            # Schema do banco (Modelos + Tabela OutboxEvent)
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── shared/                                  # Camada transversal agnóstica aos domínios de negócio
│   │   ├── core/                                # Blocos de construção do DDD (Zero dependências de framework)
│   │   │   ├── domain/
│   │   │   │   ├── entity.ts
│   │   │   │   ├── aggregate-root.ts
│   │   │   │   ├── value-object.ts
│   │   │   │   ├── watched-list.ts
│   │   │   │   └── unique-entity-id.ts
│   │   │   ├── events/
│   │   │   │   ├── domain-event.ts              # Eventos internos em memória (mesmo módulo)
│   │   │   │   ├── domain-event-dispatcher.ts   # Dispatcher de instância (ADR-0025)
│   │   │   │   └── integration-event.ts         # Tipo do envelope (TS puro, sem Zod) + ACTOR_TYPES (ADR-0019, ADR-0024)
│   │   │   ├── logic/
│   │   │   │   └── either.ts                    # Left / Right para retorno funcional de Use Cases
│   │   │   └── errors/
│   │   │       ├── domain-error.ts              # Base error com code, i18nKey e metadata
│   │   │       └── common-errors.ts             # ResourceNotFoundError, NotAllowedError, ConcurrencyError
│   │   │
│   │   ├── contracts/                           # Contratos públicos ENTRE módulos (Evita dependência circular)
│   │   │   ├── facades/
│   │   │   │   ├── iam.facade.contract.ts
│   │   │   │   ├── tenancy.facade.contract.ts
│   │   │   │   └── billing.facade.contract.ts
│   │   │   └── events/                          # Schemas & Tipagens de Integration Events (v1, v2) — único lugar com Zod de eventos (ADR-0024)
│   │   │       ├── integration-event-envelope.schema.ts  # Schema Zod do envelope (equivalente ao tipo em core/events)
│   │   │       ├── define-integration-event-contract.ts  # Helper defineIntegrationEventContract (ADR-0020)
│   │   │       ├── tenancy/
│   │   │       │   └── member-invited.v1.event.ts
│   │   │       └── billing/
│   │   │           └── subscription-paid.v1.event.ts
│   │   │
│   │   ├── application/                         # Portas globais para a camada de Aplicação
│   │   │   ├── gateways/
│   │   │   │   ├── cache.gateway.ts
│   │   │   │   ├── cryptography.gateway.ts
│   │   │   │   ├── storage.gateway.ts
│   │   │   │   ├── mail.gateway.ts
│   │   │   │   └── event-bus.gateway.ts
│   │   │   ├── pagination/
│   │   │   │   └── pagination-params.ts
│   │   │   └── unit-of-work.ts                  # Contrato para transações atômicas + persistência do Outbox
│   │   │
│   │   └── infra/                               # Implementações técnicas compartilhadas
│   │       ├── config/                          # Validação de variáveis de ambiente com Zod
│   │       ├── database/
│   │       │   ├── prisma/                      # Write DB: PrismaService, PrismaUnitOfWork, OutboxRepository
│   │       │   └── mongodb/                     # Read DB (CQRS): MongoReadService, Índices de Views, BaseProjector
│   │       ├── cache/                           # RedisService, RedisCacheAdapter, DistributedLockService
│   │       ├── cryptography/                    # Argon2Hasher, JwtEncrypter
│   │       ├── auth/                            # Guards JWT, CASL AbilityFactory base, @CurrentUser, @CurrentTenant
│   │       ├── i18n/                            # Configuração nestjs-i18n + dicionários (locales/en, locales/pt-BR)
│   │       ├── observability/                   # OpenTelemetry setup, Pino Logger, CorrelationIdInterceptor
│   │       ├── resilience/                      # Decorators e Policies (CircuitBreaker, Retry, Timeout, RateLimit)
│   │       ├── messaging/                       # KafkaProducer, KafkaConsumer, SchemaRegistry, OutboxRelayWorker, DLQHandler
│   │       └── http/                            # Fastify adapters, GlobalDomainExceptionFilter, Scalar setup
│   │
│   ├── integrations/                            # Gateways Externos + Anti-Corruption Layer (ACL)
│   │   ├── payment/
│   │   │   ├── contracts/
│   │   │   │   └── payment.gateway.ts
│   │   │   ├── providers/
│   │   │   │   ├── stripe/
│   │   │   │   │   ├── stripe-payment.adapter.ts
│   │   │   │   │   └── stripe-acl.mapper.ts
│   │   │   │   └── asaas/
│   │   │   │       ├── asaas-payment.adapter.ts
│   │   │   │       └── asaas-acl.mapper.ts
│   │   │   ├── factories/
│   │   │   │   └── payment-gateway.factory.ts
│   │   │   └── payment-integration.module.ts
│   │   ├── storage/                             # S3 / R2 / MinIO Adapter
│   │   └── mail/                                # Nodemailer / Mailpit / SES Adapter + Templates
│   │
│   ├── modules/                                 # Bounded Contexts do SaaS
│   │   ├── iam/                                 # 1. Identity & Access Management
│   │   ├── tenancy/                             # 2. Organizations, Members, Invites & RBAC
│   │   ├── billing/                             # 3. Plans, Subscriptions, Invoices & Quotas
│   │   ├── notifications/                       # 4. In-App & Transactional Notifications
│   │   └── audit/                               # 5. Audit Logs & Security Trail
│   │
│   ├── app.module.ts
│   └── main.ts                                  # Bootstrap com FastifyAdapter, Scalar, Helmet, CORS
│
├── test/                                        # Utilitários globais de teste
│   ├── setup-unit.ts
│   ├── setup-e2e.ts                             # Cria schema isolado no Postgres, DB isolado no Mongo e limpa Redis
│   ├── factories/                               # Builders de entidades e Read Models para testes
│   └── fakes/                                   # Fake Gateways (FakePaymentGateway, FakeStorage, FakeEventBus)
├── biome.json                                   # Configuração Biome + Ultracite
├── lefthook.yml                                 # Git hooks (lint, typecheck, testes afetados)
├── docker-compose.yml                           # Ambiente completo de desenvolvimento
└── package.json
```

