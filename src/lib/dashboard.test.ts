import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { DEFAULT_HOME_CONFIG, buildFeed, getBlock, moveItem, moveTo, normalizeHomeConfig, statValue, type FeedArticle } from "@/lib/site-config";
import { buildRows, emptyIndex, readSiteCategories, rowsToAutoSave, type LibraryEntry, type LibraryIndex } from "@/lib/article-library";
import { readZip } from "@/lib/zip-upload";
import type { Project } from "@/lib/projects-store";

const project = (over: Partial<Project> = {}): Project => ({
  id: "p1", title: "Miraculous", excerpt: "x", thumbnail: "data:image/webp;base64,QUJD", categories: ["Animation"], tags: [],
  createdAt: 1, updatedAt: 10, meta: { title: "Miraculous", slug: "miraculous", excerpt: "x", categories: [], tags: [], hero: "" },
  sections: [{ type: "p", text: "hi" }, { type: "image", src: "data:image/webp;base64,QUJD", alt: "a" }, { type: "image", src: "https://x/y.png", alt: "b" }],
  ...over,
});

describe("home layout settings", () => {
  it("fills missing parts from what the site shows today and keeps saved changes", () => {
    const c = normalizeHomeConfig({ blocks: [{ type: "hero", title: "My Wiki" }, { type: "discord", visible: false }] });
    expect(getBlock(c, "hero").title).toBe("My Wiki");
    expect(getBlock(c, "hero").kicker).toBe(getBlock(DEFAULT_HOME_CONFIG, "hero").kicker);
    expect(getBlock(c, "discord").visible).toBe(false);
    expect(getBlock(c, "feed").sections).toHaveLength(7);
  });
  it("keeps the saved order of elements and adds any missing one at the end", () => {
    const c = normalizeHomeConfig({ blocks: [{ type: "tags" }, { type: "hero" }, { type: "tags" }, { type: "bogus" }] });
    expect(c.blocks.map((b) => b.type)).toEqual(["tags", "hero", "stats", "feed", "discord"]);
  });
  it("drops sections without a name and duplicate section links", () => {
    const c = normalizeHomeConfig({ blocks: [{ type: "feed", sections: [{ highlight: "" }, { highlight: "Anime" }, { key: "anime", highlight: "Anime 2" }] }] });
    expect(getBlock(c, "feed").sections.map((s) => s.highlight)).toEqual(["Anime"]);
  });
  it("keeps articles per group between 1 and 12", () => {
    const c = normalizeHomeConfig({ blocks: [{ type: "feed", mixed: { perGroup: 99 } }] });
    expect(getBlock(c, "feed").mixed.perGroup).toBe(12);
  });
  it("moves an element by dragging it to a new place", () => {
    expect(moveTo(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });
  it("builds the feed like the site: groups of single articles alternating with section shelves", () => {
    const art = (id: string, category: string): FeedArticle => ({ id, title: id, description: "", thumbnail: "", category, tags: [] });
    const feed = getBlock(DEFAULT_HOME_CONFIG, "feed");
    const rows = buildFeed(feed, ["1", "2", "3", "4", "5"].map((n) => art(n, n === "5" ? "gaming" : "animation")), null);
    expect(rows.map((r) => r.grid?.length ?? 0)).toEqual([4, 1]);
    expect(rows.map((r) => r.shelf?.section.key ?? null)).toEqual(["games", "animation"]);
    expect(buildFeed({ ...feed, mixed: { ...feed.mixed, visible: false } }, [art("1", "animation")], null)[0]!.grid).toBeNull();
  });
  it("shows the site's article count like 100+", () => {
    expect(statValue({ id: "a", source: "articles", value: "", label: "", visible: true }, { articles: 108, categories: 7, tags: 3 })).toBe("100+");
    expect(statValue({ id: "a", source: "custom", value: "14k+", label: "", visible: true }, { articles: 1, categories: 1, tags: 1 })).toBe("14k+");
  });
});

const lib = (over: Partial<{ index: LibraryIndex; siteFiles: string[]; editorFiles: string[] }> = {}) => ({
  index: over.index ?? emptyIndex(),
  siteFiles: new Set(over.siteFiles ?? []),
  editorFiles: new Set(over.editorFiles ?? []),
});
const entry = (status: LibraryEntry["status"], updatedAt = 10, file = "Miraculous.ts"): LibraryIndex => ({
  version: 1, articles: { abcdefghijk: { articleId: "abcdefghijk", file, title: "Miraculous", status, updatedAt, savedAt: 1 } },
});
const withId = (over: Partial<Project> = {}) => project({ meta: { ...project().meta, articleId: "abcdefghijk" }, ...over });

describe("articles tab", () => {
  it("shows every article in the main site's articles folder as published", () => {
    const rows = buildRows([], lib({ siteFiles: ["Miraculous-Tales-of-Ladybug-&-Cat-Noir.ts"] }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "published", title: "Miraculous Tales of Ladybug & Cat Noir", onGithub: true });
  });
  it("links a local article to the site file with the same title", () => {
    const rows = buildRows([project({ title: "Miraculous: Tales of Ladybug & Cat Noir", meta: { ...project().meta, title: "Miraculous: Tales of Ladybug & Cat Noir" } })], lib({ siteFiles: ["Miraculous-Tales-of-Ladybug-&-Cat-Noir.ts"] }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "published", project: expect.anything() });
  });
  it("saves a new or edited draft to GitHub, but never a published one", () => {
    expect(rowsToAutoSave(buildRows([withId()], lib()))).toHaveLength(1);
    expect(rowsToAutoSave(buildRows([withId({ updatedAt: 10 })], lib({ index: entry("draft"), editorFiles: ["Miraculous.ts"] })))).toHaveLength(0);
    expect(rowsToAutoSave(buildRows([withId({ updatedAt: 11 })], lib({ index: entry("private"), editorFiles: ["Miraculous.ts"] })))).toHaveLength(1);
    const pub = buildRows([withId({ updatedAt: 11 })], lib({ index: entry("published"), siteFiles: ["Miraculous.ts"] }));
    expect(pub[0]).toMatchObject({ status: "published", changed: true });
    expect(rowsToAutoSave(pub)).toHaveLength(0);
  });
  it("keeps a private article private and off the site list", () => {
    const rows = buildRows([], lib({ index: entry("private"), editorFiles: ["Miraculous.ts"] }));
    expect(rows).toEqual([expect.objectContaining({ status: "private", onGithub: true })]);
  });
  it("treats an article removed from the site by hand as a draft", () => {
    expect(buildRows([withId()], lib({ index: entry("published") }))[0]!.status).toBe("draft");
  });
  it("skips empty untitled articles", () => {
    expect(buildRows([project({ title: "", meta: { ...project().meta, title: "" }, sections: [] })], lib())).toHaveLength(0);
  });
  it("reads the categories the main site accepts", () => {
    expect(readSiteCategories('export const CATEGORIES = [\n  "anime-manga",\n  "gaming",\n] as const;')).toEqual(["anime-manga", "gaming"]);
  });
});

describe("ZIP upload", () => {
  it("removes the top folder and never uploads .git, node_modules or .env files", () => {
    const zip = zipSync({
      "veguto-main/package.json": strToU8("{}"),
      "veguto-main/src/a.ts": strToU8("x"),
      "veguto-main/.git/config": strToU8("x"),
      "veguto-main/node_modules/x/index.js": strToU8("x"),
      "veguto-main/.env": strToU8("SECRET=1"),
    });
    const { files, skipped } = readZip(zip);
    expect(files.map((f) => f.path)).toEqual(["package.json", "src/a.ts"]);
    expect(skipped).toBe(3);
    expect(atob(files[0]!.base64!)).toBe("{}");
  });
});
