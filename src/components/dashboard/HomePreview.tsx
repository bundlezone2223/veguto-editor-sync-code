import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EyeOff, Menu, Monitor, Search, Shuffle, Smartphone } from "lucide-react";
import {
  buildFeed, countTags, getBlock, moveTo, statValue,
  type FeedArticle, type HomeBlock, type HomeConfig, type SiteCounts,
} from "@/lib/site-config";
import type { SiteCategory } from "@/lib/site-snapshot";
import { DragHandle, SortableList } from "./Sortable";
import { BLOCK_INFO, type EditTarget } from "./block-info";
import type { SiteData } from "./HomeLayoutEditor";

type Device = "desktop" | "mobile";
/** The desktop preview fills the frame (at least this wide); the phone preview keeps a phone width. */
const DESKTOP_MIN = 480, MOBILE_WIDTH = 390;

/** Small seeded random, so "shuffle" gives a new order only when asked. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Card({ article, categories }: { article: FeedArticle; categories: SiteCategory[] | null }) {
  const cat = categories?.find((c) => c.id === article.category);
  const label = cat ? `${cat.emoji} ${cat.title}` : article.category;
  return (
    <div className="vp-card flex h-full min-w-0 flex-col overflow-hidden">
      <div className="aspect-[2.037/1] w-full overflow-hidden bg-vp-muted">
        {article.thumbnail && <img src={article.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />}
      </div>
      <div className="p-1.5">
        {label && <span className="inline-block max-w-full truncate rounded-full bg-vp-primary-soft px-1.5 text-[8px] uppercase text-vp-primary">{label}</span>}
        <p className="mt-0.5 line-clamp-2 break-words font-semibold" dir="auto">{article.title}</p>
      </div>
    </div>
  );
}

function BlockView({ block, articles, categories, counts, seed }: {
  block: HomeBlock; articles: FeedArticle[]; categories: SiteCategory[] | null; counts: SiteCounts; seed: number;
}) {
  switch (block.type) {
    case "hero":
      return (
        <section className="vp-hero">
          <p className="italic text-vp-primary">{block.kicker}</p>
          <h1 className="text-xl font-bold italic">{block.title}</h1>
          <p className="mx-auto mt-1 max-w-xs text-vp-muted-fg">{block.subtitle}</p>
          {block.showSearch && (
            <div className="mx-auto mt-2 flex max-w-xs items-center justify-between gap-2 rounded-full bg-vp-card py-1 pl-3 pr-1 shadow-sm">
              <span className="truncate text-vp-muted-fg">{block.searchPlaceholder}</span>
              <span className="rounded-full bg-vp-primary px-2 py-0.5 text-vp-on-color">Search</span>
            </div>
          )}
        </section>
      );
    case "stats": {
      const items = block.items.filter((s) => s.visible);
      if (items.length === 0) return null;
      return (
        <section className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(4, items.length)}, minmax(0, 1fr))` }}>
          {items.map((s) => (
            <div key={s.id} className="vp-stat">
              <div className="vp-stat-num">{statValue(s, counts)}</div>
              <div className="vp-stat-label">{s.label}</div>
            </div>
          ))}
        </section>
      );
    }
    case "feed": {
      const rows = buildFeed(block, articles, block.mixed.shuffle || block.shelves.shuffle ? seeded(seed) : null);
      if (rows.length === 0) return <div className="mt-3 rounded-lg border border-dashed border-vp-border p-3 text-center text-vp-muted-fg">No articles yet</div>;
      return (
        <div>
          {rows.map((row, i) => (
            <div key={i}>
              {row.grid && (
                <section className="mt-3 grid grid-cols-2 gap-1.5">
                  {row.grid.map((a) => <Card key={a.id} article={a} categories={categories} />)}
                </section>
              )}
              {row.shelf && (
                <div className="mt-3">
                  <h2 className="vp-section-title">
                    {row.shelf.section.emoji} {row.shelf.section.prefix} <span className="text-vp-primary">{row.shelf.section.highlight}</span>
                  </h2>
                  <div className="vp-noscroll flex gap-1.5 overflow-x-auto">
                    {row.shelf.items.map((a) => (
                      <div key={a.id} className="w-[calc((100%-0.75rem)/3)] shrink-0"><Card article={a} categories={categories} /></div>
                    ))}
                  </div>
                  {block.shelves.showSeeAll && <div className="mt-1 text-right text-[9px] font-semibold text-vp-primary">See all {row.shelf.section.highlight} articles →</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }
    case "discord":
      return (
        <section className="mt-3">
          <div className="vp-discord-banner overflow-hidden rounded-xl px-3 py-4 text-center shadow-sm">
            <div className="text-xl">{block.emoji}</div>
            <p className="text-sm font-bold italic">{block.title}</p>
            <p className="mx-auto mt-1 max-w-xs text-[10px] opacity-90">{block.text}</p>
            <span className="mt-2 inline-block rounded-full bg-vp-card px-3 py-0.5 font-semibold text-vp-discord">{block.button}</span>
          </div>
        </section>
      );
    case "tags": {
      const tags = countTags(articles).slice(0, block.count);
      return (
        <div className="mt-3">
          <h2 className="vp-section-title">{block.title}</h2>
          <div className="flex flex-wrap gap-1">
            {tags.length === 0 && <span className="text-[9px] text-vp-muted-fg">No tags yet</span>}
            {tags.map((t) => (
              <span key={t.slug} className="rounded-full border border-vp-border bg-vp-card px-2 py-0.5 text-[10px] text-vp-muted-fg">#{t.tag} <span className="opacity-60">{t.count}</span></span>
            ))}
          </div>
          {block.showSeeAll && <div className="mt-1 text-right text-[9px] font-semibold text-vp-primary">See all tags →</div>}
        </div>
      );
    }
  }
}

function Sidebar({ config }: { config: HomeConfig }) {
  const sb = config.sidebar;
  const links = [
    ...sb.quickNav.filter((n) => n.visible).map((n) => ({ label: `${n.emoji} ${n.label}`, group: "Quick nav" })),
    ...(sb.showSections ? getBlock(config, "feed").sections.filter((s) => s.visible).map((s) => ({ label: `${s.emoji} ${s.highlight}`, group: "Sections" })) : []),
  ];
  return (
    <div className="space-y-1 rounded-xl border border-vp-border bg-vp-card p-2">
      <p className="font-bold italic text-vp-primary">{sb.title}</p>
      {links.map((item, i) => (
        <div key={i}>
          {(i === 0 || links[i - 1]?.group !== item.group) && <p className={`text-[9px] font-semibold uppercase text-vp-muted-fg ${i > 0 ? "pt-1" : ""}`}>{item.group}</p>}
          <p className="truncate">{item.label}</p>
        </div>
      ))}
      {sb.discordButton.visible && <p className="mt-1 rounded-md bg-vp-accent py-1 text-center text-vp-on-color">{sb.discordButton.label}</p>}
    </div>
  );
}

function Editable({ target, selected, onSelect, handle = true, children }: { target: EditTarget; selected: boolean; onSelect: (t: EditTarget) => void; handle?: boolean; children: ReactNode }) {
  return (
    <div className="vp-block" data-block={target} data-selected={selected || undefined} onClick={() => onSelect(target)}>
      <div className="vp-block-tools">
        {handle && <DragHandle label={`اسحب ${BLOCK_INFO[target].label} لتغيير ترتيبه`} />}
        <span className="vp-block-label">{BLOCK_INFO[target].label}</span>
      </div>
      {children}
    </div>
  );
}

/** The main site's home page, scaled into a fixed-height window you scroll inside. */
export function HomePreview({ config, onChange, site, editorArticles, selected, onSelect }: {
  config: HomeConfig; onChange: (c: HomeConfig) => void; site: SiteData; editorArticles: FeedArticle[];
  selected: EditTarget | null; onSelect: (t: EditTarget) => void;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const [source, setSource] = useState<"site" | "editor">("site");
  const [showHidden, setShowHidden] = useState(false);
  const [seed, setSeed] = useState(1);
  const [frameWidth, setFrameWidth] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const fromPreview = useRef(false);
  const autoSource = useRef(true);

  // On a phone, start with the phone-size preview.
  useEffect(() => { if (window.innerWidth < 768) setDevice("mobile"); }, []);

  // Use the editor's own articles when the site has none yet, so the layout can still be seen.
  useEffect(() => {
    if (autoSource.current) setSource(site.articles.length === 0 && editorArticles.length > 0 ? "editor" : "site");
  }, [site.articles.length, editorArticles.length]);

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrameWidth(el.clientWidth));
    ro.observe(el);
    setFrameWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const width = device === "desktop" ? Math.max(DESKTOP_MIN, frameWidth) : MOBILE_WIDTH;
  const zoom = frameWidth ? Math.min(1, frameWidth / width) : 0.4;
  const articles = source === "site" ? site.articles : editorArticles;
  const counts = useMemo<SiteCounts>(() => ({ articles: articles.length, categories: site.counts.categories, tags: countTags(articles).length }), [articles, site.counts.categories]);
  const blocks = showHidden ? config.blocks : config.blocks.filter((b) => b.visible);

  // Selecting a card in the editor scrolls the preview to that element.
  useEffect(() => {
    if (!selected) return;
    if (fromPreview.current) { fromPreview.current = false; return; }
    const box = frame.current, el = box?.querySelector<HTMLElement>(`[data-block="${selected}"]`);
    if (!box || !el) return;
    box.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 40 * zoom), behavior: "smooth" });
  }, [selected, zoom]);

  const select = (t: EditTarget) => { fromPreview.current = true; onSelect(t); };
  const reorder = (from: number, to: number) => {
    const ids = config.blocks.map((b) => b.type);
    onChange({ ...config, blocks: moveTo(config.blocks, ids.indexOf(blocks[from]!.type), ids.indexOf(blocks[to]!.type)) });
  };
  const seg = (on: boolean) => `inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`;
  const shuffled = getBlock(config, "feed").mixed.shuffle || getBlock(config, "feed").shelves.shuffle;

  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-2 shadow-[var(--card-shadow)]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5" role="group" aria-label="حجم الشاشة">
          <button type="button" className={seg(device === "desktop")} aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><Monitor size={14} /> كمبيوتر</button>
          <button type="button" className={seg(device === "mobile")} aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}><Smartphone size={14} /> هاتف</button>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5" role="group" aria-label="مصدر المقالات في المعاينة">
          <button type="button" className={seg(source === "site")} aria-pressed={source === "site"} onClick={() => { autoSource.current = false; setSource("site"); }}>مقالات الموقع ({site.articles.length})</button>
          <button type="button" className={seg(source === "editor")} aria-pressed={source === "editor"} onClick={() => { autoSource.current = false; setSource("editor"); }}>مقالات المحرر ({editorArticles.length})</button>
        </div>
        <div className="flex items-center gap-1">
          {shuffled && <button type="button" onClick={() => setSeed((s) => s + 1)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" title="ترتيب عشوائي جديد كأنها زيارة جديدة"><Shuffle size={14} /> زيارة جديدة</button>}
          <button type="button" aria-pressed={showHidden} onClick={() => setShowHidden((v) => !v)} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-muted ${showHidden ? "text-accent-pink" : "text-muted-foreground"}`}><EyeOff size={14} /> المخفي</button>
        </div>
      </div>
      {source === "editor" && <p className="mb-2 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">تعرض المعاينة مقالات المحرر للتجربة فقط؛ الموقع يعرض المقالات المنشورة عليه ({site.articles.length}).</p>}

      <div
        ref={frame}
        aria-label="معاينة الصفحة الرئيسية"
        className="relative h-[58vh] min-h-80 w-full overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-vp-bg lg:h-[calc(100vh-12rem)] lg:max-h-[56rem]"
      >
        <div
          dir="ltr"
          className="vp @container mx-auto min-h-full"
          style={{ width, zoom, ["--vp-z" as string]: zoom }}
        >
          <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-vp-border bg-vp-card/90 px-3 py-1.5 backdrop-blur">
            <span className="font-bold italic text-vp-primary">Veguto <span className="text-[9px] font-medium not-italic uppercase tracking-[0.2em] text-vp-muted-fg">wiki</span></span>
            <nav className="flex items-center gap-2 text-[10px]">
              <span>🌙 Anime</span><span>🎮 Gaming</span><Search className="size-3" /><Menu className="size-3" />
            </nav>
          </header>
          <div className={`grid w-full gap-3 p-3 ${config.sidebar.visible ? "@min-[440px]:grid-cols-[minmax(0,1fr)_9rem]" : ""}`}>
            <main className="min-w-0">
              {blocks.length === 0 && <div className="vp-hidden-block">كل العناصر مخفية</div>}
              <SortableList items={blocks} getId={(b) => b.type} onReorder={reorder} zoom={zoom}>
                {(b) => (
                  <Editable target={b.type} selected={selected === b.type} onSelect={select}>
                    {b.visible
                      ? <BlockView block={b} articles={articles} categories={site.categories} counts={counts} seed={seed} />
                      : <div className="vp-hidden-block"><EyeOff size={16} /> مخفي: {BLOCK_INFO[b.type].label}</div>}
                  </Editable>
                )}
              </SortableList>
            </main>
            {config.sidebar.visible && (
              <aside className="hidden min-w-0 @min-[440px]:block">
                <div className="sticky top-10">
                  <Editable target="sidebar" handle={false} selected={selected === "sidebar"} onSelect={select}><Sidebar config={config} /></Editable>
                </div>
              </aside>
            )}
          </div>
          <footer className="mt-3 border-t-2 border-vp-primary bg-vp-card/60 px-3 py-3">
            <p className="font-bold italic text-vp-primary">Veguto <span className="text-[9px] font-medium not-italic uppercase tracking-[0.2em] text-vp-muted-fg">wiki</span></p>
            <p className="mt-1 max-w-xs text-[10px] text-vp-muted-fg">Tiny guides for the things we love online — anime, cozy games, art, VTubers and aesthetics. 🌸</p>
          </footer>
        </div>
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
        عرض {width}px · تكبير {Math.round(zoom * 100)}% · اضغط أي عنصر لتعديله، واسحب ⠿ لتغيير مكانه
      </p>
    </div>
  );
}
