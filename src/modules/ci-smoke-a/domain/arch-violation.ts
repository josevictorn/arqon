// CI smoke test (T1.07) — scenario 3: architecture. Never merge.
// Lint- and type-clean, but a module imports another module's files.
import { smokeB } from "@/modules/ci-smoke-b/domain/smoke-b";

export const smokeA = smokeB;
