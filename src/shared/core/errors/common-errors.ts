import { DomainError } from "./domain-error";

/** The requested resource does not exist (or is not visible to the caller's tenant). */
export class ResourceNotFoundError extends DomainError {
  constructor(resource: string, id: string) {
    super({
      args: { id, resource },
      code: "COMMON.RESOURCE_NOT_FOUND",
      httpStatus: 404,
      i18nKey: "errors.common.resource_not_found",
    });
  }
}

/** The actor is not allowed to perform the action. */
export class NotAllowedError extends DomainError {
  constructor() {
    super({
      code: "COMMON.NOT_ALLOWED",
      httpStatus: 403,
      i18nKey: "errors.common.not_allowed",
    });
  }
}

/** The value is not a valid UUIDv7 (malformed or another UUID version). */
export class InvalidUniqueEntityIdError extends DomainError {
  constructor(value: string) {
    super({
      args: { value },
      code: "COMMON.INVALID_ID",
      httpStatus: 422,
      i18nKey: "errors.common.invalid_id",
    });
  }
}

/** Optimistic concurrency conflict: the aggregate version changed since it was read. */
export class ConcurrencyError extends DomainError {
  constructor(resource: string, id: string) {
    super({
      args: { id, resource },
      code: "COMMON.CONCURRENCY_CONFLICT",
      httpStatus: 409,
      i18nKey: "errors.common.concurrency_conflict",
    });
  }
}
