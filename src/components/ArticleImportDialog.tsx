import { useRef, useState } from "react";
import { ClipboardPaste, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseArticleTs } from "@/lib/article-import";

export function ArticleImportDialog({ open, onClose, onImport }: {
  open: boolean; onClose: () => void;
  onImport: (article: Awaited<ReturnType<typeof parseArticleTs>>) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const apply = async (source: string) => {
    if (!source.trim() || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError("");
    try { onImport(await parseArticleTs(source)); setCode(""); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : "تعذر قراءة المقال."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value && !busy) { setError(""); onClose(); } }}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto bg-card text-foreground" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>وضع كود TS</DialogTitle></DialogHeader>
        <textarea dir="ltr" aria-label="كود المقال TS" value={code} disabled={busy}
          onChange={(event) => { setCode(event.target.value); setError(""); }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text");
            const element = event.currentTarget;
            const next = code.slice(0, element.selectionStart) + pasted + code.slice(element.selectionEnd);
            event.preventDefault(); setCode(next); void apply(next);
          }}
          placeholder={'export const article = {\n  title: "",\n  content: []\n};'}
          className="h-72 w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground outline-none focus:border-accent-pink"
        />
        {error && <p role="alert" className="text-sm text-foreground">{error}</p>}
        <Button variant="ghost" disabled={busy || !code.trim()} onClick={() => void apply(code)} className="justify-self-end bg-accent-pink text-foreground hover:bg-accent-pink/90">
          {busy ? <Loader2 className="animate-spin" /> : <ClipboardPaste />} {busy ? "جارٍ إدخال المقال…" : "إظهار المقال"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}