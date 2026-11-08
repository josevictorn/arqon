/**
 * Child collection of an aggregate that tracks what changed since it was
 * loaded, so the repository persists only the delta and the aggregate checks
 * collection invariants in memory.
 *
 * Every lookup goes through `compareItems` (never `===`): rehydrated items are
 * different instances that share an identity.
 *
 * `getNewItems()`, `getRemovedItems()` and `getUpdatedItems()` are always
 * disjoint; `getItems()` holds new + updated + untouched items. A change in an
 * item's content is recorded **only** through `replace` (no deep diff).
 */
export abstract class WatchedList<T> {
  private readonly currentItems: T[];
  private readonly newItems: T[] = [];
  private readonly removedItems: T[] = [];
  private readonly updatedItems: T[] = [];

  /** @param initialItems the state loaded from persistence. */
  constructor(initialItems: T[] = []) {
    this.currentItems = [...initialItems];
  }

  /** Identity of an item (e.g. same `userId`), not structural equality. */
  abstract compareItems(a: T, b: T): boolean;

  /** Current items (a copy). */
  getItems(): T[] {
    return [...this.currentItems];
  }

  /** Items added since loading (a copy). */
  getNewItems(): T[] {
    return [...this.newItems];
  }

  /** Initial items removed since loading (a copy). */
  getRemovedItems(): T[] {
    return [...this.removedItems];
  }

  /** Initial items changed through `replace` since loading (a copy). */
  getUpdatedItems(): T[] {
    return [...this.updatedItems];
  }

  get length(): number {
    return this.currentItems.length;
  }

  exists(item: T): boolean {
    return this.indexOf(this.currentItems, item) !== -1;
  }

  /**
   * Adds an item. Adding an existing item is a no-op. Adding an item removed
   * since loading restores it (it leaves *removed* and does not become *new*);
   * the given value is kept but not marked as *updated*: call `replace` if its
   * content changed.
   */
  add(item: T): void {
    if (this.exists(item)) {
      return;
    }
    const removedIndex = this.indexOf(this.removedItems, item);
    if (removedIndex === -1) {
      this.newItems.push(item);
    } else {
      this.removedItems.splice(removedIndex, 1);
    }
    this.currentItems.push(item);
  }

  /**
   * Removes an item. A *new* item is simply discarded; an initial item goes to
   * *removed* (and leaves *updated*). Removing a missing item is a no-op.
   */
  remove(item: T): void {
    const currentIndex = this.indexOf(this.currentItems, item);
    if (currentIndex === -1) {
      return;
    }
    // Keeps the stored (loaded) value, not the argument: the repository may
    // need data the caller's instance lacks (e.g. the persisted entity id).
    const removed = this.currentItems.splice(currentIndex, 1);
    const newIndex = this.indexOf(this.newItems, item);
    if (newIndex !== -1) {
      this.newItems.splice(newIndex, 1);
      return;
    }
    const updatedIndex = this.indexOf(this.updatedItems, item);
    if (updatedIndex !== -1) {
      this.updatedItems.splice(updatedIndex, 1);
    }
    this.removedItems.push(...removed);
  }

  /**
   * Replaces the item with the same identity. An initial item becomes
   * *updated*; a *new* item stays only in *new*, with the new value. Replacing
   * a missing item is a no-op.
   */
  replace(item: T): void {
    const currentIndex = this.indexOf(this.currentItems, item);
    if (currentIndex === -1) {
      return;
    }
    this.currentItems[currentIndex] = item;
    const newIndex = this.indexOf(this.newItems, item);
    if (newIndex !== -1) {
      this.newItems[newIndex] = item;
      return;
    }
    const updatedIndex = this.indexOf(this.updatedItems, item);
    if (updatedIndex === -1) {
      this.updatedItems.push(item);
    } else {
      this.updatedItems[updatedIndex] = item;
    }
  }

  /**
   * Bulk replacement: removes the current items missing from `items` and adds
   * the ones not yet present, exactly as the equivalent `remove`/`add` calls.
   * Items present in both keep their current value (use `replace` to change it).
   */
  update(items: T[]): void {
    for (const current of this.getItems()) {
      if (this.indexOf(items, current) === -1) {
        this.remove(current);
      }
    }
    for (const item of items) {
      this.add(item);
    }
  }

  private indexOf(list: T[], item: T): number {
    return list.findIndex((candidate) => this.compareItems(candidate, item));
  }
}
