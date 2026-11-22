/**
 * The main Veguto Wiki home page, described as data.
 *
 * The main site (bundlezone2223/veguto) reads `content/home.json` and renders exactly
 * these blocks in this order. The Dashboard loads that file from GitHub, edits it, and
 * publishes it back. Keep this schema in sync with `src/content/home.ts` in the site repo.
 */

/** Folder at the root of the main site repo that holds editable site content. */
export const CONTENT_DIR = "content";
export const HOME_CONFIG_PATH = `${CONTENT_DIR}/home.json`;

export type NavItem = { id: string; emoji: string; label: string; href: string; visible: boolean };
/** `articles`, `categories` and `tags` are counted by the site itself; `custom` shows `value`. */
export type StatSource = "articles" | "categories" | "tags" | "custom";
export type StatItem = { id: string; source: StatSource; value: string; label: string; visible: boolean };
export type FeedSection = {
  key: string; emoji: string; prefix: string; highlight: string;
  /** An article joins the section when its category OR one of its tags is listed here. */
  categories: string[]; tags: string[]; visible: boolean;
};

export type HeroBlock = { id: "hero"; type: "hero"; visible: boolean; kicker: string; title: string; subtitle: string; showSearch: boolean; searchPlaceholder: string };
export type StatsBlock = { id: "stats"; type: "stats"; visible: boolean; items: StatItem[] };
export type FeedBlock = {
  id: "feed"; type: "feed"; visible: boolean;
  /** Single articles shown in small grids between the section shelves. */
  mixed: { visible: boolean; perGroup: number; shuffle: boolean };
  /** "Everything About …" shelves. */
  shelves: { visible: boolean; limit: number; shuffle: boolean; showSeeAll: boolean };
  sections: FeedSection[];
};
export type DiscordBlock = { id: "discord"; type: "discord"; visible: boolean; emoji: string; title: string; text: string; button: string };
export type TagsBlock = { id: "tags"; type: "tags"; visible: boolean; title: string; count: number; showSeeAll: boolean };
export type HomeBlock = HeroBlock | StatsBlock | FeedBlock | DiscordBlock | TagsBlock;
export type BlockType = HomeBlock["type"];

export type HomeConfig = {
  version: 2;
  discordUrl: string;
  /** Main column, top to bottom. Every block type appears exactly once. */
  blocks: HomeBlock[];
  sidebar: { visible: boolean; title: string; quickNav: NavItem[]; showSections: boolean; discordButton: { visible: boolean; label: string } };
};

/** What the live site shows today; also the fallback for any missing or damaged value. */
export const DEFAULT_HOME_CONFIG: HomeConfig = {
  version: 2,
  discordUrl: "https://discord.gg/62Ts2tPuz",
  blocks: [
    {
      id: "hero", type: "hero", visible: true, kicker: "welcome to", title: "Veguto Wiki",
      subtitle: "Your cozy guide to anime, VTubing, cozy games, kawaii & dark aesthetics, and the soft little community in between. 🌸",
      showSearch: true, searchPlaceholder: "Search articles, tags, vibes…",
    },
    {
      id: "stats", type: "stats", visible: true, items: [
        { id: "articles", source: "articles", value: "", label: "articles & guides", visible: true },
        { id: "categories", source: "categories", value: "", label: "cozy categories", visible: true },
        { id: "tags", source: "tags", value: "", label: "tags to explore", visible: true },
        { id: "visitors", source: "custom", value: "14k+", label: "monthly visitors", visible: true },
      ],
    },
    {
      id: "feed", type: "feed", visible: true,
      mixed: { visible: true, perGroup: 4, shuffle: true },
      shelves: { visible: true, limit: 12, shuffle: true, showSeeAll: true },
      sections: [
        { key: "games", emoji: "🎮", prefix: "Everything About", highlight: "Video Games", categories: ["gaming", "games"], tags: ["games", "gaming", "video-games"], visible: true },
        { key: "anime", emoji: "🌙", prefix: "Everything About", highlight: "Anime", categories: ["anime-manga", "anime"], tags: ["anime"], visible: true },
        { key: "animation", emoji: "🎬", prefix: "Everything About", highlight: "Animation", categories: ["animation"], tags: ["animation"], visible: true },
        { key: "horror-games", emoji: "🩸", prefix: "Everything About", highlight: "Horror Games", categories: [], tags: ["horror-games", "horror-rpgs", "indie-horror"], visible: true },
        { key: "psychological-horror", emoji: "🧠", prefix: "Everything About", highlight: "Psychological Horror", categories: [], tags: ["psychological-horror"], visible: true },
        { key: "isekai", emoji: "🌀", prefix: "Everything About", highlight: "Isekai", categories: [], tags: ["isekai", "another-world", "reincarnation"], visible: true },
        { key: "indie-rpg", emoji: "🕹️", prefix: "Everything About", highlight: "Indie RPG Games", categories: [], tags: ["indie-rpg", "indie-rpgs"], visible: true },
      ],
    },
    {
      id: "discord", type: "discord", visible: true, emoji: "💬", title: "Join the Veguto Discord",
      text: "Chat about anime, cozy games, art, OCs, VTubers and aesthetics.", button: "Open the invite →",
    },
    { id: "tags", type: "tags", visible: true, title: "🏷️ Popular tags", count: 24, showSeeAll: true },
  ],
  sidebar: {
    visible: true,
    title: "Veguto Wiki",
    quickNav: [
      { id: "home", emoji: "🏠", label: "Home", href: "/", visible: true },
      { id: "articles", emoji: "📚", label: "All articles", href: "/articles", visible: true },
      { id: "tags", emoji: "🏷️", label: "Tags", href: "/tags", visible: true },
      { id: "about", emoji: "✨", label: "About the wiki", href: "/about", visible: true },
    ],
    showSections: true,
    discordButton: { visible: true, label: "Join our Discord" },
  },
};

