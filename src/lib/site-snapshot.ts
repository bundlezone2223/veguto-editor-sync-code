/**
 * Reads what the main site (bundlezone2223/veguto) shows on its home page right now:
 * its `content/home.json`, its published articles, categories and the counts the
 * stats cards display. Read-only.
 */
import { SITE_REPO, listTree, readRepoText } from "@/lib/github-api";
import { parseArticleTs } from "@/lib/article-import";
import { readSiteCategories } from "@/lib/article-library";
import { HOME_CONFIG_PATH, countTags, normalizeHomeConfig, type FeedArticle, type HomeConfig, type SiteCounts } from "@/lib/site-config";

export const SITE_BRANCH = "main";
const ARTICLES_DIR = "src/content/articles/";
const CATEGORIES_FILE = "src/content/categories/categories.ts";
const MAX_ARTICLES = 80;
const HOME_ROUTE = "src/routes/index.tsx";

export type SiteCategory = { id: string; title: string; emoji: string };
export type SiteSnapshot = {
  /** null when the site has no content/home.json yet. */
  home: HomeConfig | null;
  homeSha: string | null;
  articles: FeedArticle[];
  /** Articles on GitHub that the site hides because their category is unknown. */
  hiddenArticles: number;
  categories: SiteCategory[] | null;
  counts: SiteCounts;
  /** Whether the site's home page code already reads content/home.json. */
  siteReadsConfig: boolean;
  fetchedAt: number;
};

/** Category ids with their display title and emoji, from the site's categories.ts. */
export function readCategoryMeta(ts: string): SiteCategory[] | null {
  const ids = readSiteCategories(ts);
  if (!ids) return null;
  const meta = new Map<string, { title: string; emoji: string }>();
  for (const m of ts.matchAll(/["']?([a-z0-9-]+)["']?\s*:\s*\{\s*title:\s*"([^"]*)",\s*emoji:\s*"([^"]*)"/g)) meta.set(m[1]!, { title: m[2]!, emoji: m[3]! });
  return ids.map((id) => ({ id, title: meta.get(id)?.title ?? id, emoji: meta.get(id)?.emoji ?? "" }));
}

/** The site's card text: the description, or the opening paragraph, cut at 160 characters. */
export function cardDescription(description: string, sections: { type: string; text?: string }[]): string {
  const opening = sections.find((s) => s.type === "p")?.text ?? "";
  const text = description.trim() || opening;
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}

async function readArticle(path: string): Promise<FeedArticle | null> {
  const text = await readRepoText(SITE_REPO, SITE_BRANCH, path).catch(() => null);
  if (!text) return null;
  try {
    const a = await parseArticleTs(text);
    const file = path.slice(ARTICLES_DIR.length).replace(/\.ts$/, "");
    return { id: a.articleId ?? file, title: a.title, description: cardDescription(a.excerpt, a.sections), thumbnail: a.hero, category: a.categories[0] ?? "", tags: a.tags };
  } catch { return null; }
}

/** sha of content/home.json on the site right now (null when missing), to catch edits made elsewhere. */
export async function currentHomeSha(): Promise<string | null> {
  const tree = await listTree(SITE_REPO, SITE_BRANCH);
  return tree.find((e) => e.path === HOME_CONFIG_PATH && e.type === "blob")?.sha ?? null;
}

export async function loadSiteSnapshot(): Promise<SiteSnapshot> {
  const tree = await listTree(SITE_REPO, SITE_BRANCH);
  const homeEntry = tree.find((e) => e.path === HOME_CONFIG_PATH && e.type === "blob");
  const articleFiles = tree
    .filter((e) => e.type === "blob" && e.path.startsWith(ARTICLES_DIR) && /^[^/]+\.ts$/.test(e.path.slice(ARTICLES_DIR.length)) && !/\/(index|types)\.ts$/.test(e.path))
    .slice(0, MAX_ARTICLES);
  const [homeText, catText, parsed, homeCode] = await Promise.all([
    homeEntry ? readRepoText(SITE_REPO, SITE_BRANCH, HOME_CONFIG_PATH) : Promise.resolve(null),
    readRepoText(SITE_REPO, SITE_BRANCH, CATEGORIES_FILE).catch(() => null),
    Promise.all(articleFiles.map((f) => readArticle(f.path))),
    readRepoText(SITE_REPO, SITE_BRANCH, HOME_ROUTE).catch(() => null),
  ]);
  let home: HomeConfig | null = null;
  if (homeText) { try { home = normalizeHomeConfig(JSON.parse(homeText)); } catch { home = null; } }
  const categories = catText ? readCategoryMeta(catText) : null;
  const all = parsed.filter((a): a is FeedArticle => a !== null);
  const known = categories ? new Set(categories.map((c) => c.id)) : null;
  const articles = known ? all.filter((a) => known.has(a.category)) : all;
  return {
    home, homeSha: homeEntry?.sha ?? null, articles, hiddenArticles: all.length - articles.length, categories,
    counts: { articles: articles.length, categories: categories?.length ?? 0, tags: countTags(articles).length },
    siteReadsConfig: !!homeCode && /@\/content\/home["']|home\.json/.test(homeCode),
    fetchedAt: Date.now(),
  };
}
