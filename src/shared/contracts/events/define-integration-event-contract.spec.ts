import { randomUUID } from "node:crypto";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import type { IntegrationEventEnvelope } from "@/shared/core/events/integration-event";
import { buildIntegrationEventEnvelope } from "@/test/factories/integration-event-envelope.factory";
import {
  defineIntegrationEventContract,
  type IntegrationEventOf,
  type IntegrationEventPayload,
} from "./define-integration-event-contract";

const INVALID_NAME_ERROR = /eventName must follow/u;
const INVALID_SCHEMA_VERSION_ERROR = /schemaVersion must be an integer >= 1/u;
const NOT_AN_OBJECT_ERROR = /payloadSchema must be a z\.object/u;
const NOT_JSON_SCHEMA_ERROR = /not convertible to JSON Schema/u;

const invoicePaidPayload = z.object({
  amountCents: z.number().int().min(0),
  currency: z.string().length(3),
  invoiceId: z.uuid(),
  paidAt: z.iso.datetime(),
});

const invoicePaidV1 = defineIntegrationEventContract({
  eventName: "billing.invoice.paid.v1",
  payloadSchema: invoicePaidPayload,
  schemaVersion: 1,
});

type InvoicePaid = IntegrationEventPayload<typeof invoicePaidV1>;

const payload: InvoicePaid = {
  amountCents: 1990,
  currency: "BRL",
  invoiceId: randomUUID(),
  paidAt: "2026-11-08T12:00:00.000Z",
};

const envelope = (
  overrides: Partial<IntegrationEventEnvelope<InvoicePaid>> = {}
) => buildIntegrationEventEnvelope(payload, overrides);

describe("defineIntegrationEventContract", () => {
  describe("definition", () => {
    it("derives topic and DLQ from the event name", () => {
      expect(invoicePaidV1.eventName).toBe("billing.invoice.paid.v1");
      expect(invoicePaidV1.topic).toBe("billing.invoice.paid.v1");
      expect(invoicePaidV1.dlqTopic).toBe("billing.invoice.paid.v1.dlq");
      expect(invoicePaidV1.schemaVersion).toBe(1);
      expect(invoicePaidV1.payloadSchema).toBe(invoicePaidPayload);
      expectTypeOf(
        invoicePaidV1.topic
      ).toEqualTypeOf<"billing.invoice.paid.v1">();
      expectTypeOf(
        invoicePaidV1.dlqTopic
      ).toEqualTypeOf<"billing.invoice.paid.v1.dlq">();
    });

    it("returns an immutable contract", () => {
      expect(Object.isFrozen(invoicePaidV1)).toBe(true);
    });

    it("produces an envelope schema convertible to JSON Schema", () => {
      const jsonSchema = z.toJSONSchema(invoicePaidV1.envelopeSchema);

      expect(jsonSchema).toMatchObject({
        properties: {
          eventName: { const: "billing.invoice.paid.v1" },
          payload: { type: "object" },
        },
        type: "object",
      });
    });

    it("throws for an event name outside the convention", () => {
      expect(() =>
        defineIntegrationEventContract({
          // @ts-expect-error: the EventName template literal rejects it at compile time too.
          eventName: "BillingInvoicePaid",
          payloadSchema: invoicePaidPayload,
          schemaVersion: 1,
        })
      ).toThrow(INVALID_NAME_ERROR);
    });

    it.each([0, -1, 1.5, Number.NaN])("throws for schemaVersion %s", (v) => {
      expect(() =>
        defineIntegrationEventContract({
          eventName: "billing.invoice.paid.v1",
          payloadSchema: invoicePaidPayload,
          schemaVersion: v,
        })
      ).toThrow(INVALID_SCHEMA_VERSION_ERROR);
    });

    it("throws for a payloadSchema that is not a z.object", () => {
      expect(() =>
        defineIntegrationEventContract({
          eventName: "billing.invoice.paid.v1",
          // @ts-expect-error: payloadSchema must be a z.object(...).
          payloadSchema: z.string(),
          schemaVersion: 1,
        })
      ).toThrow(NOT_AN_OBJECT_ERROR);
    });

    it.each([
      ["z.date()", z.object({ paidAt: z.date() })],
      ["z.bigint()", z.object({ amount: z.bigint() })],
      ["z.map()", z.object({ lines: z.map(z.string(), z.number()) })],
      [
        "a transform",
        z.object({ amount: z.string().transform((s) => Number(s)) }),
      ],
    ])(
      "throws for a payload with %s (not JSON Schema convertible)",
      (_c, s) => {
        expect(() =>
          defineIntegrationEventContract({
            eventName: "billing.invoice.paid.v1",
            payloadSchema: s,
            schemaVersion: 1,
          })
        ).toThrow(NOT_JSON_SCHEMA_ERROR);
      }
    );
  });

  describe("schemaVersion (ADR-0023)", () => {
    const invoicePaidV1Rev3 = defineIntegrationEventContract({
      eventName: "billing.invoice.paid.v1",
      payloadSchema: invoicePaidPayload,
      schemaVersion: 3,
    });

    it("accepts a revision different from the .vN major", () => {
      expect(invoicePaidV1Rev3.schemaVersion).toBe(3);
    });

    it.each([1, 2, 3])("parses envelopes of previous revision %s", (v) => {
      expect(
        invoicePaidV1Rev3.parse(envelope({ schemaVersion: v })).isRight()
      ).toBe(true);
    });

    it.each([0, 1.5])("rejects schemaVersion %s", (v) => {
      expect(
        invoicePaidV1Rev3.parse(envelope({ schemaVersion: v })).isLeft()
      ).toBe(true);
    });
  });

  describe("parse", () => {
    it("returns Right with the typed envelope for a valid input", () => {
      const input = envelope({ tenantId: null });
      const result = invoicePaidV1.parse(input);

      expect(result.isRight()).toBe(true);
      expect(result.value).toEqual(input);
      expectTypeOf(result.value).toEqualTypeOf<
        z.ZodError | IntegrationEventOf<typeof invoicePaidV1>
      >();
    });

    it.each<[string, unknown]>([
      ["eventId UUIDv4", envelope({ eventId: randomUUID() })],
      [
        "occurredAt without timezone",
        envelope({ occurredAt: "2026-11-08T12:00:00" }),
      ],
      ["another eventName", envelope({ eventName: "billing.invoice.paid.v2" })],
      [
        "unknown actorType",
        { ...envelope(), actor: { ...envelope().actor, actorType: "ROBOT" } },
      ],
      [
        "invalid payload",
        { ...envelope(), payload: { ...payload, currency: "R$$$" } },
      ],
      ["a non-object input", "not an envelope"],
    ])("returns Left without throwing for %s", (_case, input) => {
      const result = invoicePaidV1.parse(input);

      expect(result.isLeft()).toBe(true);
      expect(result.value).toBeInstanceOf(z.ZodError);
    });
  });

  describe("type utilities", () => {
    it("IntegrationEventPayload and IntegrationEventOf follow the payload schema", () => {
      expectTypeOf<InvoicePaid>().toEqualTypeOf<{
        amountCents: number;
        currency: string;
        invoiceId: string;
        paidAt: string;
      }>();
      expectTypeOf<IntegrationEventOf<typeof invoicePaidV1>>().toEqualTypeOf<
        IntegrationEventEnvelope<InvoicePaid>
      >();
    });
  });
});
