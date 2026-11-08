import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ACTOR_TYPES,
  type ActorType,
  type EventActorMetadata,
  type IntegrationEventEnvelope,
  type NewIntegrationEvent,
} from "./integration-event";

/** Exactly the fields of ADR-0019: adding or removing one breaks `pnpm typecheck`. */
type Adr0019EnvelopeKeys =
  | "eventId"
  | "eventName"
  | "schemaVersion"
  | "aggregateId"
  | "aggregateVersion"
  | "occurredAt"
  | "tenantId"
  | "correlationId"
  | "traceparent"
  | "actor"
  | "payload";

interface Payload {
  readonly invoiceId: string;
}

describe("IntegrationEventEnvelope (ADR-0019)", () => {
  it("has exactly the ADR-0019 keys, all readonly, with the ADR-0019 types", () => {
    expectTypeOf<
      keyof IntegrationEventEnvelope<Payload>
    >().toEqualTypeOf<Adr0019EnvelopeKeys>();

    expectTypeOf<IntegrationEventEnvelope<Payload>>().toEqualTypeOf<{
      readonly eventId: string;
      readonly eventName: string;
      readonly schemaVersion: number;
      readonly aggregateId: string;
      readonly aggregateVersion: number;
      readonly occurredAt: string;
      readonly tenantId: string | null;
      readonly correlationId: string;
      readonly traceparent: string | null;
      readonly actor: {
        readonly actorId: string | null;
        readonly actorType: "USER" | "SYSTEM" | "WEBHOOK" | "ANONYMOUS";
        readonly ipAddress: string | null;
        readonly userAgent: string | null;
      };
      readonly payload: Payload;
    }>();
  });

  it("defaults the payload to unknown", () => {
    expectTypeOf<IntegrationEventEnvelope["payload"]>().toBeUnknown();
  });

  it("ActorType is derived from ACTOR_TYPES, the only list of actor types", () => {
    expect(ACTOR_TYPES).toEqual(["USER", "SYSTEM", "WEBHOOK", "ANONYMOUS"]);
    expectTypeOf<ActorType>().toEqualTypeOf<(typeof ACTOR_TYPES)[number]>();
    expectTypeOf<EventActorMetadata["actorType"]>().toEqualTypeOf<ActorType>();
  });
});

describe("NewIntegrationEvent", () => {
  it("only carries what the Command provides; the rest comes from the UnitOfWork", () => {
    expectTypeOf<keyof NewIntegrationEvent<Payload>>().toEqualTypeOf<
      "eventName" | "aggregateId" | "aggregateVersion" | "payload"
    >();
    expectTypeOf<
      NewIntegrationEvent<Payload>["payload"]
    >().toEqualTypeOf<Payload>();
  });
});
