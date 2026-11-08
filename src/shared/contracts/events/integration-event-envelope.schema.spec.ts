import { randomUUID } from "node:crypto";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import type {
  EventActorMetadata,
  IntegrationEventEnvelope,
} from "@/shared/core/events/integration-event";
import { buildIntegrationEventEnvelope } from "@/test/factories/integration-event-envelope.factory";
import {
  eventActorSchema,
  integrationEventEnvelopeSchema,
} from "./integration-event-envelope.schema";

const payloadSchema = z.object({
  amountCents: z.number().int(),
  couponCode: z.string().optional(),
  invoiceId: z.uuid(),
});
type Payload = z.infer<typeof payloadSchema>;

const schema = integrationEventEnvelopeSchema(payloadSchema);
const payload: Payload = { amountCents: 1990, invoiceId: randomUUID() };

describe("integrationEventEnvelopeSchema (ADR-0024)", () => {
  it("infers exactly IntegrationEventEnvelope (fields, readonly, null x undefined)", () => {
    expectTypeOf<z.infer<typeof schema>>().toEqualTypeOf<
      IntegrationEventEnvelope<Payload>
    >();
    expectTypeOf<
      z.infer<typeof eventActorSchema>
    >().toEqualTypeOf<EventActorMetadata>();
  });

  it("accepts a valid envelope, including a global event with tenantId and traceparent null", () => {
    expect(
      schema.safeParse(buildIntegrationEventEnvelope(payload)).success
    ).toBe(true);
    expect(
      schema.safeParse(
        buildIntegrationEventEnvelope(payload, {
          tenantId: null,
          traceparent: null,
        })
      ).success
    ).toBe(true);
  });

  it("accepts every actor type and null actor fields", () => {
    for (const actorType of eventActorSchema.unwrap().shape.actorType.options) {
      const actor = {
        actorId: null,
        actorType,
        ipAddress: null,
        userAgent: null,
      };
      expect(eventActorSchema.safeParse(actor).success).toBe(true);
    }
  });

  it.each<[string, Partial<IntegrationEventEnvelope<Payload>>]>([
    ["eventId UUIDv4", { eventId: randomUUID() }],
    ["aggregateId UUIDv4", { aggregateId: randomUUID() }],
    ["tenantId UUIDv4", { tenantId: randomUUID() }],
    ["occurredAt without timezone", { occurredAt: "2026-11-08T12:00:00" }],
    ["occurredAt with offset", { occurredAt: "2026-11-08T12:00:00+03:00" }],
    ["occurredAt date only", { occurredAt: "2026-11-08" }],
    ["eventName outside the convention", { eventName: "BillingInvoicePaid" }],
    ["schemaVersion 0", { schemaVersion: 0 }],
    ["schemaVersion 1.5", { schemaVersion: 1.5 }],
    ["aggregateVersion 0", { aggregateVersion: 0 }],
    ["empty correlationId", { correlationId: "" }],
    ["malformed traceparent", { traceparent: "not-a-traceparent" }],
  ])("rejects %s", (_case, overrides) => {
    expect(
      schema.safeParse(buildIntegrationEventEnvelope(payload, overrides))
        .success
    ).toBe(false);
  });

  it("rejects an unknown actorType", () => {
    const envelope = buildIntegrationEventEnvelope(payload);
    const result = schema.safeParse({
      ...envelope,
      actor: { ...envelope.actor, actorType: "ROBOT" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid payload and undefined instead of null", () => {
    const envelope = buildIntegrationEventEnvelope(payload);

    expect(
      schema.safeParse({ ...envelope, payload: { invoiceId: "x" } }).success
    ).toBe(false);
    expect(schema.safeParse({ ...envelope, tenantId: undefined }).success).toBe(
      false
    );
  });
});
