// CI smoke test (T1.07) — scenario 1: lint. Never merge.
// Explicit `any` is valid TypeScript but breaks Biome's noExplicitAny.
export const identity = (value: any) => value;
