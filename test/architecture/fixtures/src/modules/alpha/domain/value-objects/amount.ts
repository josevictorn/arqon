// ALLOWED: domain importing shared/core.
import type { Either } from "@/shared/core/either";

export type Amount = Either<string, number>;
