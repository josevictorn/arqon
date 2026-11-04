# ADR-0019: Envelope padronizado de `IntegrationEvent` preenchido via `AsyncLocalStorage`

- **Status:** Aceito — complementado por [ADR-0023](./0023-semantica-de-schema-version.md) (semântica de `schemaVersion` × sufixo `.vN`)
- **Data:** 2026-11-01
- **Decisores:** José Victor
- **Tasks relacionadas:** T0.07, T2.05, T3.05, T4.03, T10.01
- **Docs afetados:** [`docs/architecture/04-cqrs-and-events.md`](../architecture/04-cqrs-and-events.md), [`docs/events/catalog.md`](../events/catalog.md), [`docs/modules/audit/spec.md`](../modules/audit/spec.md)

## Contexto

O boilerplate publica Integration Events via padrão Transactional Outbox (`outbox_events` no PostgreSQL → `OutboxRelayWorker` → Apache Kafka). Precisávamos fechar o contrato exato do **Envelope de `IntegrationEvent`** (T2.05) e dos headers Kafka para atender a quatro necessidades transversais:
1. **Idempotência e ordenação nos Projectors e Subscribers (ADR-0008):** exige `eventId` (UUIDv7), `aggregateId` (partition key do Kafka) e `aggregateVersion`.
2. **Trilha de Auditoria (`audit` — F10):** precisa saber quem realizou a ação (`actorId`, `actorType`, `ipAddress`, `userAgent`) e em qual organização (`tenantId`), sem poluir a assinatura de todos os Use Cases e payloads de negócio com dados de rede/HTTP.
3. **Observabilidade e Tracing Distribuído (ADR-0006 e ADR-0013):** exige propagação de `correlationId` e `traceparent` (W3C Trace Context) da requisição HTTP até o consumer Kafka.
4. **Versionamento e Evolução de Contratos (T4.02):** exige `eventName` e `schemaVersion`.

## Opções consideradas

### Opção A — Envelope Rico Padronizado preenchido automaticamente pelo `UnitOfWork` via `AsyncLocalStorage`
- ✅ **Use Cases e Payloads limpos:** o Command informa apenas `{ eventName, aggregateId, aggregateVersion, payload }`. O `PrismaUnitOfWork.addIntegrationEvent` lê automaticamente do `RequestContext` (`AsyncLocalStorage`) o `tenantId`, o `actor` (`{ actorId, actorType, ipAddress, userAgent }`), o `correlationId` e o `traceparent` ativo do OpenTelemetry.
- ✅ **Auditoria completa out-of-the-box:** o `AuditLogProjector` tem acesso uniforme ao ator e IP em 100% dos eventos da plataforma.
- ✅ **Rastreamento ponta a ponta:** o `OutboxRelayWorker` copia os metadados para os headers da mensagem Kafka (`ce-id`, `ce-type`, `traceparent`, `x-correlation-id`).
- ❌ Aumenta em ~200 bytes o tamanho do JSON de cada evento (desprezível para o Kafka com compressão `lz4`/`snappy`).

### Opção B — Envelope Mínimo (`eventId`, `eventName`, `occurredAt`, `payload`)
- ✅ Menor estrutura base.
- ❌ Obriga todo evento auditável a repetir `actorId`, `ipAddress` e `userAgent` dentro do `payload` de domínio, acoplando entidades e Use Cases a detalhes da requisição HTTP.

## Decisão

Adotamos a **Opção A**. Todo `IntegrationEvent<TPayload>` segue o contrato de envelope abaixo:

```typescript
export type ActorType = 'USER' | 'SYSTEM' | 'WEBHOOK' | 'ANONYMOUS'

export interface EventActorMetadata {
  actorId: string | null
  actorType: ActorType
  ipAddress: string | null
  userAgent: string | null
}

export interface IntegrationEventEnvelope<TPayload = unknown> {
  eventId: string // UUIDv7 (ADR-0014)
  eventName: string // <bounded-context>.<aggregate>.<action>.v<version>
  schemaVersion: number // inteiro >= 1
  aggregateId: string // UUIDv7 — usado como Kafka message key (garante ordem por agregado)
  aggregateVersion: number // inteiro >= 1 — usado pelo BaseProjector para proteção contra out-of-order
  occurredAt: string // ISO 8601 UTC
  tenantId: string | null // organizationId (null em eventos globais de iam)
  correlationId: string
  traceparent: string | null // W3C Trace Context para continuidade do span OTel
  actor: EventActorMetadata
  payload: TPayload
}
```

### Headers Kafka publicados pelo `OutboxRelayWorker`:
- **Message Key:** `envelope.aggregateId`
- **Headers:** `event-id`, `event-name`, `schema-version`, `tenant-id`, `correlation-id`, `traceparent`.

## Consequências

- **Positivas:**
  - Padronização absoluta de todos os eventos do catálogo ([`docs/events/catalog.md`](../events/catalog.md)).
  - Zero vazamento de `ipAddress` / `userAgent` para dentro das entidades de domínio (exceto em `Session` do `iam`, onde faz parte explícita do negócio).
- **Negativas / trade-offs aceitos:**
  - Workers/Crons e Webhooks que rodam fora de uma requisição autenticada de usuário devem inicializar o contexto do `AsyncLocalStorage` com `actorType: 'SYSTEM'` ou `'WEBHOOK'`.
- **Ações decorrentes:**
  - Implementar o helper de contrato e envelope na **T2.05**.

## Regras para a IA

1. Todo evento publicado no Outbox deve usar `IntegrationEventEnvelope<TPayload>` definido em `src/shared/core/events/`.
2. A chave de partição Kafka (`key`) deve ser sempre `envelope.aggregateId`.
3. Não repita `ipAddress`, `userAgent` ou `traceparent` dentro do `payload` de negócio (exceto quando fizerem parte do estado da própria entidade, como `Session` no `iam`); deixe o `UnitOfWork` preenchê-los no `envelope.actor` via `AsyncLocalStorage`.

