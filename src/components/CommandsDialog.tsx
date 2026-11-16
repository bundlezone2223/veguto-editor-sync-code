import { useState } from "react";
import { Loader2, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchImageAsBase64 } from "@/lib/image-fetch.functions";
import { applyCommands, imageUrls, parseCommands, type Article, type Op } from "@/lib/article-commands";

export function CommandsDialog({ open, onClose, article, onApply }: {
  open: boolean; onClose: () => void; article: Article;
  onApply: (next: Article) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [ops, setOps] = useState<Op[] | null>(null);
  const [summary, setSummary] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  const reset = () => { setOps(null); setSummary([]); setError(""); };

  const check = () => {
    try {
      const parsed = parseCommands(text);
      setSummary(applyCommands(article, parsed).summary);
      setOps(parsed); setError("");
    } catch (e) { reset(); setError(e instanceof Error ? e.message : "أمر غير صالح."); }
  };

  const run = async () => {
    if (!ops || busy) return;
    setBusy(true); setError("");
    try {
      const urls = imageUrls(ops); const images: Record<string, string> = {};
      for (const [i, url] of urls.entries()) {
        setProgress(`تحميل الصور ${i + 1}/${urls.length}`);
        const r = await fetchImageAsBase64({ data: { url } });
        if (!r.ok) throw new Error(`فشل تحميل الصورة ${url}: ${r.error}`);
        images[url] = r.dataUrl;
      }
      await onApply(applyCommands(article, ops, images).article);
      setText(""); reset(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "فشل التنفيذ."); }
    finally { setBusy(false); setProgress(""); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>أوامر</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">الصق نص الأوامر الذي أعطيتك إياه في المحادثة. لن يتغير شيء إذا كان أي أمر غير صالح.</p>
        <textarea dir="ltr" value={text} onChange={(e) => { setText(e.target.value); reset(); }} placeholder={'{ "version": 1, "ops": [ ... ] }\n\nلاستبدال النص مع إبقاء الصور:\n{ "version": 1, "ops": [ { "op": "replace_text_preserve_images" } ] }\n===ARTICLE===\nالصق المقال هنا…'}
          className="h-64 w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground outline-none focus:border-accent-pink" />
        {error && <p role="alert" className="text-sm text-destructive break-words">{error}</p>}
        {ops && (
          <div className="rounded-lg border border-border p-3 text-xs">
            <p className="mb-1 font-bold">{summary.length} تغييرات:</p>
            <ul className="list-disc ps-4 space-y-0.5" dir="auto">{summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={!text.trim() || busy} onClick={check} className="bg-muted text-foreground hover:bg-border">فحص</Button>
          <Button variant="ghost" disabled={!ops || busy} onClick={() => void run()} className="bg-accent-pink text-primary-foreground hover:bg-accent-pink/90">
            {busy ? <Loader2 className="animate-spin" /> : <Terminal />} {busy ? progress || "جارٍ التنفيذ…" : "تنفيذ"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
