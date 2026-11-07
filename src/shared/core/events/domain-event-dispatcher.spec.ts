import { describe, expect, expectTypeOf, it } from "vitest";
import { AggregateRoot } from "../domain/aggregate-root";
import { UniqueEntityID } from "../domain/unique-entity-id";
import { BaseDomainEvent, type DomainEvent } from "./domain-event";
import { DomainEventDispatcher } from "./domain-event-dispatcher";

class XHappened extends BaseDomainEvent<"x.happened"> {
  readonly eventName = "x.happened";

  constructor(
    aggregateId: UniqueEntityID,
    readonly label: string
  ) {
    super(aggregateId);
  }
}

class YHappened extends BaseDomainEvent<"y.happened"> {
  readonly eventName = "y.happened";

  constructor(
    aggregateId: UniqueEntityID,
    readonly amount: number
  ) {
    super(aggregateId);
  }
}

class ZHappened extends BaseDomainEvent<"z.happened"> {
  readonly eventName = "z.happened";

  constructor(aggregateId: UniqueEntityID) {
    super(aggregateId);
  }
}

interface SampleEvents {
  "x.happened": XHappened;
  "y.happened": YHappened;
}

class Sample extends AggregateRoot<Record<string, never>> {
  static create(id?: UniqueEntityID): Sample {
    return new Sample({}, id);
  }

  doX(label: string): void {
    this.addDomainEvent(new XHappened(this.id, label));
  }

  doY(amount: number): void {
    this.addDomainEvent(new YHappened(this.id, amount));
  }

  doZ(): void {
    this.addDomainEvent(new ZHappened(this.id));
  }
}

const labelOf = (event: DomainEvent): string => {
  if (event instanceof XHappened) {
    return `x:${event.label}`;
  }
  if (event instanceof YHappened) {
    return `y:${event.amount}`;
  }
  return event.eventName;
};

/** Records `entry` and resolves: a handler that does no async work. */
const record = (calls: string[], entry: string): Promise<void> => {
  calls.push(entry);
  return Promise.resolve();
};

/** Dispatcher whose handlers append "<handler>:<event>" to `calls`. */
const recordingDispatcher = () => {
  const calls: string[] = [];
  const dispatcher = new DomainEventDispatcher<SampleEvents>();
  dispatcher.register("x.happened", (event) =>
    record(calls, `h1:${labelOf(event)}`)
  );
  dispatcher.register("y.happened", (event) =>
    record(calls, `h1:${labelOf(event)}`)
  );
  dispatcher.register("x.happened", (event) =>
    record(calls, `h2:${labelOf(event)}`)
  );
  return { calls, dispatcher };
};

