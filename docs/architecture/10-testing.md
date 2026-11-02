> Extraído do blueprint original. Decisões que alteram este conteúdo vivem em [docs/decisions](../decisions/README.md) — **um ADR aceito prevalece sobre este texto**.

# 11. Estratégia de Testes (Vitest)

A suíte de testes é dividida em **3 níveis**, todos executados com **Vitest** e compilação via **SWC**:

| Nível | Alvo | Dependências | Banco / Infra | Velocidade |
| :--- | :--- | :--- | :--- | :--- |
| **1. Unitários (`*.spec.ts`)** | Entities, Value Objects, Domain Services, Commands, Queries, Subscribers | `InMemoryWriteRepositories`, `InMemoryReadRepositories`, `FakeGateways` | Zero I/O (100% em memória) | ~2ms por teste |
| **2. Integração (`*.int-spec.ts`)** | Repositórios Prisma (Write), Repositórios/Projectors MongoDB (Read), `PrismaUnitOfWork`, `OutboxRelay` | Instâncias reais do Prisma, MongoDB e Redis | PostgreSQL (**Schema Isolado**) + MongoDB (**DB Isolado** `test_uuid`) | ~50ms por teste |
| **3. End-to-End (`*.e2e-spec.ts`)** | Controllers Fastify, Fluxo CQRS Completo (Command Postgres → Outbox/Kafka → Projector → Query MongoDB) | App NestJS completo + `supertest` | PostgreSQL + MongoDB + Redis isolados por arquivo | ~150ms por teste |


## Execução e convenções (T1.03)

- Configuração única em `vitest.config.mts` com 3 `projects` (`unit`, `int`, `e2e`), compilados via `unplugin-swc` (emite `design:paramtypes`; o `.swcrc` é CommonJS para o build, então o plugin sobrescreve para ESM).
- Localização dos testes: `unit` em `src/**/*.spec.ts`, `int` em `src/**/*.int-spec.ts` e **e2e em `test/**/*.e2e-spec.ts`** (usam o `AppModule` real e `app.inject()` do Fastify).
- Setups em `test/setup-{unit,int,e2e}.ts` (placeholders até a T3.11).
- Comandos: `pnpm test` (todos), `test:unit`, `test:int`, `test:e2e`, `test:cov` (cobertura v8 dos unit). `pnpm verify` inclui `test:unit`.
