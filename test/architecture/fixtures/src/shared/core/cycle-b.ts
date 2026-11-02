// VIOLATION no-circular: cycle-b -> cycle-a -> cycle-b.
import { a } from "./cycle-a";

export const b = (): number => (a.length > 0 ? 0 : 1);
