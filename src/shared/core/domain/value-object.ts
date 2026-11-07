/** Anything exposing `equals` (value objects, `UniqueEntityID`, entities). */
interface Equatable {
  equals: (other: unknown) => boolean;
}

const isEquatable = (value: object): value is Equatable =>
  typeof (value as Partial<Equatable>).equals === "function";

/** Structural deep equality used by `ValueObject.equals`. */
const deepEquals = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) {
    return true;
  }
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    return false;
  }
  if (a instanceof Date || b instanceof Date) {
    return (
      a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
    );
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => deepEquals(item, b[index]))
    );
  }
  if (isEquatable(a)) {
    return a.equals(b);
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const keys = Object.keys(aRecord);
  return (
    keys.length === Object.keys(bRecord).length &&
    keys.every(
      (key) =>
        Object.hasOwn(bRecord, key) && deepEquals(aRecord[key], bRecord[key])
    )
  );
};

/**
 * Domain object defined by its **value**: immutable, without identity.
 * Two value objects are equal when they are of the same class and their props
 * are structurally equal (primitives, `Date`, arrays, plain objects and nested
 * value objects / IDs via their own `equals`).
 *
 * Validation belongs in a static factory returning `Either`, e.g.
 * `Slug.create(raw): Either<InvalidSlugError, Slug>`.
 */
export abstract class ValueObject<Props extends object> {
  protected readonly props: Readonly<Props>;

  protected constructor(props: Props) {
    this.props = Object.freeze({ ...props });
  }

  equals(other?: ValueObject<Props>): boolean {
    if (other === this) {
      return true;
    }
    if (
      !(other instanceof ValueObject) ||
      other.constructor !== this.constructor
    ) {
      return false;
    }
    return deepEquals(this.props, other.props);
  }
}
