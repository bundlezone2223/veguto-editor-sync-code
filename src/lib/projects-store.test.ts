import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { LEGACY_KEY, __resetStoreForTests, getProject, loadProjects, upsertProject, type Project } from "./projects-store";

const make = (id: string, updatedAt: number, extra: Partial<Project> = {}): Project => ({
  id, title: id, excerpt: "", thumbnail: "", categories: [], tags: [], createdAt: 1, updatedAt,
  meta: { title: id, slug: id, excerpt: "", categories: [], tags: [], hero: "" }, sections: [], ...extra,
});

beforeEach(() => {
  __resetStoreForTests();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
});

describe("projects store (IndexedDB)", () => {
  it("migrates old localStorage drafts once and removes the old key", async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([make("a", 10), make("b", 20)]));
    const list = await loadProjects();
    expect(list.map((p) => p.id)).toEqual(["b", "a"]);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("stores an article larger than the 5MB localStorage limit", async () => {
    const big = "data:image/jpeg;base64," + "A".repeat(12 * 1024 * 1024);
    const ok = await upsertProject(make("big", 1, { thumbnail: big }));
    expect(ok).toBe(true);
    expect((await getProject("big"))?.thumbnail.length).toBe(big.length);
  });
});
