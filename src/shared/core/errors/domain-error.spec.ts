import { describe, expect, expectTypeOf, it } from "vitest";
import {
  DomainError,
  type DomainErrorCode,
  type DomainErrorHttpStatus,
  type DomainErrorI18nKey,
  type DomainErrorProps,
} from "./domain-error";

class SampleError extends DomainError {
  constructor(props: DomainErrorProps) {
    super(props);
  }
}

const BASE = {
  code: "SAMPLE.SOMETHING_WRONG",
  httpStatus: 422,
  i18nKey: "errors.sample.something_wrong",
} as const satisfies DomainErrorProps;

describe("DomainError", () => {
  it("exposes code, i18nKey, args and httpStatus", () => {
    const error = new SampleError({
      ...BASE,
      args: { attempts: 3, field: "x" },
    });

    expect(error.code).toBe("SAMPLE.SOMETHING_WRONG");
    expect(error.i18nKey).toBe("errors.sample.something_wrong");
    expect(error.args).toEqual({ attempts: 3, field: "x" });
    expect(error.httpStatus).toBe(422);
  });

  it("defaults args to an empty object", () => {
    expect(new SampleError(BASE).args).toEqual({});
  });

  it("freezes a copy of args so the caller cannot mutate the error", () => {
    const args: Record<string, string> = { field: "x" };
    const error = new SampleError({ ...BASE, args });
    args.field = "changed";

    expect(error.args).toEqual({ field: "x" });
    expect(Object.isFrozen(error.args)).toBe(true);
  });

  it("is a plain value: not an Error and without a stack trace (ADR-0026)", () => {
    const error = new SampleError(BASE);

    expect(error).not.toBeInstanceOf(Error);
    expect(error).not.toHaveProperty("stack");
  });

  it("restricts code, i18nKey and httpStatus at the type level", () => {
    expectTypeOf<"IAM.WEAK_PASSWORD">().toExtend<DomainErrorCode>();
    expectTypeOf<"iam.weak_password">().not.toExtend<DomainErrorCode>();
    expectTypeOf<"IAM">().not.toExtend<DomainErrorCode>();

    expectTypeOf<"errors.iam.weak_password">().toExtend<DomainErrorI18nKey>();
    expectTypeOf<"iam.errors.weak_password">().not.toExtend<DomainErrorI18nKey>();
    expectTypeOf<"errors.IAM.WEAK_PASSWORD">().not.toExtend<DomainErrorI18nKey>();

    expectTypeOf<404>().toExtend<DomainErrorHttpStatus>();
    expectTypeOf<500>().not.toExtend<DomainErrorHttpStatus>();
  });
});
