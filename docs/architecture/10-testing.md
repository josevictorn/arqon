> Extraído do blueprint original. Decisões que alteram este conteúdo vivem em [docs/decisions](../decisions/README.md) — **um ADR aceito prevalece sobre este texto**.

# 11. Estratégia de Testes (Vitest)

A suíte de testes é dividida em **3 níveis**, todos executados com **Vitest** e compilação via **SWC**:

| Nível | Alvo | Dependências | Banco / Infra | Velocidade |
| :--- | :--- | :--- | :--- | :--- |
| **1. Unitários (`*.spec.ts`)** | Entities, Value Objects, Domain Services, Commands, Queries, Subscribers | `InMemoryWriteRepositories`, `InMemoryReadRepositories`, `FakeGateways` | Zero I/O (100% em memória) | ~2ms por teste |
| **2. Integração (`*.int-spec.ts`)** | Repositórios Prisma (Write), Repositórios/Projectors MongoDB (Read), `PrismaUnitOfWork`, `OutboxRelay` | Instâncias reais do Prisma, MongoDB e Redis | PostgreSQL (**Schema Isolado**) + MongoDB (**DB Isolado** `test_uuid`) | ~50ms por teste |
| **3. End-to-End (`*.e2e-spec.ts`)** | Controllers Fastify, Fluxo CQRS Completo (Command Postgres → Outbox/Kafka → Projector → Query MongoDB) | App NestJS completo + `supertest` | PostgreSQL + MongoDB + Redis isolados por arquivo | ~150ms por teste |