export const BLOCK_TYPES: BlockType[] = ["hero", "stats", "feed", "discord", "tags"];

// ---------- normalizing (never trust a saved or hand-edited file) ----------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
const obj = (v: unknown): Loose => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const str = (v: unknown, d: string, max = 400) => (typeof v === "string" ? v.slice(0, max) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const num = (v: unknown, d: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d;
const list = <T,>(v: unknown, f: (x: Loose, i: number) => T | null, d: T[], max = 40): T[] =>
  Array.isArray(v) ? v.flatMap((x, i) => { const r = obj(x) === x ? f(x, i) : null; return r ? [r] : []; }).slice(0, max) : d;
const words = (v: unknown, d: string[]) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))].slice(0, 30) : d;

export function slugify(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

/** Makes every id in the list unique by adding -2, -3… */
function uniqueIds<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.map((x) => {
    let id = x.id || "item", n = 2;
    while (seen.has(id)) id = `${x.id}-${n++}`;
    seen.add(id);
    return id === x.id ? x : { ...x, id };
  });
}

function normalizeBlock(type: BlockType, v: Loose): HomeBlock {
  const d = DEFAULT_HOME_CONFIG.blocks.find((b) => b.type === type)!;
  const visible = bool(v.visible, d.visible);
  switch (d.type) {
    case "hero":
      return { ...d, visible, kicker: str(v.kicker, d.kicker), title: str(v.title, d.title), subtitle: str(v.subtitle, d.subtitle, 1000), showSearch: bool(v.showSearch, d.showSearch), searchPlaceholder: str(v.searchPlaceholder, d.searchPlaceholder) };
    case "stats":
      return { ...d, visible, items: uniqueIds(list(v.items, (x, i) => {
        const source: StatSource = ["articles", "categories", "tags", "custom"].includes(x.source) ? x.source : "custom";
        return { id: str(x.id, "") || `stat-${i + 1}`, source, value: str(x.value, ""), label: str(x.label, ""), visible: bool(x.visible, true) };
      }, d.items, 8)) };
    case "feed": {
      const m = obj(v.mixed), s = obj(v.shelves);
      const sections = list(v.sections, (x): FeedSection | null => {
        const highlight = str(x.highlight, "").trim();
        if (!highlight) return null;
        return { key: slugify(str(x.key, "") || highlight), emoji: str(x.emoji, ""), prefix: str(x.prefix, "Everything About"), highlight, categories: words(x.categories, []), tags: words(x.tags, []), visible: bool(x.visible, true) };
      }, d.sections, 30);
      const seen = new Set<string>();
      return {
        ...d, visible,
        mixed: { visible: bool(m.visible, d.mixed.visible), perGroup: num(m.perGroup, d.mixed.perGroup, 1, 12), shuffle: bool(m.shuffle, d.mixed.shuffle) },
        shelves: { visible: bool(s.visible, d.shelves.visible), limit: num(s.limit, d.shelves.limit, 1, 24), shuffle: bool(s.shuffle, d.shelves.shuffle), showSeeAll: bool(s.showSeeAll, d.shelves.showSeeAll) },
        sections: sections.filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true))),
      };
    }
    case "discord":
      return { ...d, visible, emoji: str(v.emoji, d.emoji, 16), title: str(v.title, d.title), text: str(v.text, d.text, 600), button: str(v.button, d.button) };
    case "tags":
      return { ...d, visible, title: str(v.title, d.title), count: num(v.count, d.count, 1, 100), showSeeAll: bool(v.showSeeAll, d.showSeeAll) };
  }
}

