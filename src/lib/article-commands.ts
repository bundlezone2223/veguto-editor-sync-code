import type { Section } from "@/lib/article-content";
import type { Meta } from "@/lib/projects-store";
import { parseArticleText } from "@/lib/text-import";

/** Command format pasted into the editor's Commands window (data only, never executed):
 *  { "version": 1, "ops": [ { "op": "...", ... } ] }
 *  A long plain-text article may follow the JSON after a line `===ARTICLE===`;
 *  `replace_text_preserve_images` without "text" uses that block. */
export const ARTICLE_MARKER = "===ARTICLE===";
export type Target = "start" | "end" | { heading?: string | undefined; anchor_text?: string | undefined; index?: number | undefined };
export type Op =
  | { op: "set_meta"; title?: string | undefined; slug?: string | undefined; excerpt?: string | undefined; categories?: string[] | undefined; tags?: string[] | undefined; hero?: string | undefined }
  | { op: "replace_article"; sections: Section[] }
  | { op: "insert"; target: Target; position?: "before" | "after" | undefined; sections: Section[] }
  | { op: "replace"; target: Target; sections: Section[] }
  | { op: "delete"; target: Target; count?: number | undefined }
  | { op: "move"; target: Target; to: Target; position?: "before" | "after" | undefined }
  | { op: "find_replace"; find: string; replace: string; all?: boolean }
  | { op: "bold_terms"; terms: string[] }
  | { op: "add_image"; target: Target; position?: "before" | "after" | undefined; url: string; alt?: string | undefined; caption?: string | undefined }
  | { op: "update_image"; target: Target; url?: string | undefined; alt?: string | undefined; caption?: string | undefined }
  | { op: "remove_image"; target: Target }
  | { op: "replace_text_preserve_images"; text: string };

export type Article = { meta: Meta; sections: Section[] };

export class CommandError extends Error {}

type Keys = "type" | "text" | "cite" | "items" | "ordered" | "title" | "src" | "alt" | "caption" | "heading" | "anchor_text" | "index" | "ops" | "op" | "sections" | "target" | "to" | "position" | "count" | "find" | "replace" | "all" | "terms" | "url" | "categories" | "tags";
type Loose = Record<string, unknown> & Partial<Record<Keys, unknown>>;
const isObj = (v: unknown): v is Loose => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => typeof v === "string";
const strArr = (v: unknown) => Array.isArray(v) && v.every(str);

function checkSection(s: unknown, where: string): Section {
  if (!isObj(s)) throw new CommandError(`${where}: القسم يجب أن يكون كائناً.`);
  const t = s.type;
  const need = (k: string) => { if (!str(s[k])) throw new CommandError(`${where}: الحقل "${k}" مطلوب كنص في قسم ${String(t)}.`); };
  switch (t) {
    case "h2": case "h3": case "p": case "emphasis": need("text"); return { type: t, text: s.text as string };
    case "quote": need("text"); return { type: "quote", text: s.text as string, ...(str(s.cite) ? { cite: s.cite as string } : {}) };
    case "list": if (!strArr(s.items)) throw new CommandError(`${where}: "items" يجب أن تكون قائمة نصوص.`);
      return { type: "list", items: s.items as string[], ...(s.ordered === true ? { ordered: true } : {}) };
    case "callout": need("title"); need("text"); return { type: "callout", title: s.title as string, text: s.text as string };
    case "image": need("src"); return { type: "image", src: s.src as string, alt: str(s.alt) ? (s.alt as string) : "", ...(str(s.caption) ? { caption: s.caption as string } : {}) };
    default: throw new CommandError(`${where}: نوع القسم "${String(t)}" غير معروف.`);
  }
}

function checkTarget(t: unknown, where: string): Target {
  if (t === "start" || t === "end") return t;
  if (isObj(t) && (str(t.heading) || str(t.anchor_text) || Number.isInteger(t.index))) {
    return { heading: str(t.heading) ? (t.heading as string) : undefined, anchor_text: str(t.anchor_text) ? (t.anchor_text as string) : undefined, index: Number.isInteger(t.index) ? (t.index as number) : undefined };
  }
  throw new CommandError(`${where}: "target" يجب أن يكون "start" أو "end" أو { heading | anchor_text | index }.`);
}

