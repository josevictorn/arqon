# src/shared/core — blocos de DDD (regras locais)

Base que todo `domain/` importa. Se quebrar aqui, quebra o sistema inteiro.

## Regras
- Zero framework e zero infra: nada de `@nestjs/*`, `fastify`, Prisma, Mongo, Redis, Kafka (regra `core-framework-free` do `arch:check`).
- Zero `zod` em qualquer subpasta (ADR-0024): o envelope aqui é só tipo TS + `ACTOR_TYPES`; o schema Zod do envelope e o `defineIntegrationEventContract` ficam em `src/shared/contracts/events/`.
- Só blocos genéricos: `Either`, `DomainError`, `UniqueEntityID`, `Entity`, `ValueObject`, `AggregateRoot`, `DomainEvent`, `WatchedList`, envelope de `IntegrationEvent`. Regra de negócio de um contexto vai para o módulo.
- Domain Events ficam na instância do agregado e são entregues por um `DomainEventDispatcher` **de instância** (ADR-0025). Proibido registro estático (`DomainEvents.markAggregateForDispatch`, `static handlers`). Os handlers rodam com `await` **sequencial** (nunca `Promise.all`), e o `RegisteredHandler` usa *method signature* para a bivariância que dispensa cast: os dois `biome-ignore` em `domain-event-dispatcher.ts` são intencionais.
- `DomainError` **não estende `Error`** (ADR-0026): é um **valor puro** devolvido em `Left`, nunca lançado. Proibido `throw new DomainError(…)` ou herdar de `Error`.
- `UniqueEntityID` gera **UUIDv7** (RFC 9562) e é o único ponto de geração de IDs do domínio (ADR-0014). Usa a lib `uuid` (`v7`, monotônica), que só `unique-entity-id.ts` importa (ADR-0027). Não use `crypto.randomUUIDv7()`.
- `IntegrationEventEnvelope<TPayload>` tem exatamente os campos do ADR-0019 (`eventId`, `eventName` `<ctx>.<aggregate>.<action>.v<n>`, `schemaVersion`, `aggregateId`, `aggregateVersion`, `occurredAt` ISO UTC, `tenantId`, `correlationId`, `traceparent`, `actor`, `payload`). Mudou o envelope = novo ADR.
- `WatchedList<T>` compara itens **só** por `compareItems` (identidade, nunca `===`). *Novos*, *removidos* e *alterados* são disjuntos, e alteração de conteúdo só é registrada via `replace` (sem *deep diff*). `add` de um item removido o **restaura** sem marcá-lo como alterado; se o valor mudou, chame `replace` depois.
- API pública estável: mudar uma assinatura aqui afeta todos os módulos. Prefira adicionar a alterar.

## Testes
- **100% de cobertura unitária** (`pnpm test:cov`): cada bloco tem `*.spec.ts` ao lado, em memória, sem mocks de framework.
- Teste também os caminhos de erro (`left`) e a igualdade estrutural (`equals`) de VOs e IDs.

## Referência
- Envelope: [ADR-0019](../../../docs/decisions/0019-envelope-integration-event.md) · Zod fora do core: [ADR-0024](../../../docs/decisions/0024-zod-fora-do-shared-core.md) · IDs: [ADR-0014](../../../docs/decisions/0014-identificadores-uuidv7.md) · Gerador UUIDv7: [ADR-0027](../../../docs/decisions/0027-uuidv7-com-biblioteca-uuid.md) · DomainError: [ADR-0026](../../../docs/decisions/0026-domain-error-nao-estende-error.md) · Cobertura: [ADR-0028](../../../docs/decisions/0028-verify-com-gate-de-cobertura.md).
- Código de referência: [`logic/either.ts`](./logic/either.ts) e [`errors/domain-error.ts`](./errors/domain-error.ts) (T2.01); [`domain/unique-entity-id.ts`](./domain/unique-entity-id.ts), [`domain/entity.ts`](./domain/entity.ts) e [`domain/value-object.ts`](./domain/value-object.ts) (T2.02); [`domain/aggregate-root.ts`](./domain/aggregate-root.ts), [`events/domain-event.ts`](./events/domain-event.ts) e [`events/domain-event-dispatcher.ts`](./events/domain-event-dispatcher.ts) (T2.03); [`domain/watched-list.ts`](./domain/watched-list.ts) (T2.04); [`events/integration-event.ts`](./events/integration-event.ts) e [`events/event-name.ts`](./events/event-name.ts) (T2.05; o lado Zod fica em [`src/shared/contracts/events/`](../contracts/events/)). Para o resto, siga a [anatomia](../../../docs/architecture/03-module-anatomy.md).
