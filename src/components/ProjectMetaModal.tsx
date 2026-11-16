import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThumbnailFramePreview } from "@/components/ThumbnailFramePreview";
import { fetchImageAsBase64 } from "@/lib/image-fetch.functions";
import { parseMetadataJson } from "@/lib/metadata-import";

export type ProjectMetaValues = {
  title: string;
  excerpt: string;
  thumbnail: string;
  categories: string[];
  tags: string[];
};

const inputCls = "w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent-pink";
const labelCls = "block text-xs font-semibold text-muted-foreground mb-1";

const splitEntries = (raw: string) => raw.split(/[\n\r,،]+/).map((s) => s.trim()).filter(Boolean);

export function ProjectMetaModal({
  initial,
  title = "مشروع جديد",
  submitLabel = "إنشاء المشروع",
  onClose,
  onSubmit,
}: {
  initial?: Partial<ProjectMetaValues>;
  title?: string;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (v: ProjectMetaValues) => void;
}) {
  const [titleV, setTitle] = useState(initial?.title ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [thumbnail, setThumbnail] = useState(initial?.thumbnail ?? "");
  const [categories, setCategories] = useState<string[]>(initial?.categories ?? []);
  const [catInput, setCatInput] = useState("");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [framePreview, setFramePreview] = useState(false);
  const [metadataImportOpen, setMetadataImportOpen] = useState(false);
  const [metadataJson, setMetadataJson] = useState("");
  const [metadataError, setMetadataError] = useState("");
  const [metadataBusy, setMetadataBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fetchImage = useServerFn(fetchImageAsBase64);

  const importMetadata = async () => {
    if (metadataBusy) return;
    setMetadataBusy(true);
    setMetadataError("");
    try {
      const imported = parseMetadataJson(metadataJson);
      let nextThumbnail = "";
      if (imported.thumbnailUrl) {
        const result = await fetchImage({ data: { url: imported.thumbnailUrl } });
        if (!result.ok) throw new Error(`تعذر تحميل صورة البطاقة: ${result.error}`);
        nextThumbnail = result.dataUrl;
      }
      setTitle(imported.title);
      setExcerpt(imported.excerpt);
      setThumbnail(nextThumbnail);
      setCategories(imported.categories);
      setTags(imported.tags);
      setMetadataImportOpen(false);
      setMetadataJson("");
    } catch (error) {
      setMetadataError(error instanceof Error ? error.message : "تعذر استيراد بيانات الميتاداتا.");
    } finally {
      setMetadataBusy(false);
    }
  };

  const addFrom = (raw: string, list: string[], setList: (v: string[]) => void, setInput: (v: string) => void) => {
    const parts = splitEntries(raw);
    if (parts.length === 0) return;
    const merged = Array.from(new Set([...list, ...parts]));
    setList(merged);
    setInput("");
  };

  const onFile = (f: File | null) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { setThumbnail(String(r.result || "")); setFramePreview(true); };
    r.readAsDataURL(f);
  };

  const submit = () => {
    onSubmit({
      title: titleV.trim() || "مشروع بدون عنوان",
      excerpt: excerpt.trim(),
      thumbnail,
      categories: Array.from(new Set([...categories, ...splitEntries(catInput)])),
      tags: Array.from(new Set([...tags, ...splitEntries(tagInput)])),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50-sm" onClick={() => { if (!metadataBusy) onClose(); }}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl max-h-[90vh] overflow-auto bg-card border border-border rounded-2xl shadow-xl p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg md:text-xl font-bold">{title}</h2>
          <button disabled={metadataBusy} onClick={onClose} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center disabled:opacity-50">✕</button>
        </div>

        {/* Top: title+description on right, thumbnail on left (RTL) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div className="space-y-3 order-1">
            <div>
              <label className={labelCls}>العنوان</label>
              <input className={inputCls} value={titleV} onChange={(e) => setTitle(e.target.value)} placeholder="اكتب عنوان المقال" />
            </div>
            <div>
              <label className={labelCls}>الوصف (اختياري)</label>
              <textarea
                rows={4}
                className={`${inputCls} resize-none`}
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                placeholder="موجز سريع يظهر في بطاقات المعاينة فقط"
              />
              <div className="flex items-center justify-between gap-2 mt-1 text-[11px]">
                <span className="text-muted-foreground">لا يظهر داخل المقال. إن تُرك فارغاً تُستخدم أول فقرة.</span>
                <span
                  dir="ltr"
                  className={"shrink-0 whitespace-nowrap " + (
                    excerpt.trim().length === 0
                      ? "text-muted-foreground"
                      : excerpt.trim().length >= 100 && excerpt.trim().length <= 150
                        ? "text-green-600"
                        : "text-amber-600"
                  )}
                >
                  {excerpt.trim().length} / 150
                </span>
              </div>
            </div>
          </div>

          <div className="order-2">
            <label className={labelCls}>الصورة المصغرة (2.037:1)</label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative w-full aspect-[2.037/1] rounded-xl border-2 border-dashed border-border hover:border-accent-pink flex items-center justify-center overflow-hidden bg-muted/40 transition-colors"
            >
              {thumbnail ? (
                <img src={thumbnail} alt="thumbnail" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <span className="w-10 h-10 rounded-lg bg-card border border-border flex items-center justify-center text-2xl">+</span>
                  <span className="text-xs">اضغط لإضافة صورة</span>
                </div>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            {thumbnail && (
              <div className="mt-2 flex items-center gap-3 text-xs">
                <button type="button" onClick={() => setFramePreview(true)} className="text-accent-pink hover:opacity-80">معاينة إطار البطاقة</button>
                <button type="button" onClick={() => setThumbnail("")} className="text-muted-foreground hover:text-destructive">إزالة الصورة</button>
              </div>
            )}
            <div className="mt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => { setMetadataImportOpen((open) => !open); setMetadataError(""); }}>
                <ImagePlus size={15} /> استيراد بيانات الميتاداتا من JSON
              </Button>
              {metadataImportOpen && (
                <div className="mt-3 space-y-2 rounded-md border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">سيستبدل العنوان والوصف والتصنيفات والوسوم والصورة. تُنزّل الصورة وتُحفظ داخل المقال بصيغة Base64.</p>
                  <textarea
                    dir="ltr"
                    aria-label="JSON بيانات الميتاداتا"
                    rows={7}
                    value={metadataJson}
                    disabled={metadataBusy}
                    onChange={(event) => { setMetadataJson(event.target.value); setMetadataError(""); }}
                    placeholder={'{\n  "title": "Article title",\n  "description": "Short card description",\n  "thumbnail": "https://example.com/thumbnail.jpg",\n  "categories": ["Guides"],\n  "tags": ["topic", "wiki"]\n}'}
                    className={`${inputCls} resize-y font-mono text-xs`}
                  />
                  {metadataError && <p role="alert" className="text-xs text-destructive">{metadataError}</p>}
                  <div className="flex justify-end">
                    <Button type="button" size="sm" disabled={!metadataJson.trim() || metadataBusy} onClick={() => void importMetadata()}>
                      {metadataBusy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
                      {metadataBusy ? "جارٍ استيراد الصورة…" : "استيراد البيانات"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {framePreview && thumbnail && <ThumbnailFramePreview src={thumbnail} onClose={() => setFramePreview(false)} />}



        {/* Categories */}
        <div className="mb-4">
          <label className={labelCls}>التصنيف (Category)</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {categories.map((c) => (
              <span key={c} className="text-xs px-2 py-1 rounded-full bg-[oklch(0.97_0.03_350)] text-accent-pink flex items-center gap-1">
                {c}
                <button onClick={() => setCategories(categories.filter((x) => x !== c))} className="hover:opacity-70">✕</button>
              </span>
            ))}
          </div>
          <textarea
            rows={2}
            className={`${inputCls} resize-none`}
            value={catInput}
            onChange={(e) => setCatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addFrom(catInput, categories, setCategories, setCatInput); } }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              if (/[\n\r,،]/.test(pasted)) {
                e.preventDefault();
                addFrom(pasted, categories, setCategories, setCatInput);
              }
            }}
            onBlur={() => addFrom(catInput, categories, setCategories, setCatInput)}
            placeholder="ألصق قائمة أو أضف تصنيفاً ثم Enter"
          />
        </div>

        {/* Tags */}
        <div className="mb-2">
          <label className={labelCls}>الوسوم (Tags)</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map((t) => (
              <span key={t} className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground flex items-center gap-1">
                #{t}
                <button onClick={() => setTags(tags.filter((x) => x !== t))} className="hover:opacity-70">✕</button>
              </span>
            ))}
          </div>
          <textarea
            rows={2}
            className={`${inputCls} resize-none`}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addFrom(tagInput, tags, setTags, setTagInput); } }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              if (/[\n\r,،]/.test(pasted)) {
                e.preventDefault();
                addFrom(pasted, tags, setTags, setTagInput);
              }
            }}
            onBlur={() => addFrom(tagInput, tags, setTags, setTagInput)}
            placeholder="ألصق قائمة أو أضف وسماً ثم Enter"
          />
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button disabled={metadataBusy} onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50">إلغاء</button>
          <button disabled={metadataBusy} onClick={submit} className="text-sm px-5 py-2 rounded-lg bg-accent-pink text-white hover:opacity-90 disabled:opacity-50">{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}
