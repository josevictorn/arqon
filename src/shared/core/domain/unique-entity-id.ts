import { v7, validate, version } from "uuid";
import { InvalidUniqueEntityIdError } from "../errors/common-errors";
import { type Either, left, right } from "../logic/either";

/**
 * Identity of every entity, aggregate and event: a UUIDv7 (RFC 9562) generated
 * in the domain, before any persistence (ADR-0014).
 *
 * This is the **only** file that imports `uuid` (ADR-0027); everything else
 * creates and validates IDs through this class.
 */
export class UniqueEntityID {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * New UUIDv7: 48-bit Unix timestamp in ms, version `7`, variant `10xx`.
   * Monotonic within the process: IDs created in the same millisecond come out
   * in strictly increasing order.
   */
  static create(): UniqueEntityID {
    return new UniqueEntityID(v7());
  }

  /** Rehydrates a trusted ID read from persistence (no validation). */
  static restore(value: string): UniqueEntityID {
    return new UniqueEntityID(value);
  }

  /** Validates an untrusted value: it must be a well-formed UUID **and** version 7. */
  static parse(
    value: string
  ): Either<InvalidUniqueEntityIdError, UniqueEntityID> {
    if (!(validate(value) && version(value) === 7)) {
      return left(new InvalidUniqueEntityIdError(value));
    }
    return right(new UniqueEntityID(value));
  }

  toString(): string {
    return this.value;
  }

  toValue(): string {
    return this.value;
  }

  equals(other?: UniqueEntityID): boolean {
    if (!(other instanceof UniqueEntityID)) {
      return false;
    }
    return other.value === this.value;
  }
}
