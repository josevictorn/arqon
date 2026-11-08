import { faker } from "@faker-js/faker";
import { UniqueEntityID } from "@/shared/core/domain/unique-entity-id";
import type { IntegrationEventEnvelope } from "@/shared/core/events/integration-event";

const TRACEPARENT = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";

/** Valid envelope (UUIDv7 IDs, ISO UTC date, W3C traceparent); override any field. */
export const buildIntegrationEventEnvelope = <TPayload>(
  payload: TPayload,
  overrides: Partial<IntegrationEventEnvelope<TPayload>> = {}
): IntegrationEventEnvelope<TPayload> => ({
  actor: {
    actorId: UniqueEntityID.create().toString(),
    actorType: "USER",
    ipAddress: faker.internet.ipv4(),
    userAgent: faker.internet.userAgent(),
  },
  aggregateId: UniqueEntityID.create().toString(),
  aggregateVersion: 1,
  correlationId: faker.string.uuid(),
  eventId: UniqueEntityID.create().toString(),
  eventName: "billing.invoice.paid.v1",
  occurredAt: new Date().toISOString(),
  payload,
  schemaVersion: 1,
  tenantId: UniqueEntityID.create().toString(),
  traceparent: TRACEPARENT,
  ...overrides,
});