describe("DomainEventDispatcher", () => {
  it("delivers events in the order they were added to the aggregate", async () => {
    const { calls, dispatcher } = recordingDispatcher();
    const sample = Sample.create();
    sample.doY(1);
    sample.doX("a");
    sample.doY(2);

    await dispatcher.dispatchFor(sample);

    expect(calls).toEqual(["h1:y:1", "h1:x:a", "h2:x:a", "h1:y:2"]);
    expect(sample.domainEvents).toEqual([]);
  });

  it("runs several handlers of the same event in registration order", async () => {
    const { calls, dispatcher } = recordingDispatcher();
    const sample = Sample.create();
    sample.doX("a");

    await dispatcher.dispatch(sample.domainEvents);

    expect(calls).toEqual(["h1:x:a", "h2:x:a"]);
  });

  it("awaits each handler before starting the next one", async () => {
    const calls: string[] = [];
    const dispatcher = new DomainEventDispatcher<SampleEvents>();
    dispatcher.register("x.happened", async () => {
      calls.push("slow:start");
      await new Promise((resolve) => setTimeout(resolve, 5));
      calls.push("slow:end");
    });
    dispatcher.register("x.happened", () => record(calls, "fast"));
    const sample = Sample.create();
    sample.doX("a");

    await dispatcher.dispatchFor(sample);

    expect(calls).toEqual(["slow:start", "slow:end", "fast"]);
  });

  it("stops at the first failing handler and rejects with the same error", async () => {
    const failure = new Error("handler failed");
    const calls: string[] = [];
    const dispatcher = new DomainEventDispatcher<SampleEvents>();
    dispatcher.register("x.happened", () => Promise.reject(failure));
    dispatcher.register("x.happened", () => record(calls, "second"));
    dispatcher.register("y.happened", () => record(calls, "next event"));
    const sample = Sample.create();
    sample.doX("a");
    sample.doY(1);

    await expect(dispatcher.dispatchFor(sample)).rejects.toBe(failure);
    expect(calls).toEqual([]);
  });

  it("ignores events without handlers", async () => {
    const { calls, dispatcher } = recordingDispatcher();
    const sample = Sample.create();
    sample.doZ();
    sample.doX("a");

    await dispatcher.dispatchFor(sample);

    expect(calls).toEqual(["h1:x:a", "h2:x:a"]);
  });

  it("resolves with nothing to dispatch", async () => {
    const { calls, dispatcher } = recordingDispatcher();

    await dispatcher.dispatchFor(Sample.create());
    await dispatcher.dispatch([]);

    expect(calls).toEqual([]);
  });

  it("does not share handlers between instances (no global state)", async () => {
    const calls: string[] = [];
    const first = new DomainEventDispatcher<SampleEvents>();
    const second = new DomainEventDispatcher<SampleEvents>();
    first.register("x.happened", () => record(calls, "first"));
    const sample = Sample.create();
    sample.doX("a");

    await second.dispatch(sample.domainEvents);
    expect(calls).toEqual([]);

    await first.dispatch(sample.domainEvents);
    expect(calls).toEqual(["first"]);
  });

  it("is not affected by an aborted aggregate with the same id (ADR-0025)", async () => {
    const { calls, dispatcher } = recordingDispatcher();
    const id = UniqueEntityID.create();

    // Operation A: raises an event, then aborts without dispatching.
    const aborted = Sample.create(id);
    aborted.doX("aborted");

    // Operation B: another instance of the same aggregate.
    const committed = Sample.create(id);
    committed.doX("committed");
    await dispatcher.dispatchFor(committed);

    expect(calls).toEqual(["h1:x:committed", "h2:x:committed"]);
  });

  it("types each handler by its eventName, without casts", () => {
    const dispatcher = new DomainEventDispatcher<SampleEvents>();

    dispatcher.register("x.happened", (event) => {
      expectTypeOf(event).toEqualTypeOf<XHappened>();
      expectTypeOf(event.label).toEqualTypeOf<string>();
      return Promise.resolve();
    });
    dispatcher.register("y.happened", (event) => {
      expectTypeOf(event).toEqualTypeOf<YHappened>();
      expectTypeOf(event.amount).toEqualTypeOf<number>();
      return Promise.resolve();
    });

    // @ts-expect-error: "z.happened" is not in the event map
    dispatcher.register("z.happened", () => Promise.resolve());
    // @ts-expect-error: a YHappened handler cannot subscribe to "x.happened"
    dispatcher.register("x.happened", (_event: YHappened) => Promise.resolve());

    // @ts-expect-error: map keys must match the eventName of their event
    const mismatched = new DomainEventDispatcher<{ "x.happened": YHappened }>();
    expect(mismatched).toBeInstanceOf(DomainEventDispatcher);
  });

  it("accepts any event name when no map is given", async () => {
    const dispatcher = new DomainEventDispatcher();
    const received: DomainEvent[] = [];
    dispatcher.register("z.happened", (event) => {
      expectTypeOf(event).toEqualTypeOf<DomainEvent>();
      received.push(event);
      return Promise.resolve();
    });
    const sample = Sample.create();
    sample.doZ();

    await dispatcher.dispatchFor(sample);

    expect(received).toHaveLength(1);
    expect(received[0]).toBeInstanceOf(ZHappened);
  });
});
