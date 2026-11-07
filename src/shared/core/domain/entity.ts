import { UniqueEntityID } from "./unique-entity-id";

/**
 * Domain object defined by its **identity**: two entities are equal when they
 * are of the same class and share the same `id`, whatever their props.
 *
 * The `id` is generated (UUIDv7) when not provided, so the entity has an
 * identity from the moment it is instantiated (ADR-0014). Pass the `id` only
 * when rehydrating from persistence.
 */
export abstract class Entity<Props> {
  private readonly _id: UniqueEntityID;
  protected props: Props;

  protected constructor(props: Props, id?: UniqueEntityID) {
    this._id = id ?? UniqueEntityID.create();
    this.props = props;
  }

  get id(): UniqueEntityID {
    return this._id;
  }

  equals(other?: Entity<unknown>): boolean {
    if (other === this) {
      return true;
    }
    if (!(other instanceof Entity) || other.constructor !== this.constructor) {
      return false;
    }
    return other._id.equals(this._id);
  }
}
