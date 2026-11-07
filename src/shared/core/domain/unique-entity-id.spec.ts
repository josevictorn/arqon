import { describe, expect, it } from "vitest";
import { InvalidUniqueEntityIdError } from "../errors/common-errors";
import { UniqueEntityID } from "./unique-entity-id";

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const VALID_V7 = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const VALID_V4 = "9b2f0c1e-6a3d-4f8b-9c7e-2d1a0b3c4e5f";

/** The 48 leading bits of a UUIDv7 are the Unix timestamp in milliseconds. */
const timestampOf = (id: UniqueEntityID): number =>
  Number.parseInt(id.toString().replaceAll("-", "").slice(0, 12), 16);

describe("UniqueEntityID", () => {
  describe("create", () => {
    it("generates a UUIDv7 (version 7, variant 10xx)", () => {
      expect(UniqueEntityID.create().toString()).toMatch(UUID_V7);
    });

    it("embeds the current Unix timestamp in ms in the leading 48 bits", () => {
      const before = Date.now();
      const id = UniqueEntityID.create();
      const after = Date.now();

      expect(timestampOf(id)).toBeGreaterThanOrEqual(before);
      expect(timestampOf(id)).toBeLessThanOrEqual(after);
    });

    it("is monotonic: 10 000 IDs in sequence are strictly increasing", () => {
      const ids = Array.from({ length: 10_000 }, () =>
        UniqueEntityID.create().toString()
      );

      // Sorted and without duplicates = strictly increasing.
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual([...ids].sort());
    });
  });

  describe("restore", () => {
    it("rehydrates a persisted value as is", () => {
      const id = UniqueEntityID.restore(VALID_V7);

      expect(id.toString()).toBe(VALID_V7);
      expect(id.toValue()).toBe(VALID_V7);
    });
  });

  describe("parse", () => {
    it("returns Right for a valid UUIDv7", () => {
      const result = UniqueEntityID.parse(VALID_V7);

      expect(result.isRight()).toBe(true);
      expect(result.value).toBeInstanceOf(UniqueEntityID);
      expect(result.value.toString()).toBe(VALID_V7);
    });

    it("returns Right for a freshly created ID", () => {
      const id = UniqueEntityID.create();

      expect(UniqueEntityID.parse(id.toString()).isRight()).toBe(true);
    });

    it.each([
      ["a valid UUIDv4", VALID_V4],
      ["a malformed string", "abc"],
      ["an empty string", ""],
    ])("returns Left<InvalidUniqueEntityIdError> for %s", (_, value) => {
      const result = UniqueEntityID.parse(value);

      expect(result.isLeft()).toBe(true);
      expect(result.value).toBeInstanceOf(InvalidUniqueEntityIdError);
      expect(result.value).toMatchObject({
        args: { value },
        code: "COMMON.INVALID_ID",
      });
    });
  });

  describe("equals", () => {
    it("is true for different instances with the same value", () => {
      expect(
        UniqueEntityID.restore(VALID_V7).equals(
          UniqueEntityID.restore(VALID_V7)
        )
      ).toBe(true);
    });

    it("is false for different values", () => {
      expect(UniqueEntityID.create().equals(UniqueEntityID.create())).toBe(
        false
      );
    });

    it("is false for undefined", () => {
      expect(UniqueEntityID.create().equals(undefined)).toBe(false);
    });
  });
});
