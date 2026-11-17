import type { Project } from "@/lib/projects-store";
import type { Section } from "@/lib/article-content";
import type { RepoFile } from "@/lib/github-api";
import { slugify } from "@/lib/site-config";

/**
 * Turns an editor article into files for the main site's GitHub content folder:
 *   content/articles/<slug>.json   full article (images point to media files)
 *   content/media/<hash>.<ext>      each embedded picture, stored once
 * Pictures are pulled out of the article so the main site loads small JSON files.
 */
export const CONTENT_DIR = "content";

export type PublishedArticle = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  thumbnail: string;
  categories: string[];
  tags: string[];
  updatedAt: number;
  publishedAt: number;
  sections: Section[];
};
export type ArticleIndexEntry = Omit<PublishedArticle, "sections">;
export type ArticleIndex = { version: 1; updatedAt: number; articles: ArticleIndexEntry[] };

export function articleSlug(p: Project): string {
  const s = (p.meta?.slug || "").trim();
  return s && s !== "untitled" ? slugify(s) : slugify(p.title || p.meta?.title || p.id);
}

const DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg", "image/avif": "avif" };

async function shortHash(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf).slice(0, 10), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Builds the article file plus one file per embedded picture. */
export async function buildArticleFiles(p: Project, now = Date.now()): Promise<{ article: PublishedArticle; files: RepoFile[] }> {
  const media = new Map<string, RepoFile>();
  const toLink = async (src: string): Promise<string> => {
    const m = DATA_URL.exec(src);
    if (!m) return src;
    const name = `${await shortHash(m[2]!)}.${EXT[m[1]!.toLowerCase()] ?? "img"}`;
    const path = `${CONTENT_DIR}/media/${name}`;
    if (!media.has(path)) media.set(path, { path, base64: m[2]! });
    return `media/${name}`;
  };
  const sections: Section[] = [];
  for (const s of p.sections ?? []) sections.push(s.type === "image" ? { ...s, src: await toLink(s.src) } : s);
  const slug = articleSlug(p);
  const article: PublishedArticle = {
    id: p.meta?.articleId || p.id,
    slug,
    title: p.title || p.meta?.title || "",
    excerpt: p.excerpt || p.meta?.excerpt || "",
    thumbnail: await toLink(p.thumbnail || p.meta?.hero || ""),
    categories: p.categories ?? [],
    tags: p.tags ?? [],
    updatedAt: p.updatedAt,
    publishedAt: now,
    sections,
  };
  const files: RepoFile[] = [
    { path: `${CONTENT_DIR}/articles/${slug}.json`, text: JSON.stringify(article, null, 2) },
    ...media.values(),
  ];
  return { article, files };
}

/** Adds or replaces articles in the index (matched by id, then slug), newest first. */
export function mergeIndex(index: ArticleIndex | null, added: PublishedArticle[], now = Date.now()): ArticleIndex {
  const list = (index?.articles ?? []).filter((e) => !added.some((a) => a.id === e.id || a.slug === e.slug));
  for (const a of added) {
    const { sections: _sections, ...entry } = a;
    list.push(entry);
  }
  list.sort((a, b) => b.publishedAt - a.publishedAt);
  return { version: 1, updatedAt: now, articles: list };
}

export function removeFromIndex(index: ArticleIndex | null, slug: string, now = Date.now()): ArticleIndex {
  return { version: 1, updatedAt: now, articles: (index?.articles ?? []).filter((e) => e.slug !== slug) };
}

/* ---- which articles this browser has published, and whether they changed since ---- */
const PUB_KEY = "veguto:published";
export type PublishRecord = { slug: string; publishedAt: number; articleUpdatedAt: number };

export function loadPublishRecords(): Record<string, PublishRecord> {
  try { return JSON.parse(localStorage.getItem(PUB_KEY) || "{}"); } catch { return {}; }
}
export function savePublishRecords(r: Record<string, PublishRecord>) {
  try { localStorage.setItem(PUB_KEY, JSON.stringify(r)); } catch { /* ignore */ }
}

export type PublishState = "draft" | "published" | "changed";
export function publishState(p: Project, rec: PublishRecord | undefined): PublishState {
  if (!rec) return "draft";
  return p.updatedAt > rec.articleUpdatedAt ? "changed" : "published";
}
