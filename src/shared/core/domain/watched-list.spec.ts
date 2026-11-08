import { describe, expect, it } from "vitest";
import { Entity } from "./entity";
import { WatchedList } from "./watched-list";

interface MemberProps {
  role: string;
  userId: string;
}

class Member extends Entity<MemberProps> {
  static create(props: MemberProps): Member {
    return new Member(props);
  }

  get userId(): string {
    return this.props.userId;
  }

  get role(): string {
    return this.props.role;
  }
}

class TestMemberList extends WatchedList<Member> {
  compareItems(a: Member, b: Member): boolean {
    return a.userId === b.userId;
  }
}

/** A fresh instance with the same identity (`userId`), like a rehydrated item. */
const member = (userId: string, role = "member"): Member =>
  Member.create({ role, userId });

const snapshot = (members: Member[]): string[] =>
  members.map((m) => `${m.userId}:${m.role}`);

const state = (list: TestMemberList) => ({
  items: snapshot(list.getItems()),
  new: snapshot(list.getNewItems()),
  removed: snapshot(list.getRemovedItems()),
  updated: snapshot(list.getUpdatedItems()),
});

const loaded = (...userIds: string[]): TestMemberList =>
  new TestMemberList(userIds.map((userId) => member(userId)));

describe("WatchedList", () => {
  describe("initial state", () => {
    it("exposes the loaded items with no pending changes", () => {
      const list = loaded("a", "b");

      expect(state(list)).toEqual({
        items: ["a:member", "b:member"],
        new: [],
        removed: [],
        updated: [],
      });
      expect(list.length).toBe(2);
    });

    it("starts empty when no initial items are given", () => {
      const list = new TestMemberList();

      expect(list.getItems()).toEqual([]);
      expect(list.length).toBe(0);
    });

    it("does not share the constructor array", () => {
      const initial = [member("a")];
      const list = new TestMemberList(initial);

      initial.push(member("b"));

      expect(list.length).toBe(1);
    });

    it("checks existence by identity (compareItems), not by reference", () => {
      const list = loaded("a");

      expect(list.exists(member("a"))).toBe(true);
      expect(list.exists(member("z"))).toBe(false);
    });
  });

  describe("getters return copies", () => {
    it("mutating the array from getItems() does not change the list", () => {
      const list = loaded("a");

      const items = list.getItems();
      items.push(member("b"));
      items.length = 0;

      expect(snapshot(list.getItems())).toEqual(["a:member"]);
    });

    it("mutating the change arrays does not change the list", () => {
      const list = loaded("a", "b");
      list.add(member("c"));
      list.remove(member("a"));
      list.replace(member("b", "admin"));

      list.getNewItems().length = 0;
      list.getRemovedItems().length = 0;
      list.getUpdatedItems().length = 0;

      expect(state(list)).toMatchObject({
        new: ["c:member"],
        removed: ["a:member"],
        updated: ["b:admin"],
      });
    });
  });

  describe("add", () => {
    it("adds an unknown item to items and new", () => {
      const list = loaded("a");

      list.add(member("b"));

      expect(state(list)).toEqual({
        items: ["a:member", "b:member"],
        new: ["b:member"],
        removed: [],
        updated: [],
      });
    });

    it("does not duplicate an item that already exists", () => {
      const list = loaded("a");
      list.add(member("b"));

      list.add(member("a", "admin"));
      list.add(member("b", "admin"));

      expect(state(list)).toEqual({
        items: ["a:member", "b:member"],
        new: ["b:member"],
        removed: [],
        updated: [],
      });
    });

    it("restores a removed item: leaves removed and does not become new", () => {
      const list = loaded("a", "b");
      list.remove(member("a"));

      list.add(member("a"));

      expect(state(list)).toEqual({
        items: ["b:member", "a:member"],
        new: [],
        removed: [],
        updated: [],
      });
    });
  });

  describe("remove", () => {
    it("discards a new item without marking it as removed", () => {
      const list = loaded("a");
      list.add(member("b"));

      list.remove(member("b"));

      expect(state(list)).toEqual({
        items: ["a:member"],
        new: [],
        removed: [],
        updated: [],
      });
    });

    it("moves an initial item to removed", () => {
      const list = loaded("a", "b");

      list.remove(member("a"));

      expect(state(list)).toEqual({
        items: ["b:member"],
        new: [],
        removed: ["a:member"],
        updated: [],
      });
    });

    it("takes an updated initial item out of updated", () => {
      const list = loaded("a");
      list.replace(member("a", "admin"));

      list.remove(member("a"));

      expect(state(list)).toEqual({
        items: [],
        new: [],
        removed: ["a:admin"],
        updated: [],
      });
    });

    it("keeps the stored instance, not the argument, in removed", () => {
      const stored = member("a");
      const list = new TestMemberList([stored]);

      list.remove(member("a", "other"));

      expect(list.getRemovedItems()[0]).toBe(stored);
    });

    it("ignores an item that is not in the list", () => {
      const list = loaded("a");
      list.remove(member("a"));

      list.remove(member("a"));
      list.remove(member("z"));

      expect(state(list)).toEqual({
        items: [],
        new: [],
        removed: ["a:member"],
        updated: [],
      });
    });
  });

  describe("replace", () => {
    it("marks an initial item as updated without duplicating it in items", () => {
      const list = loaded("a", "b");

      list.replace(member("a", "admin"));

      expect(state(list)).toEqual({
        items: ["a:admin", "b:member"],
        new: [],
        removed: [],
        updated: ["a:admin"],
      });
    });

    it("does not duplicate an initial item replaced twice", () => {
      const list = loaded("a");

      list.replace(member("a", "admin"));
      list.replace(member("a", "owner"));

      expect(state(list)).toEqual({
        items: ["a:owner"],
        new: [],
        removed: [],
        updated: ["a:owner"],
      });
    });

    it("keeps a new item only in new, with the updated value", () => {
      const list = loaded("a");
      list.add(member("b"));

      list.replace(member("b", "admin"));

      expect(state(list)).toEqual({
        items: ["a:member", "b:admin"],
        new: ["b:admin"],
        removed: [],
        updated: [],
      });
    });

    it("ignores an item that is not in the list (missing or removed)", () => {
      const list = loaded("a", "b");
      list.remove(member("b"));

      list.replace(member("z", "admin"));
      list.replace(member("b", "admin"));

      expect(state(list)).toEqual({
        items: ["a:member"],
        new: [],
        removed: ["b:member"],
        updated: [],
      });
    });
  });

  describe("update (bulk)", () => {
    /** Same initial state and history, so both lists start identical. */
    const prepare = (): TestMemberList => {
      const list = loaded("a", "b", "c", "d");
      list.remove(member("d"));
      list.add(member("e"));
      list.replace(member("c", "admin"));
      return list;
    };

    it("matches the equivalent sequence of add/remove", () => {
      const viaUpdate = prepare();
      const viaSteps = prepare();
      // keeps a, c and e; drops b; restores d; adds f
      const target = [member("a"), member("c"), member("d"), member("f")];

      viaUpdate.update(target);

      viaSteps.remove(member("b"));
      viaSteps.remove(member("e"));
      viaSteps.add(member("d"));
      viaSteps.add(member("f"));

      expect(state(viaUpdate)).toEqual(state(viaSteps));
      expect(state(viaUpdate)).toEqual({
        items: ["a:member", "c:admin", "d:member", "f:member"],
        new: ["f:member"],
        removed: ["b:member"],
        updated: ["c:admin"],
      });
    });

    it("keeps the current value of items present in both lists", () => {
      const list = loaded("a");

      list.update([member("a", "admin")]);

      expect(state(list)).toEqual({
        items: ["a:member"],
        new: [],
        removed: [],
        updated: [],
      });
    });

    it("clears the list when given an empty array", () => {
      const list = prepare();

      list.update([]);

      expect(state(list)).toEqual({
        items: [],
        new: [],
        removed: ["d:member", "a:member", "b:member", "c:admin"],
        updated: [],
      });
    });
  });

  it("keeps new, removed and updated disjoint", () => {
    const list = loaded("a", "b", "c");
    list.replace(member("a", "admin"));
    list.remove(member("a"));
    list.add(member("a"));
    list.add(member("d"));
    list.replace(member("d", "admin"));
    list.replace(member("b", "admin"));
    list.remove(member("c"));

    const ids = [
      ...list.getNewItems(),
      ...list.getRemovedItems(),
      ...list.getUpdatedItems(),
    ].map((m) => m.userId);

    expect(new Set(ids).size).toBe(ids.length);
    expect(state(list)).toEqual({
      items: ["b:admin", "a:member", "d:admin"],
      new: ["d:admin"],
      removed: ["c:member"],
      updated: ["b:admin"],
    });
  });
});
