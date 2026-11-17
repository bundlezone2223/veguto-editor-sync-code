import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { moveItem, slugify, type SiteConfig } from "@/lib/site-config";
import { Field, GhostButton, Panel, SmallInput, Toggle } from "./ui";

type Props = { config: SiteConfig; onChange: (c: SiteConfig) => void; categories: string[] };

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background p-1.5">{children}</div>;
}

function MoveButtons({ i, n, onMove }: { i: number; n: number; onMove: (d: number) => void }) {
  return (
    <>
      <GhostButton ariaLabel="تحريك لأعلى" disabled={i === 0} onClick={() => onMove(-1)}><ArrowUp size={14} /></GhostButton>
      <GhostButton ariaLabel="تحريك لأسفل" disabled={i === n - 1} onClick={() => onMove(1)}><ArrowDown size={14} /></GhostButton>
    </>
  );
}

export function HomeLayoutEditor({ config: c, onChange, categories }: Props) {
  const set = <K extends keyof SiteConfig>(key: K, value: SiteConfig[K]) => onChange({ ...c, [key]: value });

  return (
    <div className="space-y-4">
      <Panel title="بنر الترحيب" desc="أعلى الصفحة الرئيسية" actions={<Toggle label="إظهار بنر الترحيب" checked={c.hero.visible} onChange={(v) => set("hero", { ...c.hero, visible: v })} />}>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="السطر الصغير" value={c.hero.kicker} onChange={(v) => set("hero", { ...c.hero, kicker: v })} />
          <Field label="العنوان" value={c.hero.title} onChange={(v) => set("hero", { ...c.hero, title: v })} />
          <div className="sm:col-span-2"><Field multiline label="الوصف" value={c.hero.subtitle} onChange={(v) => set("hero", { ...c.hero, subtitle: v })} /></div>
          <Field label="نص خانة البحث" value={c.hero.searchPlaceholder} onChange={(v) => set("hero", { ...c.hero, searchPlaceholder: v })} />
          <label className="flex items-center justify-between gap-2 self-end rounded-md border border-border px-2.5 py-1.5 text-sm">
            إظهار خانة البحث
            <Toggle label="إظهار خانة البحث" checked={c.hero.showSearch} onChange={(v) => set("hero", { ...c.hero, showSearch: v })} />
          </label>
        </div>
      </Panel>

      <Panel title="بطاقات الأرقام" actions={<Toggle label="إظهار بطاقات الأرقام" checked={c.stats.visible} onChange={(v) => set("stats", { ...c.stats, visible: v })} />}>
        <div className="space-y-1.5">
          {c.stats.items.map((s, i) => (
            <Row key={i}>
              <SmallInput ariaLabel="الرقم" className="w-20 font-bold" value={s.value} onChange={(v) => set("stats", { ...c.stats, items: c.stats.items.map((x, j) => (j === i ? { ...x, value: v } : x)) })} />
              <SmallInput ariaLabel="الوصف" className="flex-1" value={s.label} onChange={(v) => set("stats", { ...c.stats, items: c.stats.items.map((x, j) => (j === i ? { ...x, label: v } : x)) })} />
              <MoveButtons i={i} n={c.stats.items.length} onMove={(d) => set("stats", { ...c.stats, items: moveItem(c.stats.items, i, d) })} />
              <GhostButton ariaLabel="حذف" onClick={() => set("stats", { ...c.stats, items: c.stats.items.filter((_, j) => j !== i) })}><Trash2 size={14} /></GhostButton>
            </Row>
          ))}
          {c.stats.items.length < 8 && <GhostButton onClick={() => set("stats", { ...c.stats, items: [...c.stats.items, { value: "0+", label: "new stat" }] })}><Plus size={14} /> إضافة بطاقة</GhostButton>}
        </div>
      </Panel>

      <Panel title="أحدث المقالات" desc="شبكة البطاقات تحت الأرقام" actions={<Toggle label="إظهار أحدث المقالات" checked={c.latest.visible} onChange={(v) => set("latest", { ...c.latest, visible: v })} />}>
        <label className="flex items-center gap-2 text-sm">
          عدد المقالات
          <input type="number" min={1} max={24} value={c.latest.count} onChange={(e) => set("latest", { ...c.latest, count: Math.max(1, Math.min(24, Number(e.target.value) || 1)) })} className="w-20 rounded-md border border-border bg-background px-2 py-1" />
        </label>
      </Panel>

      <Panel title="الأقسام" desc="تظهر في القائمة الجانبية بالترتيب نفسه">
        <div className="space-y-1.5">
          {c.sections.map((s, i) => (
            <Row key={s.slug + i}>
              <Toggle label={`إظهار ${s.label}`} checked={s.visible} onChange={(v) => set("sections", c.sections.map((x, j) => (j === i ? { ...x, visible: v } : x)))} />
              <SmallInput ariaLabel="الرمز" className="w-12 text-center" value={s.emoji} onChange={(v) => set("sections", c.sections.map((x, j) => (j === i ? { ...x, emoji: v } : x)))} />
              <SmallInput ariaLabel="اسم القسم" className="flex-1" value={s.label} onChange={(v) => set("sections", c.sections.map((x, j) => (j === i ? { ...x, label: v, slug: slugify(v) } : x)))} />
              <MoveButtons i={i} n={c.sections.length} onMove={(d) => set("sections", moveItem(c.sections, i, d))} />
              <GhostButton ariaLabel="حذف" onClick={() => set("sections", c.sections.filter((_, j) => j !== i))}><Trash2 size={14} /></GhostButton>
            </Row>
          ))}
          <GhostButton onClick={() => set("sections", [...c.sections, { slug: `section-${c.sections.length + 1}`, emoji: "⭐", label: "New Section", visible: true }])}><Plus size={14} /> إضافة قسم</GhostButton>
        </div>
      </Panel>

      <Panel title="البلوكات المميزة" desc="مثل «Everything About Anime»: شريط بطاقات من تصنيف واحد">
        <div className="space-y-2">
          {c.featured.map((f, i) => {
            const upd = (patch: Partial<typeof f>) => set("featured", c.featured.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <Row key={f.id}>
                <Toggle label={`إظهار ${f.highlight}`} checked={f.visible} onChange={(v) => upd({ visible: v })} />
                <SmallInput ariaLabel="الرمز" className="w-12 text-center" value={f.emoji} onChange={(v) => upd({ emoji: v })} />
                <SmallInput ariaLabel="العنوان" className="w-36" value={f.title} onChange={(v) => upd({ title: v })} />
                <SmallInput ariaLabel="الكلمة الملونة" className="w-28" value={f.highlight} onChange={(v) => upd({ highlight: v })} />
                <select aria-label="التصنيف" value={f.category} onChange={(e) => upd({ category: e.target.value })} className="rounded-md border border-border bg-background px-2 py-1 text-sm" dir="ltr">
                  {[...new Set([f.category, ...categories].filter(Boolean))].map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <input aria-label="عدد البطاقات" type="number" min={1} max={24} value={f.limit} onChange={(e) => upd({ limit: Math.max(1, Math.min(24, Number(e.target.value) || 1)) })} className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm" />
                <MoveButtons i={i} n={c.featured.length} onMove={(d) => set("featured", moveItem(c.featured, i, d))} />
                <GhostButton ariaLabel="حذف" onClick={() => set("featured", c.featured.filter((_, j) => j !== i))}><Trash2 size={14} /></GhostButton>
              </Row>
            );
          })}
          <GhostButton onClick={() => set("featured", [...c.featured, { id: Math.random().toString(36).slice(2, 8), emoji: "✨", title: "Everything About", highlight: categories[0] ?? "Games", category: categories[0] ?? "Games", limit: 6, visible: true }])}><Plus size={14} /> إضافة بلوك</GhostButton>
        </div>
      </Panel>

      <Panel title="روابط التنقل السريع" desc="أعلى القائمة الجانبية">
        <div className="space-y-1.5">
          {c.quickNav.map((n, i) => (
            <Row key={i}>
              <SmallInput ariaLabel="الرمز" className="w-12 text-center" value={n.emoji} onChange={(v) => set("quickNav", c.quickNav.map((x, j) => (j === i ? { ...x, emoji: v } : x)))} />
              <SmallInput ariaLabel="الاسم" className="w-36" value={n.label} onChange={(v) => set("quickNav", c.quickNav.map((x, j) => (j === i ? { ...x, label: v } : x)))} />
              <SmallInput ariaLabel="الرابط" className="flex-1" value={n.href} onChange={(v) => set("quickNav", c.quickNav.map((x, j) => (j === i ? { ...x, href: v } : x)))} />
              <MoveButtons i={i} n={c.quickNav.length} onMove={(d) => set("quickNav", moveItem(c.quickNav, i, d))} />
              <GhostButton ariaLabel="حذف" onClick={() => set("quickNav", c.quickNav.filter((_, j) => j !== i))}><Trash2 size={14} /></GhostButton>
            </Row>
          ))}
          <GhostButton onClick={() => set("quickNav", [...c.quickNav, { emoji: "🔗", label: "New link", href: "/" }])}><Plus size={14} /> إضافة رابط</GhostButton>
        </div>
      </Panel>

      <Panel title="زر الديسكورد" actions={<Toggle label="إظهار زر الديسكورد" checked={c.discord.visible} onChange={(v) => set("discord", { ...c.discord, visible: v })} />}>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="نص الزر" value={c.discord.label} onChange={(v) => set("discord", { ...c.discord, label: v })} />
          <Field label="رابط السيرفر" type="url" value={c.discord.url} onChange={(v) => set("discord", { ...c.discord, url: v })} />
        </div>
      </Panel>
    </div>
  );
}
