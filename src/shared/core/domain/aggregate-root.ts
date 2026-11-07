import type { DomainEvent } from "../events/domain-event";
import { Entity } from "./entity";
import type { UniqueEntityID } from "./unique-entity-id";

/**
 * Consistency boundary of a module: the only entity repositories load and save.
 *
 * Domain Events raised by a state change are kept **in this instance** (ADR-0025):
 * `addDomainEvent` touches no global state, so an aborted operation simply
 * discards the aggregate together with its pending events. The `UnitOfWork`
 * (T3.05) delivers them through `DomainEventDispatcher.dispatchFor(aggregate)`.
 */
export abstract class AggregateRoot<Props> extends Entity<Props> {
  private _domainEvents: DomainEvent[] = [];
  private readonly _version: number;

  /**
   * @param version persisted version, restored by the mapper; `0` means the
   *   aggregate was never persisted. Incrementing it is the repository's job.
   */
  protected constructor(props: Props, id?: UniqueEntityID, version = 0) {
    super(props, id);
    this._version = version;
  }

  get version(): number {
    return this._version;
  }

  /** Pending events, in the order they were added (a copy). */
  get domainEvents(): readonly DomainEvent[] {
    return [...this._domainEvents];
  }

  /** Records an event in this instance only; never dispatches it. */
  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  /** Returns the pending events and leaves the aggregate with none. */
  pullDomainEvents(): DomainEvent[] {
    const events = this._domainEvents;
    this._domainEvents = [];
    return events;
  }

  clearEvents(): void {
    this._domainEvents = [];
  }
}
