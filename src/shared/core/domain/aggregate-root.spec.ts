import { describe, expect, it } from "vitest";
import { BaseDomainEvent } from "../events/domain-event";
import { AggregateRoot } from "./aggregate-root";
import { Entity } from "./entity";
import { UniqueEntityID } from "./unique-entity-id";

class CounterIncremented extends BaseDomainEvent<"counter.incremented"> {
  readonly eventName = "counter.incremented";

  constructor(
    aggregateId: UniqueEntityID,
    readonly value: number
  ) {
    super(aggregateId);
  }
}

interface CounterProps {
  value: number;
}

class Counter extends AggregateRoot<CounterProps> {
  static create(): Counter {
    return new Counter({ value: 0 });
  }

  static restore(
    props: CounterProps,
    id: UniqueEntityID,
    version: number
  ): Counter {
    return new Counter(props, id, version);
  }

  get value(): number {
    return this.props.value;
  }

  increment(): void {
    this.props.value += 1;
    this.addDomainEvent(new CounterIncremented(this.id, this.props.value));
  }
}

const ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

describe("AggregateRoot", () => {
  it("is an Entity with a generated id", () => {
    const counter = Counter.create();

    expect(counter).toBeInstanceOf(Entity);
    expect(UniqueEntityID.parse(counter.id.toString()).isRight()).toBe(true);
  });

  describe("version", () => {
    it("is 0 for a new aggregate (never persisted)", () => {
      expect(Counter.create().version).toBe(0);
    });

    it("is restored by the mapper through the constructor", () => {
      const counter = Counter.restore(
        { value: 3 },
        UniqueEntityID.restore(ID),
        7
      );

      expect(counter.version).toBe(7);
      expect(counter.id.toString()).toBe(ID);
      expect(counter.value).toBe(3);
    });
  });

  describe("domain events", () => {
    it("starts with no events", () => {
      expect(Counter.create().domainEvents).toEqual([]);
    });

    it("keeps the events in the order they were added", () => {
      const counter = Counter.create();
      counter.increment();
      counter.increment();

      expect(
        counter.domainEvents.map((event) =>
          event instanceof CounterIncremented ? event.value : undefined
        )
      ).toEqual([1, 2]);
      expect(
        counter.domainEvents.every((e) => e.aggregateId === counter.id)
      ).toBe(true);
    });

    it("exposes a copy that cannot change the pending events", () => {
      const counter = Counter.create();
      counter.increment();

      const snapshot = counter.domainEvents;
      counter.increment();

      expect(snapshot).toHaveLength(1);
      expect(counter.domainEvents).toHaveLength(2);
    });

    it("pullDomainEvents returns the events and leaves the list empty", () => {
      const counter = Counter.create();
      counter.increment();
      counter.increment();

      const pulled = counter.pullDomainEvents();

      expect(pulled).toHaveLength(2);
      expect(counter.domainEvents).toEqual([]);
      expect(counter.pullDomainEvents()).toEqual([]);
    });

    it("clearEvents discards the pending events", () => {
      const counter = Counter.create();
      counter.increment();

      counter.clearEvents();

      expect(counter.domainEvents).toEqual([]);
    });

    it("keeps events per instance, even for the same id", () => {
      const id = UniqueEntityID.restore(ID);
      const a = Counter.restore({ value: 0 }, id, 1);
      const b = Counter.restore({ value: 0 }, id, 1);

      a.increment();

      expect(a.domainEvents).toHaveLength(1);
      expect(b.domainEvents).toEqual([]);
    });
  });
});
