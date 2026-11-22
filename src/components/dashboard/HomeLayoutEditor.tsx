import { useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, Eye, EyeOff, Info, Plus, Shuffle, Trash2 } from "lucide-react";
import {
  countTags, getBlock, matchesFeedSection, moveTo, slugify, statValue, updateBlock,
  type BlockType, type FeedArticle, type FeedSection, type HomeBlock, type HomeConfig, type HomeIssue, type SiteCounts, type StatItem, type StatSource,
} from "@/lib/site-config";
import type { SiteCategory } from "@/lib/site-snapshot";
import { ChipsInput, Field, GhostButton, NumberStepper, SmallInput, Toggle } from "./ui";
import { DragHandle, SortableList } from "./Sortable";
import { BLOCK_INFO, type EditTarget } from "./block-info";

export type SiteData = { articles: FeedArticle[]; categories: SiteCategory[] | null; counts: SiteCounts };

type Props = {
  config: HomeConfig;
  onChange: (c: HomeConfig) => void;
  site: SiteData;
  selected: EditTarget | null;
  onSelect: (t: EditTarget | null) => void;
  issues: HomeIssue[];
};

const STAT_SOURCES: { value: StatSource; label: string }[] = [
  { value: "articles", label: "عدد المقالات (تلقائي)" },
  { value: "categories", label: "عدد التصنيفات (تلقائي)" },
  { value: "tags", label: "عدد الوسوم (تلقائي)" },
  { value: "custom", label: "رقم أكتبه بنفسي" },
];

function VisibilityButton({ visible, onChange, label }: { visible: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={visible}
      aria-label={visible ? `إخفاء ${label}` : `إظهار ${label}`}
      title={visible ? "ظاهر على الموقع — اضغط للإخفاء" : "مخفي — اضغط للإظهار"}
      onClick={(e) => { e.stopPropagation(); onChange(!visible); }}
      className={`grid size-8 shrink-0 place-items-center rounded-lg transition-colors ${visible ? "text-accent-pink hover:bg-hero-from" : "bg-muted text-muted-foreground hover:text-foreground"}`}
    >
      {visible ? <Eye size={17} /> : <EyeOff size={17} />}
    </button>
  );
}

