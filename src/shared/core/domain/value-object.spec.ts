import { describe, expect, it } from "vitest";
import { UniqueEntityID } from "./unique-entity-id";
import { ValueObject } from "./value-object";

interface MoneyProps {
  amountCents: number;
  currency: string;
}

class Money extends ValueObject<MoneyProps> {
  static create(amountCents: number, currency: string): Money {
    return Money.fromProps({ amountCents, currency });
  }

  static fromProps(props: MoneyProps): Money {
    return new Money(props);
  }

  get amountCents(): number {
    return this.props.amountCents;
  }
}

class Price extends ValueObject<MoneyProps> {
  static create(amountCents: number, currency: string): Price {
    return new Price({ amountCents, currency });
  }
}

interface SampleProps {
  value: unknown;
}

/** Generic VO to exercise every branch of the structural comparison. */
class Sample extends ValueObject<SampleProps> {
  static of(value: unknown): Sample {
    return new Sample({ value });
  }

  /** Exposes `props` only to prove immutability in the test. */
  get rawProps(): Readonly<SampleProps> {
    return this.props;
  }
}

const ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const OTHER_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c";

const same = (a: unknown, b: unknown): boolean =>
  Sample.of(a).equals(Sample.of(b));

describe("ValueObject", () => {
  describe("immutability", () => {
    it("freezes props: assignment throws and the value is kept", () => {
      const sample = Sample.of(1);
      const props = sample.rawProps as SampleProps;

      expect(Object.isFrozen(props)).toBe(true);
      expect(() => {
        props.value = 2;
      }).toThrow(TypeError);
      expect(sample.rawProps.value).toBe(1);
    });

    it("copies props so the caller cannot mutate the VO later", () => {
      const input = { amountCents: 100, currency: "BRL" };
      const money = Money.fromProps(input);
      input.amountCents = 999;

      expect(money.amountCents).toBe(100);
    });
  });

  describe("equals (structural)", () => {
    it("is true for different instances with equivalent props", () => {
      expect(Money.create(100, "BRL").equals(Money.create(100, "BRL"))).toBe(
        true
      );
    });

    it("is true for the same instance", () => {
      const money = Money.create(100, "BRL");

      expect(money.equals(money)).toBe(true);
    });

    it("is false when a prop differs", () => {
      expect(Money.create(100, "BRL").equals(Money.create(100, "USD"))).toBe(
        false
      );
    });

    it("is false for different classes with the same props", () => {
      expect(Money.create(100, "BRL").equals(Price.create(100, "BRL"))).toBe(
        false
      );
    });

    it("is false for undefined", () => {
      expect(Money.create(100, "BRL").equals(undefined)).toBe(false);
    });

    it("compares primitives with Object.is", () => {
      expect(same(Number.NaN, Number.NaN)).toBe(true);
      expect(same(null, null)).toBe(true);
      expect(same(null, {})).toBe(false);
      expect(same({}, null)).toBe(false);
      expect(same(1, "1")).toBe(false);
      expect(same(undefined, null)).toBe(false);
    });

    it("compares Date by time", () => {
      expect(same(new Date(0), new Date(0))).toBe(true);
      expect(same(new Date(0), new Date(1))).toBe(false);
      expect(same(new Date(0), {})).toBe(false);
      expect(same({}, new Date(0))).toBe(false);
    });

    it("compares arrays item by item", () => {
      expect(same([1, [2, 3]], [1, [2, 3]])).toBe(true);
      expect(same([1, 2], [1, 3])).toBe(false);
      expect(same([1, 2], [1, 2, 3])).toBe(false);
      expect(same([], {})).toBe(false);
      expect(same({}, [])).toBe(false);
    });

    it("compares plain objects key by key", () => {
      expect(same({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true);
      expect(same({ a: 1 }, { a: 2 })).toBe(false);
      expect(same({ a: 1 }, { a: 1, b: 2 })).toBe(false);
      expect(same({ a: undefined }, { b: undefined })).toBe(false);
    });

    it("compares nested value objects and IDs through their equals", () => {
      expect(
        same(
          { id: UniqueEntityID.restore(ID), price: Money.create(1, "BRL") },
          { id: UniqueEntityID.restore(ID), price: Money.create(1, "BRL") }
        )
      ).toBe(true);
      expect(
        same(UniqueEntityID.restore(ID), UniqueEntityID.restore(OTHER_ID))
      ).toBe(false);
      expect(same(Money.create(1, "BRL"), Money.create(2, "BRL"))).toBe(false);
      expect(
        same([UniqueEntityID.restore(ID)], [UniqueEntityID.restore(ID)])
      ).toBe(true);
    });
  });
});