/** Fills gaps and drops bad values so a damaged or older file never breaks the page. */
export function normalizeHomeConfig(input: unknown): HomeConfig {
  const d = DEFAULT_HOME_CONFIG;
  const o = obj(input);
  const given = Array.isArray(o.blocks) ? o.blocks.map(obj) : [];
  const order: BlockType[] = [];
  for (const b of given) if (BLOCK_TYPES.includes(b.type) && !order.includes(b.type)) order.push(b.type);
  for (const t of BLOCK_TYPES) if (!order.includes(t)) order.push(t);
  const sb = obj(o.sidebar), db = obj(sb.discordButton);
  const url = str(o.discordUrl, d.discordUrl).trim();
  return {
    version: 2,
    discordUrl: /^https?:\/\//i.test(url) ? url : d.discordUrl,
    blocks: order.map((t) => normalizeBlock(t, given.find((b: Loose) => b.type === t) ?? {})),
    sidebar: {
      visible: bool(sb.visible, d.sidebar.visible),
      title: str(sb.title, d.sidebar.title),
      quickNav: uniqueIds(list(sb.quickNav, (x, i) => ({ id: str(x.id, "") || `link-${i + 1}`, emoji: str(x.emoji, "", 16), label: str(x.label, ""), href: str(x.href, "/"), visible: bool(x.visible, true) }), d.sidebar.quickNav, 20)),
      showSections: bool(sb.showSections, d.sidebar.showSections),
      discordButton: { visible: bool(db.visible, d.sidebar.discordButton.visible), label: str(db.label, d.sidebar.discordButton.label) },
    },
  };
}

export function getBlock<T extends BlockType>(c: HomeConfig, type: T): Extract<HomeBlock, { type: T }> {
  return c.blocks.find((b) => b.type === type) as Extract<HomeBlock, { type: T }>;
}

export function updateBlock<T extends BlockType>(c: HomeConfig, type: T, patch: Partial<Extract<HomeBlock, { type: T }>>): HomeConfig {
  return { ...c, blocks: c.blocks.map((b) => (b.type === type ? ({ ...b, ...patch } as HomeBlock) : b)) };
}

/** Moves item `i` by `delta` places; returns a new array (unchanged when out of range). */
export function moveItem<T>(items: T[], i: number, delta: number): T[] {
  return moveTo(items, i, i + delta);
}

/** Moves item `from` to index `to`; returns a new array (unchanged when out of range). */
export function moveTo<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return items;
  const next = items.slice();
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x!);
  return next;
}

/** Same JSON the Dashboard publishes, so "changed?" compares exactly what GitHub would get. */
export function serializeHomeConfig(c: HomeConfig): string {
  return `${JSON.stringify(c, null, 2)}\n`;
}

// ---------- what the site renders (shared by the preview and the checks) ----------

export type FeedArticle = { id: string; title: string; description: string; thumbnail: string; category: string; tags: string[] };

export const tagSlug = (tag: string) => tag.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

