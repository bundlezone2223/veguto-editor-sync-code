import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { DEFAULT_SITE_CONFIG, moveItem, normalizeSiteConfig } from "@/lib/site-config";
import { buildArticleFiles, mergeIndex, publishState } from "@/lib/publish-article";
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

describe("publishing articles", () => {
  it("stores each embedded picture once as its own file and links to it", async () => {
    const { article, files } = await buildArticleFiles(project(), 100);
    const media = files.filter((f) => f.path.startsWith("content/media/"));
    expect(media).toHaveLength(1);
    expect(media[0]!.base64).toBe("QUJD");
    expect(article.thumbnail).toBe(media[0]!.path.replace("content/", ""));
    expect(article.sections[1]).toMatchObject({ src: article.thumbnail });
    expect(article.sections[2]).toMatchObject({ src: "https://x/y.png" });
    expect(files[0]!.path).toBe("content/articles/miraculous.json");
  });
  it("replaces an article already in the index instead of listing it twice", async () => {
    const { article } = await buildArticleFiles(project(), 200);
    const idx = mergeIndex({ version: 1, updatedAt: 0, articles: [{ ...article, title: "old", publishedAt: 1 }] }, [article]);
    expect(idx.articles).toHaveLength(1);
    expect(idx.articles[0]!.title).toBe("Miraculous");
    expect("sections" in idx.articles[0]!).toBe(false);
  });
  it("marks an article as changed when edited after publishing", () => {
    expect(publishState(project(), undefined)).toBe("draft");
    expect(publishState(project({ updatedAt: 10 }), { slug: "m", publishedAt: 5, articleUpdatedAt: 10 })).toBe("published");
    expect(publishState(project({ updatedAt: 11 }), { slug: "m", publishedAt: 5, articleUpdatedAt: 10 })).toBe("changed");
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
