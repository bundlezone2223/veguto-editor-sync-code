import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { DEFAULT_SITE_CONFIG, moveItem, normalizeSiteConfig } from "@/lib/site-config";
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
  it("fills missing parts from defaults and keeps saved changes", () => {
    const c = normalizeSiteConfig({ hero: { title: "My Wiki" }, discord: { visible: false } });
    expect(c.hero.title).toBe("My Wiki");
    expect(c.hero.kicker).toBe(DEFAULT_SITE_CONFIG.hero.kicker);
    expect(c.discord.visible).toBe(false);
    expect(c.sections).toHaveLength(7);
  });
  it("drops sections without a name", () => {
    expect(normalizeSiteConfig({ sections: [{ label: "" }, { label: "Anime" }] }).sections.map((s) => s.label)).toEqual(["Anime"]);
  });
  it("reorders sections", () => {
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
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