export function matchesFeedSection(a: Pick<FeedArticle, "category" | "tags">, s: FeedSection) {
  if (s.categories.includes(a.category)) return true;
  const slugs = a.tags.map(tagSlug);
  return s.tags.some((t) => slugs.includes(t));
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export type FeedRow = { grid: FeedArticle[] | null; shelf: { section: FeedSection; items: FeedArticle[] } | null };

/**
 * The home feed exactly as the site builds it: small grids of single articles
 * alternating with "Everything About …" shelves. `random` = null keeps a stable order.
 */
export function buildFeed(feed: FeedBlock, articles: FeedArticle[], random: (() => number) | null = Math.random): FeedRow[] {
  const mixShelves = <T,>(x: T[]) => (random && feed.shelves.shuffle ? shuffle(x, random) : x);
  const mixFree = <T,>(x: T[]) => (random && feed.mixed.shuffle ? shuffle(x, random) : x);
  const shelves = feed.shelves.visible
    ? mixShelves(feed.sections.filter((s) => s.visible).map((section) => ({ section, items: mixShelves(articles.filter((a) => matchesFeedSection(a, section))).slice(0, feed.shelves.limit) })).filter((s) => s.items.length > 0))
    : [];
  const free = feed.mixed.visible ? mixFree(articles) : [];
  const grids: FeedArticle[][] = [];
  for (let i = 0; i < free.length; i += feed.mixed.perGroup) grids.push(free.slice(i, i + feed.mixed.perGroup));
  return Array.from({ length: Math.max(grids.length, shelves.length) }, (_, i) => ({ grid: grids[i] ?? null, shelf: shelves[i] ?? null }));
}

/** Counts of 100+ round down to the nearest ten (108 → "100+"), like the site. */
export function formatStat(n: number) {
  return `${n >= 100 ? Math.floor(n / 10) * 10 : n}+`;
}

export type SiteCounts = { articles: number; categories: number; tags: number };
export function statValue(item: StatItem, counts: SiteCounts) {
  return item.source === "custom" ? item.value : formatStat(counts[item.source]);
}

/** Tags with how many articles use them, most used first (the site's "Popular tags"). */
export function countTags(articles: FeedArticle[]): { tag: string; slug: string; count: number }[] {
  const map = new Map<string, { tag: string; slug: string; count: number }>();
  for (const a of articles) for (const t of new Set(a.tags)) {
    const slug = tagSlug(t);
    if (!slug) continue;
    const e = map.get(slug) ?? { tag: t, slug, count: 0 };
    e.count++;
    map.set(slug, e);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

// ---------- checks ----------

export type HomeIssue = { level: "error" | "warn" | "info"; block: BlockType | "sidebar"; text: string };

/** Things that would look broken or empty on the live site. */
export function checkHome(c: HomeConfig, site: { articles: FeedArticle[]; categories: string[] | null }): HomeIssue[] {
  const out: HomeIssue[] = [];
  const shown = c.blocks.filter((b) => b.visible);
  if (shown.length === 0) out.push({ level: "error", block: "hero", text: "كل عناصر الصفحة الرئيسية مخفية؛ ستظهر الصفحة فارغة." });
  const hero = getBlock(c, "hero");
  if (hero.visible && !hero.title.trim()) out.push({ level: "warn", block: "hero", text: "عنوان بنر الترحيب فارغ." });
  const stats = getBlock(c, "stats");
  if (stats.visible) {
    if (!stats.items.some((s) => s.visible)) out.push({ level: "warn", block: "stats", text: "بطاقات الأرقام ظاهرة لكن كل البطاقات بداخلها مخفية." });
    for (const s of stats.items) if (s.visible && s.source === "custom" && !s.value.trim()) out.push({ level: "warn", block: "stats", text: `بطاقة «${s.label || "بدون اسم"}» بلا رقم.` });
  }
  const feed = getBlock(c, "feed");
  if (feed.visible) {
    if (site.articles.length === 0) out.push({ level: "warn", block: "feed", text: "لا توجد مقالات منشورة على الموقع، لذلك لن يظهر أي مقال أو قسم في الصفحة الرئيسية." });
    if (!feed.mixed.visible && !feed.shelves.visible) out.push({ level: "warn", block: "feed", text: "المقالات المنفردة والأقسام كلاهما مخفي؛ لن يظهر أي مقال." });
    if (feed.shelves.visible && site.articles.length > 0) {
      for (const s of feed.sections) {
        if (!s.visible) continue;
        if (s.categories.length === 0 && s.tags.length === 0) out.push({ level: "warn", block: "feed", text: `قسم «${s.highlight}» بلا تصنيفات ولا وسوم، فلن يجمع أي مقال.` });
        else if (!site.articles.some((a) => matchesFeedSection(a, s))) out.push({ level: "info", block: "feed", text: `قسم «${s.highlight}» لا يطابق أي مقال حاليًا، فلن يظهر على الموقع.` });
      }
    }
    if (site.categories) {
      const known = new Set(site.categories);
      for (const s of feed.sections) for (const cat of s.categories) if (s.visible && !known.has(cat) && site.articles.some((a) => a.category === cat)) out.push({ level: "info", block: "feed", text: `التصنيف «${cat}» في قسم «${s.highlight}» غير مسجّل في الموقع.` });
    }
  }
  if (getBlock(c, "discord").visible || c.sidebar.discordButton.visible) {
    if (!/^https:\/\/(discord\.gg|discord\.com)\//i.test(c.discordUrl)) out.push({ level: "warn", block: "discord", text: "رابط ديسكورد لا يبدو رابط دعوة صحيحًا (discord.gg/…)." });
  }
  const tags = getBlock(c, "tags");
  if (tags.visible && countTags(site.articles).length === 0) out.push({ level: "info", block: "tags", text: "لا توجد وسوم بعد؛ قسم الوسوم سيظهر بعنوانه فقط." });
  if (c.sidebar.visible) for (const n of c.sidebar.quickNav) if (n.visible && !/^(\/|https?:\/\/)/.test(n.href)) out.push({ level: "warn", block: "sidebar", text: `رابط «${n.label || "بدون اسم"}» يجب أن يبدأ بـ / أو https://` });
  return out;
}

// ---------- local draft (unpublished edits survive a reload) ----------

const DRAFT_KEY = "veguto:home-draft";
export type HomeDraft = { baseSha: string | null; config: HomeConfig; savedAt: number };

export function loadHomeDraft(): HomeDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.config?.version !== 2) return null;
    return { baseSha: typeof d.baseSha === "string" ? d.baseSha : null, config: normalizeHomeConfig(d.config), savedAt: Number(d.savedAt) || 0 };
  } catch { return null; }
}

export function saveHomeDraft(d: HomeDraft | null): boolean {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); else localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem("veguto:site-config");
    return true;
  } catch { return false; }
}
