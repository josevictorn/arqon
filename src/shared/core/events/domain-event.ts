import { UniqueEntityID } from "../domain/unique-entity-id";

/**
 * Fact that happened inside an aggregate, delivered **in memory** to handlers of
 * the **same module**, inside the write transaction (ADR-0009, ADR-0025).
 *
 * It is not an Integration Event: nothing here leaves the process. Cross-module
 * effects go through `IntegrationEvent` + Outbox.
 */
export interface DomainEvent<TName extends string = string> {
  readonly aggregateId: UniqueEntityID;
  readonly eventId: UniqueEntityID;
  readonly eventName: TName;
  readonly occurredAt: Date;
}

/**
 * Optional base class: fills `eventId` (UUIDv7) and `occurredAt` (now, unless
 * given, e.g. in tests). Subclasses declare the literal `eventName` and their
 * own payload fields:
 *
 * ```ts
 * class UserRegistered extends BaseDomainEvent<"user.registered"> {
 *   readonly eventName = "user.registered";
 * }
 * ```
 */
export abstract class BaseDomainEvent<TName extends string>
  implements DomainEvent<TName>
{
  readonly eventId: UniqueEntityID;
  abstract readonly eventName: TName;
  readonly occurredAt: Date;
  readonly aggregateId: UniqueEntityID;

  protected constructor(aggregateId: UniqueEntityID, occurredAt?: Date) {
    this.eventId = UniqueEntityID.create();
    this.aggregateId = aggregateId;
    this.occurredAt = occurredAt ?? new Date();
  }
}
