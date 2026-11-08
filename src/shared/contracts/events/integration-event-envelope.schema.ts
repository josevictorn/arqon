import { z } from "zod";
import { EVENT_NAME_PATTERN } from "@/shared/core/events/event-name";
import { ACTOR_TYPES } from "@/shared/core/events/integration-event";

/**
 * Zod schema of the Integration Event envelope (ADR-0019, ADR-0024).
 *
 * `IntegrationEventEnvelope` in `src/shared/core/events/integration-event.ts`
 * is the reference: never derive it from this schema with `z.infer`. A type test
 * in the spec requires `z.infer` of this schema to be **identical** to the
 * interface (fields, `readonly` and `null` × `undefined`); formats (UUIDv7,
 * ISO 8601 UTC, W3C `traceparent`) exist only here and are runtime-tested.
 */

/** W3C Trace Context: `<version>-<trace-id>-<parent-id>-<flags>`, lowercase hex. */
const TRACEPARENT_PATTERN =
  /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/u;

const uuidV7 = () => z.uuid({ version: "v7" });

/** Integer `>= 1`. Never a literal for `schemaVersion` (ADR-0023). */
const positiveInt = () => z.number().int().min(1);

export const eventActorSchema = z
  .object({
    actorId: z.string().min(1).nullable(),
    actorType: z.enum(ACTOR_TYPES),
    ipAddress: z.string().min(1).nullable(),
    userAgent: z.string().min(1).nullable(),
  })
  .readonly();

/**
 * Envelope schema for a given payload schema. `eventName` only follows the
 * naming convention here; `defineIntegrationEventContract` narrows it to the
 * contract's literal name.
 */
export const integrationEventEnvelopeSchema = <TPayload extends z.ZodType>(
  payloadSchema: TPayload
) =>
  z
    .object({
      actor: eventActorSchema,
      aggregateId: uuidV7(),
      aggregateVersion: positiveInt(),
      correlationId: z.string().min(1),
      eventId: uuidV7(),
      eventName: z.string().regex(EVENT_NAME_PATTERN),
      occurredAt: z.iso.datetime(),
      payload: payloadSchema,
      schemaVersion: positiveInt(),
      tenantId: uuidV7().nullable(),
      traceparent: z.string().regex(TRACEPARENT_PATTERN).nullable(),
    })
    .readonly();
