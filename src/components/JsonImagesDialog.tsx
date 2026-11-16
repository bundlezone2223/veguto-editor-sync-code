import { useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Section } from "@/lib/article-content";
import { fetchImageAsBase64 } from "@/lib/image-fetch.functions";
import { insertImages, parseImagesJson, type JsonImageSpec, type PlacementResult } from "@/lib/json-images";

type ItemState = { spec: JsonImageSpec; status: "pending" | "ok" | "failed"; note: string };

export function JsonImagesDialog({ open, onClose, sections, onApply }: {
  open: boolean; onClose: () => void; sections: Section[];
  onApply: (next: Section[]) => void | Promise<void>;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [items, setItems] = useState<ItemState[]>([]);
  const [results, setResults] = useState<PlacementResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  const parse = () => {
    try {
      const specs = parseImagesJson(text);
      setItems(specs.map((spec) => ({ spec, status: "pending", note: "" })));
      setResults(null); setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "JSON غير صالح.");
    }
  };

  const apply = async () => {
    if (busy || items.length === 0) return;
    setBusy(true); setError("");
    const loaded: ItemState[] = [];
    try {
      for (const item of items) {
        const res = await fetchImageAsBase64({ data: { url: item.spec.url } });
        if (res.ok) loaded.push({ ...item, spec: { ...item.spec, src: res.dataUrl }, status: "ok", note: "" });
        else loaded.push({ ...item, status: "failed", note: res.error });
        setItems([...loaded, ...items.slice(loaded.length).map((x) => ({ ...x, status: "pending" as const, note: "" }))]);
      }
    } catch {
      setError("انقطع الاتصال أثناء تحميل الصور. حاول مرة أخرى.");
      setBusy(false);
      return;
    }
    const okSpecs = loaded.filter((x) => x.status === "ok").map((x) => x.spec);
    if (okSpecs.length === 0) {
      setError("تعذر تحميل أي صورة من الروابط المرسلة.");
      setBusy(false);
      return;
    }
    try {
      const { sections: next, results: placement } = insertImages(sections, okSpecs);
      await onApply(next);
      setResults(placement);
    } catch (e) {
      console.error("Applying images failed", e);
      setError(e instanceof Error && e.message ? `تعذر إدراج الصور في المقال: ${e.message}` : "تعذر إدراج الصور في المقال. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  const okCount = items.filter((x) => x.status === "ok").length;
  const failedCount = items.filter((x) => x.status === "failed").length;

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value && !busy) { setError(""); onClose(); } }}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto bg-card text-foreground" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>إدراج صور من JSON</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          الصق JSON بصيغة <code dir="ltr" className="px-1 rounded bg-muted">{"{ \"images\": [...] }"}</code> — يُحمَّل كل رابط ويُحوَّل إلى Base64 ليبقى داخل المقال دائماً، ثم يُدرج عند الجملة المرجعية (anchor_text) أو عنوان القسم (section_heading).
        </p>
        {!results && (
          <>
            <textarea dir="ltr" aria-label="JSON الصور" value={text} disabled={busy}
              onChange={(event) => { setText(event.target.value); setError(""); }}
              placeholder={'{\n  "images": [\n    {\n      "url": "https://example.com/image.jpg",\n      "source_url": "https://example.com/page",\n      "alt": "وصف الصورة",\n      "caption": "تعليق أسفل الصورة",\n      "section_heading": "عنوان القسم",\n      "anchor_text": "جملة موجودة في المقال",\n      "position": "after"\n    }\n  ]\n}'}
              className="h-64 w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground outline-none focus:border-accent-pink"
            />
            {error && <p role="alert" className="text-sm text-foreground">{error}</p>}
            {items.length > 0 && (
              <ul className="space-y-1 text-xs" dir="auto">
                {items.map((item, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
                    <span>{item.status === "ok" ? "✅" : item.status === "failed" ? "❌" : "⏳"}</span>
                    <span className="min-w-0 flex-1 truncate" dir="auto">{item.spec.alt || item.spec.url}</span>
                    {item.note && <span className="text-muted-foreground">{item.note}</span>}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={!text.trim() || busy} onClick={parse} className="bg-muted text-foreground hover:bg-border">
                <ImagePlus /> قراءة JSON
              </Button>
              <Button variant="ghost" disabled={busy || items.length === 0} onClick={() => void apply()} className="bg-accent-pink text-foreground hover:bg-accent-pink/90">
                {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />} {busy ? "جارٍ التحميل والإدراج…" : "تحميل الصور وإدراجها"}
              </Button>
            </div>
          </>
        )}
        {results && (
          <div className="space-y-3">
            <p className="text-sm">{okCount} صورة أُدرجت في المقال{failedCount ? ` · ${failedCount} فشل تحميلها` : ""}.</p>
            <ul className="space-y-1 text-xs" dir="auto">
              {results.map((r, i) => (
                <li key={i} className="rounded-lg border border-border px-3 py-1.5">
                  <span className="font-medium" dir="auto">{r.alt}</span> — <span className="text-muted-foreground">{r.note}</span>
                </li>
              ))}
            </ul>
            {failedCount > 0 && <p className="text-xs text-muted-foreground">الصور التي فشل تحميلها لم تُدرج كي لا تختفي لاحقاً.</p>}
            <Button variant="ghost" onClick={() => { setItems([]); setResults(null); setText(""); onClose(); }} className="justify-self-end bg-accent-pink text-foreground hover:bg-accent-pink/90">
              تم
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
