/**
 * Errors as values (principle 7): use cases and entities return
 * `Either<DomainError, T>` instead of throwing for expected business errors.
 *
 * `Left` carries the failure and `Right` the success. `isLeft()` / `isRight()`
 * are type guards, so `if (result.isLeft()) return result;` narrows
 * `result.value` to the success type without a cast.
 *
 * Both classes declare identical method signatures on purpose: TypeScript can
 * only call a generic method on the `Left | Right` union when the signatures
 * of every member are identical.
 */
export type Either<L, R> = Left<L, R> | Right<L, R>;

export class Left<L, R> {
  /** Discriminant that keeps `Left` and `Right` distinct even when `L` and `R` match. */
  readonly kind = "left" as const;
  readonly value: L;

  constructor(value: L) {
    this.value = value;
  }

  isLeft(): this is Left<L, R> {
    return true;
  }

  isRight(): this is Right<L, R> {
    return false;
  }

  map<U>(_fn: (value: R) => U): Either<L, U> {
    return new Left<L, U>(this.value);
  }

  mapLeft<M>(fn: (value: L) => M): Either<M, R> {
    return new Left<M, R>(fn(this.value));
  }

  flatMap<M, U>(_fn: (value: R) => Either<M, U>): Either<L | M, U> {
    return new Left<L | M, U>(this.value);
  }

  fold<T>(onLeft: (value: L) => T, _onRight: (value: R) => T): T {
    return onLeft(this.value);
  }
}

export class Right<L, R> {
  /** Discriminant that keeps `Left` and `Right` distinct even when `L` and `R` match. */
  readonly kind = "right" as const;
  readonly value: R;

  constructor(value: R) {
    this.value = value;
  }

  isLeft(): this is Left<L, R> {
    return false;
  }

  isRight(): this is Right<L, R> {
    return true;
  }

  map<U>(fn: (value: R) => U): Either<L, U> {
    return new Right<L, U>(fn(this.value));
  }

  mapLeft<M>(_fn: (value: L) => M): Either<M, R> {
    return new Right<M, R>(this.value);
  }

  flatMap<M, U>(fn: (value: R) => Either<M, U>): Either<L | M, U> {
    return fn(this.value);
  }

  fold<T>(_onLeft: (value: L) => T, onRight: (value: R) => T): T {
    return onRight(this.value);
  }
}

export const left = <L, R = never>(value: L): Either<L, R> =>
  new Left<L, R>(value);

export const right = <R, L = never>(value: R): Either<L, R> =>
  new Right<L, R>(value);

type AnyEither = Either<unknown, unknown>;

/** Failure type of an `Either` (distributes over the `Left | Right` union). */
export type LeftOf<E> = E extends {
  readonly kind: "left";
  readonly value: infer L;
}
  ? L
  : never;

/** Success type of an `Either` (distributes over the `Left | Right` union). */
export type RightOf<E> = E extends {
  readonly kind: "right";
  readonly value: infer R;
}
  ? R
  : never;

/** Success values of a tuple of `Either`s, in the same order. */
export type CombinedValues<T extends readonly AnyEither[]> = {
  -readonly [K in keyof T]: RightOf<T[K]>;
};

/**
 * Combines several `Either`s (e.g. the value objects validated in
 * `Entity.create`): returns the **first** `Left` of the list or, when there is
 * none, a `Right` with the tuple of values in the same order.
 * An empty list yields `right([])`.
 */
export const combine = <const T extends readonly AnyEither[]>(
  eithers: T
): Either<LeftOf<T[number]>, CombinedValues<T>> => {
  const values: unknown[] = [];

  for (const either of eithers) {
    if (either.isLeft()) {
      return left(either.value as LeftOf<T[number]>);
    }
    values.push(either.value);
  }

  return right(values as CombinedValues<T>);
};
