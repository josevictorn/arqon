import { describe, expect, it } from "vitest";
import {
  ConcurrencyError,
  NotAllowedError,
  ResourceNotFoundError,
} from "./common-errors";
import { DomainError } from "./domain-error";

const fieldsOf = (error: DomainError) => ({
  args: error.args,
  code: error.code,
  httpStatus: error.httpStatus,
  i18nKey: error.i18nKey,
});

describe("common errors", () => {
  it("ResourceNotFoundError is a 404 with resource and id in args", () => {
    const error = new ResourceNotFoundError(
      "User",
      "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"
    );

    expect(error).toBeInstanceOf(DomainError);
    expect(fieldsOf(error)).toEqual({
      args: { id: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b", resource: "User" },
      code: "COMMON.RESOURCE_NOT_FOUND",
      httpStatus: 404,
      i18nKey: "errors.common.resource_not_found",
    });
  });

  it("NotAllowedError is a 403 without args", () => {
    const error = new NotAllowedError();

    expect(error).toBeInstanceOf(DomainError);
    expect(fieldsOf(error)).toEqual({
      args: {},
      code: "COMMON.NOT_ALLOWED",
      httpStatus: 403,
      i18nKey: "errors.common.not_allowed",
    });
  });

  it("ConcurrencyError is a 409 with resource and id in args", () => {
    const error = new ConcurrencyError("Organization", "org-1");

    expect(error).toBeInstanceOf(DomainError);
    expect(fieldsOf(error)).toEqual({
      args: { id: "org-1", resource: "Organization" },
      code: "COMMON.CONCURRENCY_CONFLICT",
      httpStatus: 409,
      i18nKey: "errors.common.concurrency_conflict",
    });
  });
});
