import { InvalidEventNameError } from "../errors/common-errors";
import { type Either, left, right } from "../logic/either";

/**
 * `<context>.<aggregate>.<action>.v<N>`: each segment is `[a-z][a-z0-9_]*` and
 * `N` is an integer `>= 1` without leading zeros (`v0` and `v01` are invalid).
 *
 * The Integration Event name is also its Kafka topic (docs/events/catalog.md).
 * This regex is the only definition of the convention: the Zod envelope schema
 * in `src/shared/contracts/events/` reuses it.
 */
export const EVENT_NAME_PATTERN =
  /^(?<context>[a-z][a-z0-9_]*)\.(?<aggregate>[a-z][a-z0-9_]*)\.(?<action>[a-z][a-z0-9_]*)\.v(?<version>[1-9][0-9]*)$/u;

type EventNameGroups = Record<
  "action" | "aggregate" | "context" | "version",
  string
>;

/** Compile-time shape of an event name; the runtime rule is `EVENT_NAME_PATTERN`. */
export type EventName = `${string}.${string}.${string}.v${number}`;

export interface EventNameParts {
  readonly action: string;
  readonly aggregate: string;
  readonly context: string;
  /** Major version of the topic (the `N` of `.vN`), not the `schemaVersion` (ADR-0023). */
  readonly version: number;
}

export const isEventName = (name: string): name is EventName =>
  EVENT_NAME_PATTERN.test(name);

export const parseEventName = (
  name: string
): Either<InvalidEventNameError, EventNameParts> => {
  const match = EVENT_NAME_PATTERN.exec(name);
  if (!match) {
    return left(new InvalidEventNameError(name));
  }
  // The 4 named groups are mandatory, so a match always has all of them.
  const { action, aggregate, context, version } =
    match.groups as EventNameGroups;
  return right({ action, aggregate, context, version: Number(version) });
};

/** Kafka topic of an Integration Event: the event name itself. */
export const topicFor = <const T extends EventName>(eventName: T): T =>
  eventName;

/** Dead Letter Queue of a topic: `<topic>.dlq`. */
export const dlqTopicFor = <const T extends string>(topic: T): `${T}.dlq` =>
  `${topic}.dlq`;
