/** `<CONTEXT>.<ERROR>` in upper case, e.g. `IAM.WEAK_PASSWORD`. */
export type DomainErrorCode = `${Uppercase<string>}.${Uppercase<string>}`;

/** `errors.<ctx>.<error>` in lower case, e.g. `errors.iam.weak_password`. */
export type DomainErrorI18nKey =
  `errors.${Lowercase<string>}.${Lowercase<string>}`;

/** Business errors are always 4xx; a 5xx is never a domain error. */
export type DomainErrorHttpStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429;

export type DomainErrorArgValue = string | number | boolean | null;

/** Dynamic values interpolated into the translated message (and useful for debugging). */
export type DomainErrorArgs = Readonly<Record<string, DomainErrorArgValue>>;

export interface DomainErrorProps {
  readonly args?: DomainErrorArgs;
  readonly code: DomainErrorCode;
  readonly httpStatus: DomainErrorHttpStatus;
  readonly i18nKey: DomainErrorI18nKey;
}

/**
 * Expected business error, returned as a **value** in `Left` of an
 * `Either<DomainError, T>` and never thrown.
 *
 * It deliberately does **not** extend `Error` (ADR-0026): no stack trace
 * (ADR-0013 forbids stacks on 4xx business errors) and no accidental `throw`.
 */
export abstract class DomainError {
  readonly args: DomainErrorArgs;
  readonly code: DomainErrorCode;
  readonly httpStatus: DomainErrorHttpStatus;
  readonly i18nKey: DomainErrorI18nKey;

  protected constructor(props: DomainErrorProps) {
    this.code = props.code;
    this.i18nKey = props.i18nKey;
    this.args = Object.freeze({ ...(props.args ?? {}) });
    this.httpStatus = props.httpStatus;
  }
}
