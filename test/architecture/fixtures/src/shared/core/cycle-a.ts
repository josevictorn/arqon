// VIOLATION no-circular: cycle-a -> cycle-b -> cycle-a.
import { b } from "./cycle-b";

export const a = (): number => b() + 1;
