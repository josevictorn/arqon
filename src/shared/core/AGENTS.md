# src/shared/core — blocos de DDD (regras locais)

Base que todo `domain/` importa. Se quebrar aqui, quebra o sistema inteiro.

## Regras
- Zero framework e zero infra: nada de `@nestjs/*`, `fastify`, Prisma, Mongo, Redis, Kafka (regra `core-framework-free` do `arch:check`).
- Só blocos genéricos: `Either`, `DomainError`, `UniqueEntityID`, `Entity`, `ValueObject`, `AggregateRoot`, `DomainEvent`, `WatchedList`, envelope de `IntegrationEvent`. Regra de negócio de um contexto vai para o módulo.
- `UniqueEntityID` gera **UUIDv7** (RFC 9562) e é o único ponto de geração de IDs do domínio (ADR-0014).
- `IntegrationEventEnvelope<TPayload>` tem exatamente os campos do ADR-0019 (`eventId`, `eventName` `<ctx>.<aggregate>.<action>.v<n>`, `schemaVersion`, `aggregateId`, `aggregateVersion`, `occurredAt` ISO UTC, `tenantId`, `correlationId`, `traceparent`, `actor`, `payload`). Mudou o envelope = novo ADR.
- API pública estável: mudar uma assinatura aqui afeta todos os módulos. Prefira adicionar a alterar.

## Testes
- **100% de cobertura unitária** (`pnpm test:cov`): cada bloco tem `*.spec.ts` ao lado, em memória, sem mocks de framework.
- Teste também os caminhos de erro (`left`) e a igualdade estrutural (`equals`) de VOs e IDs.

## Referência
- Envelope: [ADR-0019](../../../docs/decisions/0019-envelope-integration-event.md) · IDs: [ADR-0014](../../../docs/decisions/0014-identificadores-uuidv7.md).
- Código de referência: `domain/unique-entity-id.ts` (chega na T2.02) e `either.ts` (T2.01). Até lá, siga a [anatomia](../../../docs/architecture/03-module-anatomy.md).
