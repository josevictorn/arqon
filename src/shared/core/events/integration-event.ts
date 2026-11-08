/**
 * Integration Event envelope (ADR-0019): the contract of every event that leaves
 * a module through the Outbox and Kafka.
 *
 * Pure TypeScript on purpose (ADR-0024): `src/shared/core` never imports Zod.
 * The Zod schema of this envelope lives in
 * `src/shared/contracts/events/integration-event-envelope.schema.ts` and a type
 * test there requires it to be identical to `IntegrationEventEnvelope`.
 * Changing the envelope requires a new ADR and updating both sides.
 */

/** Only list of actor types: the Zod schema reuses it with `z.enum(ACTOR_TYPES)`. */
export const ACTOR_TYPES = ["USER", "SYSTEM", "WEBHOOK", "ANONYMOUS"] as const;

export type ActorType = (typeof ACTOR_TYPES)[number];

/** Who caused the event, filled from the request context (AsyncLocalStorage). */
export interface EventActorMetadata {
  readonly actorId: string | null;
  readonly actorType: ActorType;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export interface IntegrationEventEnvelope<TPayload = unknown> {
  readonly actor: EventActorMetadata;
  /** Kafka message key: keeps the order per aggregate. UUIDv7 (ADR-0014). */
  readonly aggregateId: string;
  /** Integer `>= 1`, used by projectors against out-of-order delivery. */
  readonly aggregateVersion: number;
  readonly correlationId: string;
  /** UUIDv7 (ADR-0014); idempotency key of consumers (ADR-0008). */
  readonly eventId: string;
  /** `<context>.<aggregate>.<action>.v<N>`, also the topic name. */
  readonly eventName: string;
  /** ISO 8601 in UTC (`Z`). */
  readonly occurredAt: string;
  readonly payload: TPayload;
  /** Compatible revision inside the `.vN` topic: integer `>= 1` (ADR-0023). */
  readonly schemaVersion: number;
  /** Active organization; `null` in global `iam` events. */
  readonly tenantId: string | null;
  /** W3C Trace Context of the producing span, when there is one. */
  readonly traceparent: string | null;
}

/**
 * What a Command provides when it emits an Integration Event. The rest of the
 * envelope (`eventId`, `schemaVersion`, `occurredAt`, `tenantId`,
 * `correlationId`, `traceparent`, `actor`) is filled by the `UnitOfWork` from
 * the request context, never by hand (ADR-0019).
 */
export interface NewIntegrationEvent<TPayload = unknown> {
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly eventName: string;
  readonly payload: TPayload;
}
