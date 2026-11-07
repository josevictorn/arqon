import type { AggregateRoot } from "../domain/aggregate-root";
import type { DomainEvent } from "./domain-event";

/**
 * Map `eventName → event type` that types `register`. Each key must match the
 * `eventName` of its event, e.g. `{ "user.registered": UserRegistered }`.
 */
export type DomainEventMap<TEventMap> = {
  [K in keyof TEventMap]: DomainEvent<K & string>;
};

export type DomainEventHandler<TEvent extends DomainEvent = DomainEvent> = (
  event: TEvent
) => Promise<void>;

/**
 * Internal storage of a handler. Method syntax makes the parameter bivariant,
 * which lets a `DomainEventHandler<UserRegistered>` live next to handlers of
 * other events without `any` or casts. It is sound because `dispatch` only
 * calls a handler with events whose `eventName` it was registered for.
 */
interface RegisteredHandler {
  // biome-ignore lint/style/useConsistentMethodSignatures: method syntax is required for parameter bivariance; the property form fails with TS2322 in `register`.
  handle(event: DomainEvent): Promise<void>;
}

/**
 * Delivers Domain Events to the handlers of the **same module** (ADR-0025).
 *
 * Instance-based: it holds only the handlers (fixed after boot), never the
 * pending events (those live in each aggregate). Two instances share nothing.
 * Only the `UnitOfWork` calls it, inside the transaction and before the commit
 * (ADR-0009, B1); a handler failure rejects `dispatch` and rolls the tx back.
 */
export class DomainEventDispatcher<
  TEventMap extends DomainEventMap<TEventMap> = Record<string, DomainEvent>,
> {
  private readonly handlers = new Map<string, RegisteredHandler[]>();

  /**
   * Subscribes `handler` to `eventName`. Several handlers per event run in
   * registration order. Register in `onModuleInit`, never in a constructor.
   *
   * Handlers run inside the write transaction: they **must not** do external
   * I/O (HTTP, Kafka, e-mail, storage) — use an Integration Event for that
   * (ADR-0009, rule 3).
   */
  register<K extends keyof TEventMap & string>(
    eventName: K,
    handler: DomainEventHandler<TEventMap[K]>
  ): void {
    const registered: RegisteredHandler = { handle: handler };
    const current = this.handlers.get(eventName);
    if (current) {
      current.push(registered);
      return;
    }
    this.handlers.set(eventName, [registered]);
  }

  /**
   * Runs the handlers **sequentially** (`await` one at a time), in event order
   * and then registration order. The first rejection stops the queue and is
   * propagated as is. Events without handlers are ignored.
   */
  async dispatch(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      const handlers = [...(this.handlers.get(event.eventName) ?? [])];
      for (const { handle } of handlers) {
        // biome-ignore lint/performance/noAwaitInLoops: handlers must run one at a time, in order, stopping at the first failure (ADR-0009 B1, ADR-0025).
        await handle(event);
      }
    }
  }

  /**
   * Pulls the aggregate's pending events and dispatches them. The events are
   * removed even if a handler fails: the transaction is rolled back anyway.
   */
  dispatchFor(aggregate: AggregateRoot<unknown>): Promise<void> {
    return this.dispatch(aggregate.pullDomainEvents());
  }
}
