import { describe, expect, it } from "vitest";
import { Entity } from "./entity";
import { UniqueEntityID } from "./unique-entity-id";

interface NamedProps {
  name: string;
}

class User extends Entity<NamedProps> {
  static create(props: NamedProps, id?: UniqueEntityID): User {
    return new User(props, id);
  }

  get name(): string {
    return this.props.name;
  }
}

class Organization extends Entity<NamedProps> {
  static create(props: NamedProps, id?: UniqueEntityID): Organization {
    return new Organization(props, id);
  }
}

const ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

describe("Entity", () => {
  it("generates a UUIDv7 id when none is given", () => {
    const user = User.create({ name: "Ana" });

    expect(user.id).toBeInstanceOf(UniqueEntityID);
    expect(UniqueEntityID.parse(user.id.toString()).isRight()).toBe(true);
  });

  it("keeps the given id (rehydration)", () => {
    const id = UniqueEntityID.restore(ID);

    expect(User.create({ name: "Ana" }, id).id).toBe(id);
  });

  it("exposes props to subclasses", () => {
    expect(User.create({ name: "Ana" }).name).toBe("Ana");
  });

  describe("equals (by identity)", () => {
    it("is true for the same instance", () => {
      const user = User.create({ name: "Ana" });

      expect(user.equals(user)).toBe(true);
    });

    it("is true for the same class and id, even with different props", () => {
      const a = User.create({ name: "Ana" }, UniqueEntityID.restore(ID));
      const b = User.create({ name: "Bia" }, UniqueEntityID.restore(ID));

      expect(a.equals(b)).toBe(true);
    });

    it("is false for different ids with the same props", () => {
      expect(
        User.create({ name: "Ana" }).equals(User.create({ name: "Ana" }))
      ).toBe(false);
    });

    it("is false for different classes with the same id", () => {
      const user = User.create({ name: "Ana" }, UniqueEntityID.restore(ID));
      const org = Organization.create(
        { name: "Ana" },
        UniqueEntityID.restore(ID)
      );

      expect(user.equals(org)).toBe(false);
    });

    it("is false for undefined", () => {
      expect(User.create({ name: "Ana" }).equals(undefined)).toBe(false);
    });
  });
});
