// ALLOWED: a module importing its own files.
import { BetaEntity } from "./domain/beta.entity";

export class BetaModule {
  static readonly providers = [BetaEntity];
}
