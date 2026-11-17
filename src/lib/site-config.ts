/**
 * How the main Veguto Wiki home page looks. Edited in the Dashboard, saved in this
 * browser, and published to GitHub as `content/home.json` for the main site to read.
 */
export type StatItem = { value: string; label: string };
export type NavItem = { emoji: string; label: string; href: string };
export type SiteSection = { slug: string; emoji: string; label: string; visible: boolean };
export type FeaturedBlock = {
  id: string;
  emoji: string;
  title: string;
  highlight: string;
  /** Category name whose articles fill the slider. */
  category: string;
  limit: number;
  visible: boolean;
};

export type SiteConfig = {
  version: 1;
  hero: { visible: boolean; kicker: string; title: string; subtitle: string; searchPlaceholder: string; showSearch: boolean };
  stats: { visible: boolean; items: StatItem[] };
  latest: { visible: boolean; count: number };
  quickNav: NavItem[];
  sections: SiteSection[];
  featured: FeaturedBlock[];
  discord: { visible: boolean; label: string; url: string };
};

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  version: 1,
  hero: {
    visible: true,
    kicker: "welcome to",
    title: "Veguto Wiki",
    subtitle: "Your cozy guide to anime, VTubing, cozy games, kawaii & dark aesthetics, and the soft little community in between. 🌸",
    searchPlaceholder: "Search articles, tags, vibes...",
    showSearch: true,
  },
  stats: {
    visible: true,
    items: [
      { value: "26+", label: "articles & guides" },
      { value: "8+", label: "cozy categories" },
      { value: "100+", label: "tags to explore" },
      { value: "14k+", label: "monthly visitors" },
    ],
  },
  latest: { visible: true, count: 4 },
  quickNav: [
    { emoji: "🏠", label: "Home", href: "/" },
    { emoji: "📚", label: "All articles", href: "/articles" },
    { emoji: "🏷️", label: "Tags", href: "/tags" },
    { emoji: "✨", label: "About the wiki", href: "/about" },
  ],
  sections: [
    { slug: "video-games", emoji: "🎮", label: "Video Games", visible: true },
    { slug: "anime", emoji: "🌙", label: "Anime", visible: true },
    { slug: "animation", emoji: "🎬", label: "Animation", visible: true },
    { slug: "horror-games", emoji: "🩸", label: "Horror Games", visible: true },
    { slug: "psychological-horror", emoji: "🧠", label: "Psychological Horror", visible: true },
    { slug: "isekai", emoji: "🌀", label: "Isekai", visible: true },
    { slug: "indie-rpg-games", emoji: "🕹️", label: "Indie RPG Games", visible: true },
  ],
  featured: [
    { id: "anime", emoji: "🌙", title: "Everything About", highlight: "Anime", category: "Anime", limit: 6, visible: true },
  ],
  discord: { visible: true, label: "Join our Discord", url: "https://discord.gg/" },
};

const KEY = "veguto:site-config";

const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const num = (v: unknown, d: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
const arr = <T,>(v: unknown, f: (x: Loose) => T | null, d: T[]): T[] =>
  Array.isArray(v) ? v.flatMap((x) => (x && typeof x === "object" ? [f(x)] : [])).filter((x): x is T => x !== null) : d;

/** Fills gaps and drops bad values so a damaged or older saved config never breaks the page. */
export function normalizeSiteConfig(input: unknown): SiteConfig {
  const d = DEFAULT_SITE_CONFIG;
  const o: Loose = input && typeof input === "object" ? input : {};
  const h = o.hero ?? {}, s = o.stats ?? {}, l = o.latest ?? {}, dc = o.discord ?? {};
  return {
    version: 1,
    hero: {
      visible: bool(h.visible, d.hero.visible), kicker: str(h.kicker, d.hero.kicker), title: str(h.title, d.hero.title),
      subtitle: str(h.subtitle, d.hero.subtitle), searchPlaceholder: str(h.searchPlaceholder, d.hero.searchPlaceholder),
      showSearch: bool(h.showSearch, d.hero.showSearch),
    },
    stats: {
      visible: bool(s.visible, d.stats.visible),
      items: arr(s.items, (x) => ({ value: str(x.value, ""), label: str(x.label, "") }), d.stats.items).slice(0, 8),
    },
    latest: { visible: bool(l.visible, d.latest.visible), count: num(l.count, d.latest.count, 1, 24) },
    quickNav: arr(o.quickNav, (x) => ({ emoji: str(x.emoji, ""), label: str(x.label, ""), href: str(x.href, "/") }), d.quickNav),
    sections: arr(o.sections, (x) => {
      const label = str(x.label, "").trim();
      if (!label) return null;
      return { slug: str(x.slug, "") || slugify(label), emoji: str(x.emoji, ""), label, visible: bool(x.visible, true) };
    }, d.sections),
    featured: arr(o.featured, (x) => ({
      id: str(x.id, "") || Math.random().toString(36).slice(2, 8), emoji: str(x.emoji, ""), title: str(x.title, ""),
      highlight: str(x.highlight, ""), category: str(x.category, ""), limit: num(x.limit, 6, 1, 24), visible: bool(x.visible, true),
    }), d.featured),
    discord: { visible: bool(dc.visible, d.discord.visible), label: str(dc.label, d.discord.label), url: str(dc.url, d.discord.url) },
  };
}

export function slugify(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

export function loadSiteConfig(): SiteConfig {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeSiteConfig(JSON.parse(raw)) : structuredClone(DEFAULT_SITE_CONFIG);
  } catch {
    return structuredClone(DEFAULT_SITE_CONFIG);
  }
}

export function saveSiteConfig(c: SiteConfig): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(c)); return true; } catch { return false; }
}

/** Moves item `i` by `delta` places; returns a new array (unchanged when out of range). */
export function moveItem<T>(list: T[], i: number, delta: number): T[] {
  const j = i + delta;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list;
  const next = list.slice();
  const [x] = next.splice(i, 1);
  next.splice(j, 0, x!);
  return next;
}
