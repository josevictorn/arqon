import { z } from "zod";
import {
  dlqTopicFor,
  type EventName,
  isEventName,
  topicFor,
} from "@/shared/core/events/event-name";
import type { IntegrationEventEnvelope } from "@/shared/core/events/integration-event";
import { type Either, left, right } from "@/shared/core/logic/either";
import { integrationEventEnvelopeSchema } from "./integration-event-envelope.schema";

export interface IntegrationEventContractDefinition<
  TName extends EventName,
  TPayload extends z.ZodObject,
> {
  /** `<context>.<aggregate>.<action>.v<N>`; also the Kafka topic. */
  readonly eventName: TName;
  /** Only JSON-serializable types (dates as ISO 8601 strings), ADR-0020. */
  readonly payloadSchema: TPayload;
  /** Compatible revision inside the `.vN` topic (ADR-0023). */
  readonly schemaVersion: number;
}

const contractEnvelopeSchema = <
  TName extends EventName,
  TPayload extends z.ZodObject,
>(
  eventName: TName,
  payloadSchema: TPayload
) =>
  integrationEventEnvelopeSchema(payloadSchema)
    .unwrap()
    .extend({ eventName: z.literal(eventName) })
    .readonly();

export type IntegrationEventEnvelopeSchema<
  TName extends EventName,
  TPayload extends z.ZodObject,
> = ReturnType<typeof contractEnvelopeSchema<TName, TPayload>>;

export interface IntegrationEventContract<
  TName extends EventName,
  TPayload extends z.ZodObject,
> {
  readonly dlqTopic: `${TName}.dlq`;
  /** Full envelope: source of the JSON Schema registered by T4.02 (ADR-0020). */
  readonly envelopeSchema: IntegrationEventEnvelopeSchema<TName, TPayload>;
  readonly eventName: TName;
  /** Validates an untrusted envelope (e.g. a Kafka message); never throws. */
  readonly parse: (
    input: unknown
  ) => Either<z.ZodError, IntegrationEventEnvelope<z.output<TPayload>>>;
  readonly payloadSchema: TPayload;
  /** Revision the producer writes; `parse` accepts any integer `>= 1` (ADR-0023). */
  readonly schemaVersion: number;
  readonly topic: TName;
}

/** Payload type of a contract. */
export type IntegrationEventPayload<
  C extends { readonly payloadSchema: z.ZodType },
> = z.output<C["payloadSchema"]>;

/** Full envelope type of a contract. */
export type IntegrationEventOf<
  C extends { readonly payloadSchema: z.ZodType },
> = IntegrationEventEnvelope<IntegrationEventPayload<C>>;

/**
 * Declares an Integration Event contract from a single Zod schema (ADR-0020):
 * static types, in-memory validation (`parse`), topic/DLQ names and a schema
 * guaranteed to convert to JSON Schema.
 *
 * **`schemaVersion`** ([ADR-0023](../../../../docs/decisions/0023-semantica-de-schema-version.md))
 * is the compatible revision inside the `.vN` topic, unrelated to `N` and to
 * the Schema Registry version:
 * - starts at `1` when the contract is created;
 * - goes up `+1` on every `BACKWARD` compatible change of `payloadSchema`
 *   (e.g. a new optional field), in the same PR;
 * - restarts at `1` in every new `.v<N+1>` topic (a breaking change); the old
 *   `.vN` contract keeps its last revision.
 *
 * So `eventName: "billing.invoice.paid.v1"` with `schemaVersion: 3` is valid.
 *
 * Throws on definition (a programming error caught at module load, not a
 * business error) when `eventName` breaks the naming convention,
 * `schemaVersion` is not an integer `>= 1`, `payloadSchema` is not a
 * `z.object(...)` or the envelope cannot be converted to JSON Schema
 * (`z.date()`, `z.bigint()`, `z.map()`, transforms...).
 *
 * @example
 * export const invoicePaidV1 = defineIntegrationEventContract({
 *   eventName: "billing.invoice.paid.v1",
 *   schemaVersion: 1,
 *   payloadSchema: z.object({ invoiceId: z.uuid(), paidAt: z.iso.datetime() }),
 * });
 * export type InvoicePaidV1 = IntegrationEventOf<typeof invoicePaidV1>;
 */
export const defineIntegrationEventContract = <
  const TName extends EventName,
  TPayload extends z.ZodObject,
>(
  definition: IntegrationEventContractDefinition<TName, TPayload>
): IntegrationEventContract<TName, TPayload> => {
  const { eventName, payloadSchema, schemaVersion } = definition;
  const label = `Integration Event contract "${eventName}"`;

  if (!isEventName(eventName)) {
    throw new Error(
      `${label}: eventName must follow <context>.<aggregate>.<action>.v<N> (lowercase, N >= 1).`
    );
  }
  if (!(Number.isInteger(schemaVersion) && schemaVersion >= 1)) {
    throw new Error(
      `${label}: schemaVersion must be an integer >= 1 (ADR-0023), got ${schemaVersion}.`
    );
  }
  if (!(payloadSchema instanceof z.ZodObject)) {
    throw new Error(`${label}: payloadSchema must be a z.object(...).`);
  }

  const envelopeSchema = contractEnvelopeSchema(eventName, payloadSchema);
  try {
    z.toJSONSchema(envelopeSchema);
  } catch (cause) {
    throw new Error(
      `${label}: the schema is not convertible to JSON Schema; use only JSON-serializable types, dates as ISO 8601 strings (ADR-0020).`,
      { cause }
    );
  }

  const topic = topicFor(eventName);

  return Object.freeze({
    dlqTopic: dlqTopicFor(topic),
    envelopeSchema,
    eventName,
    parse: (input: unknown) => {
      type Envelope = IntegrationEventEnvelope<z.output<TPayload>>;
      const result = envelopeSchema.safeParse(input);
      return result.success
        ? // TS cannot resolve Zod's `Readonly<...>` output while `TPayload` is
          // generic; the spec proves it is identical for concrete payloads.
          right<Envelope, z.ZodError>(result.data as Envelope)
        : left<z.ZodError, Envelope>(result.error);
    },
    payloadSchema,
    schemaVersion,
    topic,
  });
};
