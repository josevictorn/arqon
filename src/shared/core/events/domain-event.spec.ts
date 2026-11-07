import { describe, expect, expectTypeOf, it } from "vitest";
import { UniqueEntityID } from "../domain/unique-entity-id";
import { BaseDomainEvent, type DomainEvent } from "./domain-event";

class ThingHappened extends BaseDomainEvent<"thing.happened"> {
  readonly eventName = "thing.happened";

  constructor(aggregateId: UniqueEntityID, occurredAt?: Date) {
    super(aggregateId, occurredAt);
  }
}

describe("BaseDomainEvent", () => {
  it("fills eventId with a UUIDv7 and keeps the aggregateId", () => {
    const aggregateId = UniqueEntityID.create();
    const event = new ThingHappened(aggregateId);

    expect(UniqueEntityID.parse(event.eventId.toString()).isRight()).toBe(true);
    expect(event.aggregateId).toBe(aggregateId);
    expect(event.eventName).toBe("thing.happened");
  });

  it("gives each event its own eventId", () => {
    const aggregateId = UniqueEntityID.create();

    expect(
      new ThingHappened(aggregateId).eventId.equals(
        new ThingHappened(aggregateId).eventId
      )
    ).toBe(false);
  });

  it("defaults occurredAt to now", () => {
    const before = Date.now();
    const event = new ThingHappened(UniqueEntityID.create());

    expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(event.occurredAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("accepts an explicit occurredAt", () => {
    const occurredAt = new Date("2026-01-01T00:00:00.000Z");

    expect(
      new ThingHappened(UniqueEntityID.create(), occurredAt).occurredAt
    ).toBe(occurredAt);
  });

  it("is a DomainEvent with a literal eventName", () => {
    expectTypeOf<ThingHappened>().toExtend<DomainEvent<"thing.happened">>();
    expectTypeOf<
      ThingHappened["eventName"]
    >().toEqualTypeOf<"thing.happened">();
  });
});
