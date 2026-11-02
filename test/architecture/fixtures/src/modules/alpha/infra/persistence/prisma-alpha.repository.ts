// ALLOWED: infra implementing an application port.
import { AlphaRepository } from "../../application/repositories/alpha.repository";

export class PrismaAlphaRepository extends AlphaRepository {
  save(): Promise<void> {
    return Promise.resolve();
  }
}
