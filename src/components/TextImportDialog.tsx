import { useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Section } from "@/lib/article-content";
import { parseArticleText } from "@/lib/text-import";

export function TextImportDialog({ open, onClose, onImport }: {
  open: boolean; onClose: () => void; onImport: (sections: Section[]) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const apply = () => {
    const sections = parseArticleText(text);
    if (!sections.length) { setError("لم أجد أي محتوى لتحويله."); return; }
    onImport(sections); setText(""); setError(""); onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) { setError(""); onClose(); } }}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto bg-card text-foreground" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>تحويل نص منسق إلى مقال</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">## عنوان رئيسي · ### عنوان فرعي · **نقطة مهمة** · • قائمة · 1. قائمة مرقمة · &gt; اقتباس ثم — المصدر · سطر فارغ بين الفقرات</p>
        <textarea dir="auto" aria-label="نص المقال المنسق" value={text}
          onChange={(event) => { setText(event.target.value); setError(""); }}
          placeholder={"## العنوان\n\nفقرة تحتوي **كلمة مهمة** و *كلمة سميكة*...\n\n• عنصر\n• عنصر"}
          className="h-72 w-full resize-y rounded-md border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-accent-pink"
        />
        {error && <p role="alert" className="text-sm text-foreground">{error}</p>}
        <Button variant="ghost" disabled={!text.trim()} onClick={apply} className="justify-self-end bg-accent-pink text-foreground hover:bg-accent-pink/90">
          <FileText /> تحويل إلى المقال
        </Button>
      </DialogContent>
    </Dialog>
  );
}