const pos = (v: unknown) => (v === "before" ? "before" : "after") as "before" | "after";
const secs = (v: unknown, w: string) => { if (!Array.isArray(v)) throw new CommandError(`${w}: "sections" يجب أن تكون قائمة.`); return v.map((s, i) => checkSection(s, `${w} قسم ${i + 1}`)); };

/** Parses and validates the whole command text; throws CommandError naming the bad op. */
export function parseCommands(source: string): Op[] {
  let data: unknown;
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const cut = lines.findIndex((l) => l.trim() === ARTICLE_MARKER);
  const json = cut < 0 ? source : lines.slice(0, cut).join("\n");
  const attached = cut < 0 ? undefined : lines.slice(cut + 1).join("\n");
  try { data = JSON.parse(json); } catch { throw new CommandError("النص ليس JSON صالحاً."); }
  const raw = Array.isArray(data) ? data : isObj(data) ? data.ops : undefined;
  if (!Array.isArray(raw) || raw.length === 0) throw new CommandError('المطلوب كائن فيه قائمة "ops" غير فارغة.');
  return raw.map((o, i): Op => {
    const w = `الأمر ${i + 1}`;
    if (!isObj(o)) throw new CommandError(`${w}: يجب أن يكون كائناً.`);
    const optStr = (k: string) => { if (o[k] !== undefined && !str(o[k])) throw new CommandError(`${w}: "${k}" يجب أن يكون نصاً.`); return o[k] as string | undefined; };
    switch (o.op) {
      case "set_meta": {
        for (const k of ["categories", "tags"]) if (o[k] !== undefined && !strArr(o[k])) throw new CommandError(`${w}: "${k}" قائمة نصوص.`);
        return { op: "set_meta", title: optStr("title"), slug: optStr("slug"), excerpt: optStr("excerpt"), hero: optStr("hero"), categories: o.categories as string[] | undefined, tags: o.tags as string[] | undefined };
      }
      case "replace_article": return { op: "replace_article", sections: secs(o.sections, w) };
      case "insert": return { op: "insert", target: checkTarget(o.target, w), position: pos(o.position), sections: secs(o.sections, w) };
      case "replace": return { op: "replace", target: checkTarget(o.target, w), sections: secs(o.sections, w) };
      case "delete": return { op: "delete", target: checkTarget(o.target, w), count: Number.isInteger(o.count) && (o.count as number) > 0 ? (o.count as number) : 1 };
      case "move": return { op: "move", target: checkTarget(o.target, w), to: checkTarget(o.to, w), position: pos(o.position) };
      case "find_replace":
        if (!str(o.find) || !(o.find as string) || !str(o.replace)) throw new CommandError(`${w}: "find" و"replace" مطلوبان.`);
        return { op: "find_replace", find: o.find as string, replace: o.replace as string, all: o.all !== false };
      case "bold_terms": if (!strArr(o.terms)) throw new CommandError(`${w}: "terms" قائمة نصوص.`); return { op: "bold_terms", terms: (o.terms as string[]).filter((t) => t.trim()) };
      case "add_image": if (!str(o.url) || !(o.url as string)) throw new CommandError(`${w}: "url" مطلوب.`);
        return { op: "add_image", target: checkTarget(o.target, w), position: pos(o.position), url: o.url as string, alt: optStr("alt"), caption: optStr("caption") };
      case "update_image": return { op: "update_image", target: checkTarget(o.target, w), url: optStr("url"), alt: optStr("alt"), caption: optStr("caption") };
      case "remove_image": return { op: "remove_image", target: checkTarget(o.target, w) };
      case "replace_text_preserve_images": {
        const text = optStr("text") ?? attached;
        if (!text?.trim()) throw new CommandError(`${w}: ضع نص المقال في "text" أو بعد سطر ${ARTICLE_MARKER}.`);
        return { op: "replace_text_preserve_images", text };
      }
      default: throw new CommandError(`${w}: نوع الأمر "${String(o.op)}" غير معروف.`);
    }
  });
}

