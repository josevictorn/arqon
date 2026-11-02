export abstract class AlphaRepository {
  abstract save(id: string): Promise<void>;
}