function IssueList({ issues }: { issues: HomeIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="mb-3 space-y-1">
      {issues.map((i, n) => (
        <li key={n} className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs ${i.level === "info" ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive"}`}>
          {i.level === "info" ? <Info size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
          {i.text}
        </li>
      ))}
    </ul>
  );
}

/** One home page element: ⠿ grip in the top corner, name, summary, show/hide, and its settings. */
function ElementCard({ target, index, visible, onVisible, summary, open, onToggle, issues, children, draggable = true }: {
  target: EditTarget; index?: number; visible: boolean; onVisible: (v: boolean) => void; summary: string;
  open: boolean; onToggle: () => void; issues: HomeIssue[]; children: ReactNode; draggable?: boolean;
}) {
  const { label, Icon } = BLOCK_INFO[target];
  const warnings = issues.filter((i) => i.level !== "info").length;
  return (
    <section
      id={`edit-${target}`}
      aria-label={label}
      className={`scroll-mt-4 rounded-2xl border bg-card shadow-[var(--card-shadow)] transition-colors ${open ? "border-accent-pink ring-2 ring-accent-pink/15" : "border-border"}`}
    >
      <div className="flex items-center gap-1.5 p-2">
        {draggable ? <DragHandle label={`اسحب ${label} لتغيير ترتيبه`} /> : <span className="w-7" aria-hidden />}
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 text-start hover:bg-muted/60">
          <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${visible ? "bg-hero-from text-accent-pink" : "bg-muted text-muted-foreground"}`}><Icon size={18} /></span>
          <span className="min-w-0 flex-1">
            <span className={`block text-sm font-bold ${visible ? "" : "text-muted-foreground line-through decoration-1"}`}>
              {index !== undefined && <span className="me-1 text-muted-foreground tabular-nums">{index + 1}.</span>}
              {label}
            </span>
            <span className="block truncate text-xs text-muted-foreground" dir="auto">{visible ? summary : "مخفي من الموقع"}</span>
          </span>
          {warnings > 0 && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-destructive text-[11px] font-bold text-card" title="تحتاج مراجعة">{warnings}</span>}
          <ChevronDown size={17} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <VisibilityButton visible={visible} onChange={onVisible} label={label} />
      </div>
      {open && <div className="border-t border-border p-3"><IssueList issues={issues} />{children}</div>}
    </section>
  );
}

function SubPanel({ title, desc, visible, onVisible, children }: { title: string; desc?: string; visible: boolean; onVisible: (v: boolean) => void; children: ReactNode }) {
  return (
    <div className={`rounded-xl border border-border p-3 ${visible ? "bg-background" : "bg-muted/50"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold">{title}</p>
          {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
        </div>
        <Toggle label={`إظهار ${title}`} checked={visible} onChange={onVisible} />
      </div>
      {visible && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function HomeLayoutEditor({ config: c, onChange, site, selected, onSelect, issues }: Props) {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const patch = <T extends BlockType>(type: T, p: Partial<Extract<HomeBlock, { type: T }>>) => onChange(updateBlock(c, type, p));
  const toggle = (t: EditTarget) => onSelect(selected === t ? null : t);
  const issuesOf = (t: EditTarget) => issues.filter((i) => i.block === t);
  const categoryIds = site.categories?.map((x) => x.id) ?? [];
  const tagSuggestions = countTags(site.articles).map((t) => t.slug);

  const body = (b: HomeBlock): { summary: string; content: ReactNode } => {
    switch (b.type) {
      case "hero":
        return {
          summary: b.title || "بدون عنوان",
          content: (
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="السطر الصغير فوق العنوان" value={b.kicker} onChange={(v) => patch("hero", { kicker: v })} />
              <Field label="العنوان" value={b.title} onChange={(v) => patch("hero", { title: v })} />
              <div className="sm:col-span-2"><Field multiline label="الوصف" value={b.subtitle} onChange={(v) => patch("hero", { subtitle: v })} /></div>
              <Field label="النص داخل خانة البحث" value={b.searchPlaceholder} onChange={(v) => patch("hero", { searchPlaceholder: v })} />
              <div className="flex items-center justify-between gap-2 self-end rounded-md border border-border px-2.5 py-1.5 text-sm">
                إظهار خانة البحث
                <Toggle label="إظهار خانة البحث" checked={b.showSearch} onChange={(v) => patch("hero", { showSearch: v })} />
              </div>
            </div>
          ),
        };
      case "stats": {
        const setItems = (items: StatItem[]) => patch("stats", { items });
        const upd = (i: number, p: Partial<StatItem>) => setItems(b.items.map((x, j) => (j === i ? { ...x, ...p } : x)));
        return {
          summary: `${b.items.filter((x) => x.visible).length} بطاقات · ${b.items.filter((x) => x.visible).map((x) => statValue(x, site.counts) || "؟").join(" · ")}`,
          content: (
            <div className="space-y-2">
              <SortableList items={b.items} getId={(x) => x.id} onReorder={(f, t) => setItems(moveTo(b.items, f, t))} className="space-y-2">
                {(s, i) => (
                  <div className={`flex flex-wrap items-center gap-1.5 rounded-xl border border-border p-1.5 ${s.visible ? "bg-background" : "bg-muted/60"}`}>
                    <DragHandle label={`اسحب بطاقة ${s.label}`} />
                    <Toggle label={`إظهار بطاقة ${s.label}`} checked={s.visible} onChange={(v) => upd(i, { visible: v })} />
                    <select aria-label="مصدر الرقم" value={s.source} onChange={(e) => upd(i, { source: e.target.value as StatSource })} className="rounded-md border border-border bg-background px-1.5 py-1 text-xs">
                      {STAT_SOURCES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {s.source === "custom"
                      ? <SmallInput ariaLabel="الرقم" className="w-20 font-bold" value={s.value} onChange={(v) => upd(i, { value: v })} />
                      : <span className="w-20 rounded-md bg-muted px-2 py-1 text-center text-sm font-bold text-accent-pink" title="يحسبه الموقع تلقائيًا">{statValue(s, site.counts)}</span>}
                    <SmallInput ariaLabel="الوصف" className="min-w-28 flex-1" value={s.label} onChange={(v) => upd(i, { label: v })} />
                    <GhostButton ariaLabel={`حذف بطاقة ${s.label}`} onClick={() => setItems(b.items.filter((_, j) => j !== i))}><Trash2 size={14} /></GhostButton>
                  </div>
                )}
              </SortableList>
              {b.items.length < 8 && (
                <GhostButton onClick={() => setItems([...b.items, { id: `stat-${Date.now().toString(36)}`, source: "custom", value: "0+", label: "new stat", visible: true }])}>
                  <Plus size={14} /> إضافة بطاقة
                </GhostButton>
              )}
            </div>
          ),
        };
      }
      case "feed": {
        const setSections = (sections: FeedSection[]) => patch("feed", { sections });
        const updS = (i: number, p: Partial<FeedSection>) => setSections(b.sections.map((x, j) => (j === i ? { ...x, ...p } : x)));
        const visibleSections = b.sections.filter((s) => s.visible);
        const groups = b.mixed.visible ? Math.ceil(site.articles.length / b.mixed.perGroup) : 0;
        const addSection = () => {
          let n = b.sections.length + 1, key = `section-${n}`;
          while (b.sections.some((s) => s.key === key)) key = `section-${++n}`;
          setSections([...b.sections, { key, emoji: "⭐", prefix: "Everything About", highlight: "New Section", categories: [], tags: [], visible: true }]);
          setOpenSection(key);
        };
        return {
          summary: `${visibleSections.length} أقسام · ${site.articles.length} مقال منشور${b.mixed.visible ? " · مقالات منفردة مختلطة" : ""}`,
          content: (
            <div className="space-y-3">
              <SubPanel title="المقالات المنفردة (المختلطة)" desc="كل المقالات المنشورة في شبكات صغيرة تتناوب مع الأقسام" visible={b.mixed.visible} onVisible={(v) => patch("feed", { mixed: { ...b.mixed, visible: v } })}>
                <SettingRow label="عدد المقالات في كل مجموعة">
                  <NumberStepper label="عدد المقالات في كل مجموعة" min={1} max={12} value={b.mixed.perGroup} onChange={(v) => patch("feed", { mixed: { ...b.mixed, perGroup: v } })} />
                </SettingRow>
                <SettingRow label="خلط المقالات عشوائيًا" hint="ترتيب جديد عند كل زيارة">
                  <Toggle label="خلط المقالات المنفردة" checked={b.mixed.shuffle} onChange={(v) => patch("feed", { mixed: { ...b.mixed, shuffle: v } })} />
                </SettingRow>
                <p className="rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">سيظهر {site.articles.length} مقال في {groups} مجموعة.</p>
              </SubPanel>

              <SubPanel title="أقسام «Everything About»" desc="شريط بطاقات لكل قسم، يتناوب مع المقالات المنفردة" visible={b.shelves.visible} onVisible={(v) => patch("feed", { shelves: { ...b.shelves, visible: v } })}>
                <SettingRow label="عدد البطاقات في كل قسم">
                  <NumberStepper label="عدد البطاقات في كل قسم" min={1} max={24} value={b.shelves.limit} onChange={(v) => patch("feed", { shelves: { ...b.shelves, limit: v } })} />
                </SettingRow>
                <SettingRow label="خلط ترتيب الأقسام ومقالاتها" hint="ترتيب جديد عند كل زيارة">
                  <Toggle label="خلط الأقسام" checked={b.shelves.shuffle} onChange={(v) => patch("feed", { shelves: { ...b.shelves, shuffle: v } })} />
                </SettingRow>
                <SettingRow label="رابط «See all … articles» تحت كل قسم">
                  <Toggle label="رابط عرض الكل" checked={b.shelves.showSeeAll} onChange={(v) => patch("feed", { shelves: { ...b.shelves, showSeeAll: v } })} />
                </SettingRow>
                {b.shelves.shuffle && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground"><Shuffle size={13} /> الخلط مفعّل: ترتيبك للأقسام لا يُعتمد على الموقع. أوقفه ليظهر الترتيب كما رتّبته.</p>
                )}
                <SortableList items={b.sections} getId={(s) => s.key} onReorder={(f, t) => setSections(moveTo(b.sections, f, t))} className="space-y-2">
                  {(s, i) => {
                    const matches = site.articles.filter((a) => matchesFeedSection(a, s)).length;
                    const isOpen = openSection === s.key;
                    return (
                      <div className={`rounded-xl border border-border ${s.visible ? "bg-card" : "bg-muted/60"}`}>
                        <div className="flex items-center gap-1.5 p-1.5">
                          <DragHandle label={`اسحب قسم ${s.highlight}`} />
                          <Toggle label={`إظهار قسم ${s.highlight}`} checked={s.visible} onChange={(v) => updS(i, { visible: v })} />
                          <SmallInput ariaLabel="الرمز" className="w-10 text-center" value={s.emoji} onChange={(v) => updS(i, { emoji: v })} />
                          <SmallInput ariaLabel="اسم القسم" className="min-w-0 flex-1 font-semibold" value={s.highlight} onChange={(v) => updS(i, { highlight: v })} />
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${matches ? "bg-hero-from text-accent-pink" : "bg-muted text-muted-foreground"}`} title="المقالات المطابقة لهذا القسم">{matches} مقال</span>
                          <button type="button" aria-label={`إعدادات قسم ${s.highlight}`} aria-expanded={isOpen} onClick={() => setOpenSection(isOpen ? null : s.key)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted">
                            <ChevronDown size={15} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                          </button>
                        </div>
                        {isOpen && (
                          <div className="space-y-2 border-t border-border p-2.5">
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Field label="الكلمات قبل الاسم" value={s.prefix} onChange={(v) => updS(i, { prefix: v })} />
                              <Field label="معرّف الرابط (?section=)" value={s.key} onChange={(v) => { const key = slugify(v); if (!b.sections.some((x, j) => j !== i && x.key === key)) { updS(i, { key }); setOpenSection(key); } }} />
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">التصنيفات التي تدخل هذا القسم</p>
                              <ChipsInput label={`تصنيفات قسم ${s.highlight}`} listId={`cats-${s.key}`} values={s.categories} suggestions={categoryIds} placeholder="مثل anime-manga" onChange={(v) => updS(i, { categories: v })} />
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">أو الوسوم التي تدخل هذا القسم</p>
                              <ChipsInput label={`وسوم قسم ${s.highlight}`} listId={`tags-${s.key}`} values={s.tags} suggestions={tagSuggestions} placeholder="مثل isekai" onChange={(v) => updS(i, { tags: v.map((t) => t.toLowerCase().replace(/\s+/g, "-")) })} />
                            </div>
                            <div className="flex justify-end">
                              <GhostButton onClick={() => { if (confirm(`حذف قسم «${s.highlight}»؟`)) setSections(b.sections.filter((_, j) => j !== i)); }}><Trash2 size={14} /> حذف القسم</GhostButton>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }}
                </SortableList>
                <GhostButton onClick={addSection}><Plus size={14} /> إضافة قسم</GhostButton>
              </SubPanel>
            </div>
          ),
        };
      }
      case "discord":
        return {
          summary: b.title,
          content: (
            <div className="grid gap-2 sm:grid-cols-[4rem_1fr]">
              <Field label="الرمز" value={b.emoji} onChange={(v) => patch("discord", { emoji: v })} />
              <Field label="العنوان" value={b.title} onChange={(v) => patch("discord", { title: v })} />
              <div className="sm:col-span-2"><Field multiline label="الوصف" value={b.text} onChange={(v) => patch("discord", { text: v })} /></div>
              <div className="sm:col-span-2 grid gap-2 sm:grid-cols-2">
                <Field label="نص الزر" value={b.button} onChange={(v) => patch("discord", { button: v })} />
                <Field label="رابط الدعوة (يُستخدم في القائمة الجانبية أيضًا)" value={c.discordUrl} onChange={(v) => onChange({ ...c, discordUrl: v.trim() })} />
              </div>
            </div>
          ),
        };
      case "tags": {
        const available = countTags(site.articles).length;
        return {
          summary: `${b.title} · ${Math.min(b.count, available)} من ${available} وسم`,
          content: (
            <div className="space-y-3">
              <Field label="العنوان" value={b.title} onChange={(v) => patch("tags", { title: v })} />
              <SettingRow label="عدد الوسوم المعروضة" hint={`يوجد ${available} وسم في المقالات المنشورة، الأكثر استخدامًا أولًا`}>
                <NumberStepper label="عدد الوسوم" min={1} max={100} value={b.count} onChange={(v) => patch("tags", { count: v })} />
              </SettingRow>
              <SettingRow label="رابط «See all tags»">
                <Toggle label="رابط كل الوسوم" checked={b.showSeeAll} onChange={(v) => patch("tags", { showSeeAll: v })} />
              </SettingRow>
            </div>
          ),
        };
      }
    }
  };

  const sb = c.sidebar;
  const setSidebar = (p: Partial<HomeConfig["sidebar"]>) => onChange({ ...c, sidebar: { ...sb, ...p } });
  const updNav = (i: number, p: Partial<HomeConfig["sidebar"]["quickNav"][number]>) => setSidebar({ quickNav: sb.quickNav.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const shown = c.blocks.filter((b) => b.visible).length;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-2 px-1">
        <div>
          <h2 className="font-bold">عناصر الصفحة الرئيسية</h2>
          <p className="text-xs text-muted-foreground">{c.blocks.length} عناصر · {shown} ظاهرة · اسحب ⠿ لتغيير الترتيب</p>
        </div>
      </div>
      <SortableList items={c.blocks} getId={(b) => b.type} onReorder={(f, t) => onChange({ ...c, blocks: moveTo(c.blocks, f, t) })} className="space-y-2.5">
        {(b, i) => {
          const { summary, content } = body(b);
          return (
            <ElementCard target={b.type} index={i} visible={b.visible} onVisible={(v) => patch(b.type, { visible: v })} summary={summary}
              open={selected === b.type} onToggle={() => toggle(b.type)} issues={issuesOf(b.type)}>
              {content}
            </ElementCard>
          );
        }}
      </SortableList>

      <div className="px-1 pt-2">
        <h2 className="font-bold">بجانب الصفحة</h2>
        <p className="text-xs text-muted-foreground">تظهر على الشاشات الكبيرة فقط</p>
      </div>
      <ElementCard target="sidebar" draggable={false} visible={sb.visible} onVisible={(v) => setSidebar({ visible: v })}
        summary={`${sb.quickNav.filter((n) => n.visible).length} روابط${sb.showSections ? ` + ${getBlock(c, "feed").sections.filter((s) => s.visible).length} أقسام` : ""}`}
        open={selected === "sidebar"} onToggle={() => toggle("sidebar")} issues={issuesOf("sidebar")}>
        <div className="space-y-3">
          <Field label="العنوان" value={sb.title} onChange={(v) => setSidebar({ title: v })} />
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">روابط سريعة (Quick nav)</p>
            <SortableList items={sb.quickNav} getId={(n) => n.id} onReorder={(f, t) => setSidebar({ quickNav: moveTo(sb.quickNav, f, t) })} className="space-y-1.5">
              {(n, i) => (
                <div className={`flex flex-wrap items-center gap-1.5 rounded-xl border border-border p-1.5 ${n.visible ? "bg-background" : "bg-muted/60"}`}>
                  <DragHandle label={`اسحب رابط ${n.label}`} />
                  <Toggle label={`إظهار رابط ${n.label}`} checked={n.visible} onChange={(v) => updNav(i, { visible: v })} />
                  <SmallInput ariaLabel="الرمز" className="w-10 text-center" value={n.emoji} onChange={(v) => updNav(i, { emoji: v })} />
                  <SmallInput ariaLabel="اسم الرابط" className="min-w-24 flex-1" value={n.label} onChange={(v) => updNav(i, { label: v })} />
                  <SmallInput ariaLabel="العنوان" className="w-28" value={n.href} onChange={(v) => updNav(i, { href: v.trim() })} />
                  <GhostButton ariaLabel={`حذف رابط ${n.label}`} onClick={() => setSidebar({ quickNav: sb.quickNav.filter((_, j) => j !== i) })}><Trash2 size={14} /></GhostButton>
                </div>
              )}
            </SortableList>
            {sb.quickNav.length < 20 && <div className="mt-1.5"><GhostButton onClick={() => setSidebar({ quickNav: [...sb.quickNav, { id: `link-${Date.now().toString(36)}`, emoji: "🔗", label: "New link", href: "/", visible: true }] })}><Plus size={14} /> إضافة رابط</GhostButton></div>}
          </div>
          <SettingRow label="إظهار الأقسام تحت الروابط" hint="بالترتيب نفسه الموجود في «المقالات والأقسام»">
            <Toggle label="إظهار الأقسام في القائمة الجانبية" checked={sb.showSections} onChange={(v) => setSidebar({ showSections: v })} />
          </SettingRow>
          <SettingRow label="زر ديسكورد في الأسفل">
            <Toggle label="إظهار زر ديسكورد" checked={sb.discordButton.visible} onChange={(v) => setSidebar({ discordButton: { ...sb.discordButton, visible: v } })} />
          </SettingRow>
          {sb.discordButton.visible && <Field label="نص زر ديسكورد" value={sb.discordButton.label} onChange={(v) => setSidebar({ discordButton: { ...sb.discordButton, label: v } })} />}
        </div>
      </ElementCard>
    </div>
  );
}
