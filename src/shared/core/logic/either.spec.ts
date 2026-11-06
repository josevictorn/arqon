import { describe, expect, expectTypeOf, it } from "vitest";
import { combine, type Either, Left, left, Right, right } from "./either";

const parsePositive = (input: number): Either<string, number> =>
  input > 0 ? right(input) : left("not_positive");

describe("Either", () => {
  describe("left()", () => {
    it("builds a Left holding the failure", () => {
      const result = left("boom");

      expect(result).toBeInstanceOf(Left);
      expect(result.value).toBe("boom");
      expect(result.isLeft()).toBe(true);
      expect(result.isRight()).toBe(false);
    });
  });

  describe("right()", () => {
    it("builds a Right holding the success", () => {
      const result = right(42);

      expect(result).toBeInstanceOf(Right);
      expect(result.value).toBe(42);
      expect(result.isLeft()).toBe(false);
      expect(result.isRight()).toBe(true);
    });
  });

  describe("type narrowing", () => {
    it("narrows value to the success type after an early return on isLeft()", () => {
      const run = (input: number): Either<string, number> => {
        const result = parsePositive(input);
        if (result.isLeft()) {
          expectTypeOf(result.value).toEqualTypeOf<string>();
          return result;
        }
        expectTypeOf(result.value).toEqualTypeOf<number>();
        return right(result.value * 2);
      };

      expect(run(2).value).toBe(4);
      expect(run(-1).value).toBe("not_positive");
    });

    it("narrows value to the failure type after an early return on isRight()", () => {
      const result = parsePositive(-1);
      if (result.isRight()) {
        expectTypeOf(result.value).toEqualTypeOf<number>();
        throw new Error("expected a Left");
      }
      expectTypeOf(result.value).toEqualTypeOf<string>();

      expect(result.value).toBe("not_positive");
    });

    it("keeps Left and Right distinct when both sides have the same type", () => {
      const result: Either<string, string> = right("ok");
      if (result.isLeft()) {
        throw new Error("expected a Right");
      }
      expectTypeOf(result).toEqualTypeOf<Right<string, string>>();

      expect(result.value).toBe("ok");
    });
  });

  describe("map", () => {
    it("transforms the value of a Right", () => {
      const result = parsePositive(2).map((n) => `#${n}`);

      expectTypeOf(result).toEqualTypeOf<Either<string, string>>();
      expect(result.isRight()).toBe(true);
      expect(result.value).toBe("#2");
    });

    it("keeps a Left untouched without calling the function", () => {
      let called = false;
      const result = parsePositive(-1).map((n) => {
        called = true;
        return n * 2;
      });

      expect(called).toBe(false);
      expect(result.isLeft()).toBe(true);
      expect(result.value).toBe("not_positive");
    });
  });

  describe("mapLeft", () => {
    it("transforms the value of a Left", () => {
      const result = parsePositive(-1).mapLeft((code) => ({ code }));

      expectTypeOf(result).toEqualTypeOf<Either<{ code: string }, number>>();
      expect(result.isLeft()).toBe(true);
      expect(result.value).toEqual({ code: "not_positive" });
    });

    it("keeps a Right untouched without calling the function", () => {
      let called = false;
      const result = parsePositive(3).mapLeft((code) => {
        called = true;
        return code.length;
      });

      expect(called).toBe(false);
      expect(result.isRight()).toBe(true);
      expect(result.value).toBe(3);
    });
  });

  describe("flatMap", () => {
    const half = (n: number): Either<"odd", number> =>
      n % 2 === 0 ? right(n / 2) : left("odd");

    it("chains a Right into the next Either (success)", () => {
      const result = parsePositive(4).flatMap(half);

      expectTypeOf(result).toEqualTypeOf<Either<string, number>>();
      expect(result.isRight()).toBe(true);
      expect(result.value).toBe(2);
    });

    it("chains a Right into the next Either (failure)", () => {
      const result = parsePositive(3).flatMap(half);

      expect(result.isLeft()).toBe(true);
      expect(result.value).toBe("odd");
    });

    it("short-circuits on a Left without calling the function", () => {
      let called = false;
      const result = parsePositive(-1).flatMap((n) => {
        called = true;
        return half(n);
      });

      expect(called).toBe(false);
      expect(result.isLeft()).toBe(true);
      expect(result.value).toBe("not_positive");
    });
  });

  describe("fold", () => {
    const describeResult = (input: number): string =>
      parsePositive(input).fold(
        (error) => `error:${error}`,
        (value) => `value:${value}`
      );

    it("applies onRight to a Right", () => {
      expect(describeResult(5)).toBe("value:5");
    });

    it("applies onLeft to a Left", () => {
      expect(describeResult(0)).toBe("error:not_positive");
    });
  });

  describe("combine", () => {
    it("returns Right with an empty tuple for an empty list", () => {
      const result = combine([]);

      expect(result.isRight()).toBe(true);
      expect(result.value).toEqual([]);
    });

    it("returns Right with the values in the same order when there is no Left", () => {
      const name: Either<"bad_name", string> = right("Ada");
      const age: Either<"bad_age", number> = right(36);
      const active: Either<"bad_flag", boolean> = right(true);

      const result = combine([name, age, active]);

      expectTypeOf(result).toEqualTypeOf<
        Either<"bad_name" | "bad_age" | "bad_flag", [string, number, boolean]>
      >();
      expect(result.isRight()).toBe(true);
      expect(result.value).toEqual(["Ada", 36, true]);
    });

    it("returns the first Left of the list", () => {
      const result = combine([
        right<string, string>("ok"),
        left<string, number>("first_error"),
        right<number, string>(1),
        left<string, number>("second_error"),
      ]);

      expect(result.isLeft()).toBe(true);
      expect(result.value).toBe("first_error");
    });
  });
});
