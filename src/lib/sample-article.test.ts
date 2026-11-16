import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetStoreForTests, deleteProject, getProject } from "./projects-store";
import { installSampleArticles } from "./sample-article";

const file = readFileSync(path.resolve(__dirname, "../../public/samples/miraculous.json"), "utf8");

beforeEach(() => {
  __resetStoreForTests();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(file)));
});

describe("ready-made Miraculous article", () => {
  it("is added to the projects once with its pictures embedded", async () => {
    expect(await installSampleArticles()).toBe(true);
    const p = await getProject("p_sample_miraculous");
    expect(p?.title).toBe("Miraculous: Tales of Ladybug & Cat Noir");
    const images = p!.sections.filter((s) => s.type === "image");
    expect(images.length).toBe(29);
    expect(images.every((s) => s.type === "image" && s.src.startsWith("data:image/"))).toBe(true);
  });

  it("does not come back after the user deletes it", async () => {
    await installSampleArticles();
    await deleteProject("p_sample_miraculous");
    expect(await installSampleArticles()).toBe(false);
    expect(await getProject("p_sample_miraculous")).toBeNull();
  });
});