/** Remote image URLs the ops need downloaded before applying. */
export const imageUrls = (ops: Op[]) => [...new Set(ops.flatMap((o) => (o.op === "add_image" || o.op === "update_image") && o.url && !o.url.startsWith("data:") ? [o.url] : []))];

const norm = (s: string) => s.toLowerCase().replace(/[*]/g, "").replace(/\s+/g, " ").trim();
const textOf = (s: Section) => s.type === "list" ? s.items.join(" ") : s.type === "image" ? `${s.alt} ${s.caption ?? ""}` : s.type === "callout" ? `${s.title} ${s.text}` : s.text;

function resolve(sections: Section[], t: Target, w: string, imageOnly = false): number {
  if (t === "start") return 0;
  if (t === "end") return sections.length;
  let i = -1;
  if (t.index !== undefined) i = t.index >= 0 && t.index < sections.length ? t.index : -1;
  else if (t.heading) { const h = norm(t.heading); i = sections.findIndex((s) => (s.type === "h2" || s.type === "h3") && norm(s.text) === h); if (i < 0) i = sections.findIndex((s) => (s.type === "h2" || s.type === "h3") && norm(s.text).includes(h)); }
  else if (t.anchor_text) { const a = norm(t.anchor_text); i = sections.findIndex((s) => (!imageOnly || s.type === "image") && norm(textOf(s)).includes(a)); }
  if (i < 0) throw new CommandError(`${w}: لم أجد الموضع المطلوب (${JSON.stringify(t)}).`);
  if (imageOnly && sections[i]?.type !== "image") throw new CommandError(`${w}: الموضع المحدد ليس صورة.`);
  return i;
}
const at = (sections: Section[], t: Target, p: "before" | "after", w: string) => {
  const i = resolve(sections, t, w); return t === "start" || t === "end" ? i : p === "after" ? i + 1 : i;
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function mapText(s: Section, f: (t: string) => string): Section {
  switch (s.type) {
    case "list": return { ...s, items: s.items.map(f) };
    case "image": return { ...s, alt: f(s.alt), ...(s.caption ? { caption: f(s.caption) } : {}) };
    case "callout": return { ...s, title: f(s.title), text: f(s.text) };
    default: return { ...s, text: f(s.text) };
  }
}
/** Wraps each term in **…** where it is not already inside bold markers. */
export function boldTerm(text: string, term: string): string {
  const re = new RegExp(`(\\*{1,2}[^*\\n]+\\*{1,2})|(${esc(term)})`, "gi");
  return text.replace(re, (m, bold) => (bold ? m : `**${m}**`));
}

/** Swaps every text section for the new article text while keeping each image after the same
 *  paragraph count (scaled proportionally when the new text has a different number of blocks). */
export function replaceTextKeepImages(sections: Section[], text: string): { sections: Section[]; title?: string | undefined; oldCount: number; newCount: number; images: number } {
  let body = text.replace(/\r\n?/g, "\n").replace(/^\s+/, "");
  let title: string | undefined;
  const m = /^#\s+(.+)\n?/.exec(body);
  if (m) { title = (m[1] ?? "").trim(); body = body.slice(m[0].length); }
  const fresh = parseArticleText(body);
  if (!fresh.length) throw new CommandError("نص المقال فارغ.");
  const oldCount = sections.filter((x) => x.type !== "image").length;
  const slots: Section[][] = Array.from({ length: fresh.length + 1 }, () => []);
  let seen = 0;
  for (const x of sections) {
    if (x.type !== "image") { seen++; continue; }
    const k = oldCount === fresh.length || !oldCount ? seen : Math.round((seen * fresh.length) / oldCount);
    slots[Math.min(k, fresh.length)]!.push(x);
  }
  const out: Section[] = [...slots[0]!];
  fresh.forEach((x, i) => out.push(x, ...slots[i + 1]!));
  return { sections: out, title, oldCount, newCount: fresh.length, images: sections.length - oldCount };
}

export type ApplyResult = { article: Article; summary: string[] };

/** Applies all ops to a copy; any failure throws so nothing is changed. */
export function applyCommands(article: Article, ops: Op[], images: Record<string, string> = {}): ApplyResult {
  let meta = { ...article.meta };
  let s = [...article.sections];
  const summary: string[] = [];
  const img = (u: string) => images[u] ?? u;
  ops.forEach((o, n) => {
    const w = `الأمر ${n + 1}`;
    switch (o.op) {
      case "set_meta": {
        const { op: _op, ...rest } = o;
        const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
        meta = { ...meta, ...patch }; summary.push(`تحديث بيانات المقال: ${Object.keys(patch).join("، ")}`); break;
      }
      case "replace_article": s = [...o.sections]; summary.push(`استبدال المقال كاملاً (${o.sections.length} قسماً)`); break;
      case "insert": { const i = at(s, o.target, o.position ?? "after", w); s.splice(i, 0, ...o.sections); summary.push(`إضافة ${o.sections.length} قسم`); break; }
      case "replace": { const i = resolve(s, o.target, w); if (i >= s.length) throw new CommandError(`${w}: لا يوجد قسم لاستبداله.`); s.splice(i, 1, ...o.sections); summary.push(`استبدال قسم بـ ${o.sections.length}`); break; }
      case "delete": { const i = resolve(s, o.target, w); if (i >= s.length) throw new CommandError(`${w}: لا يوجد قسم لحذفه.`); const c = Math.min(o.count ?? 1, s.length - i); s.splice(i, c); summary.push(`حذف ${c} قسم`); break; }
      case "move": {
        const i = resolve(s, o.target, w); if (i >= s.length) throw new CommandError(`${w}: لا يوجد قسم لنقله.`);
        const [item] = s.splice(i, 1); const j = at(s, o.to, o.position ?? "after", w); s.splice(j, 0, item!); summary.push("نقل قسم"); break;
      }
      case "find_replace": {
        let count = 0; const re = new RegExp(esc(o.find), o.all === false ? "" : "g");
        let doneOne = false;
        s = s.map((x) => doneOne ? x : mapText(x, (t) => t.replace(re, () => { if (doneOne) return o.find; count++; if (o.all === false) doneOne = true; return o.replace; })));
        if (!count) throw new CommandError(`${w}: لم أجد "${o.find}".`);
        summary.push(`استبدال "${o.find}" (${count} مرة)`); break;
      }
      case "bold_terms": s = s.map((x) => x.type === "image" ? x : mapText(x, (t) => o.terms.reduce(boldTerm, t))); summary.push(`تمييز ${o.terms.length} كلمة بالعريض`); break;
      case "add_image": { const i = at(s, o.target, o.position ?? "after", w); s.splice(i, 0, { type: "image", src: img(o.url), alt: o.alt ?? "", ...(o.caption ? { caption: o.caption } : {}) }); summary.push("إضافة صورة"); break; }
      case "update_image": {
        const i = resolve(s, o.target, w, true); const cur = s[i] as Extract<Section, { type: "image" }>;
        s[i] = { ...cur, ...(o.url ? { src: img(o.url) } : {}), ...(o.alt !== undefined ? { alt: o.alt } : {}), ...(o.caption !== undefined ? { caption: o.caption } : {}) }; summary.push("تعديل صورة"); break;
      }
      case "remove_image": { const i = resolve(s, o.target, w, true); s.splice(i, 1); summary.push("حذف صورة"); break; }
      case "replace_text_preserve_images": {
        const r = replaceTextKeepImages(s, o.text);
        s = r.sections;
        if (r.title) meta = { ...meta, title: r.title };
        summary.push(`استبدال النص (${r.oldCount} ← ${r.newCount} فقرة/عنوان) مع إبقاء ${r.images} صورة في أماكنها${r.oldCount !== r.newCount ? " (عدد الفقرات مختلف: وُزّعت الصور بالتناسب)" : ""}${r.title ? " وتحديث العنوان" : ""}`);
        break;
      }
    }
  });
  return { article: { meta, sections: s }, summary };
}
