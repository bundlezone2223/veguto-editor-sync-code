import { useEffect, useState } from "react";
import { ArrowRight, Check, Copy, Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VersionPicker } from "@/components/VersionPicker";
import { latestVersion, newVersionError, nextPatchVersion, pullRequestText } from "@/lib/app-update";

type Step = "choose" | "push" | "pull";

/** Update window shown when the site and GitHub have the same version: send the site to GitHub, or bring GitHub to the site. */
export function UpdateDialog({ open, onOpenChange, local, remote, filesDifferent, onPush }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  local: string;
  remote: string | null;
  filesDifferent: number;
  onPush: (version: string) => Promise<boolean>;
}) {
  /** The counter starts from the newest number on either side and never goes below it. */
  const base = latestVersion(local, remote);
  const [step, setStep] = useState<Step>("choose");
  const [digits, setDigits] = useState<number[]>(() => nextPatchVersion(base).split(".").map(Number));
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep("choose");
    setDigits(nextPatchVersion(base).split(".").map(Number));
    setCopied(false);
  }, [open, base]);

  const version = digits.join(".");
  const error = newVersionError(version, base);
  const pullText = pullRequestText(local, remote);

  const confirm = async () => {
    if (error) return;
    setBusy(true);
    try {
      if (await onPush(version)) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pullText);
      setCopied(true);
    } catch {
      toast.error("تعذر النسخ، انسخ النص يدويا.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent dir="rtl" className="max-w-md rounded-2xl text-right [&>button:last-child]:left-4 [&>button:last-child]:right-auto">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>{step === "push" ? "رقم الإصدار الجديد" : step === "pull" ? "جلب تحديث GitHub" : "تحديث"}</DialogTitle>
          <DialogDescription>
            {step === "push"
              ? "اختر رقم الإصدار الذي سيُرسل به الموقع إلى GitHub."
              : step === "pull"
                ? "انسخ الطلب وأرسله في المحادثة لجلب ملفات GitHub إلى الموقع."
                : <>الموقع و GitHub على الإصدار <b dir="ltr">{base}</b>{filesDifferent > 0 ? ` · ${filesDifferent} ملف مختلف` : " · الملفات متطابقة"}.</>}
          </DialogDescription>
        </DialogHeader>

        {step === "choose" && (
          <div className="grid gap-3">
            <button type="button" onClick={() => setStep("push")} className="update-option">
              <span className="update-option-icon"><Upload size={20} /></span>
              <span className="min-w-0 flex-1">
                <b className="block">إرسال تحديث الموقع إلى GitHub</b>
                <span className="text-xs text-muted-foreground">ترفع ملفات الموقع برقم إصدار جديد تختاره.</span>
              </span>
            </button>
            <button type="button" onClick={() => setStep("pull")} className="update-option">
              <span className="update-option-icon"><Download size={20} /></span>
              <span className="min-w-0 flex-1">
                <b className="block">جلب تحديث GitHub إلى الموقع</b>
                <span className="text-xs text-muted-foreground">تأخذ ملفات GitHub مكان ملفات الموقع.</span>
              </span>
            </button>
          </div>
        )}

        {step === "push" && (
          <div className="grid gap-4">
            <VersionPicker value={digits} onChange={setDigits} min={base} />
            <p className="text-center text-xs text-muted-foreground">
              الحالي <b dir="ltr" className="font-mono">{base}</b> ← الجديد <b dir="ltr" className="font-mono text-accent-pink">{version}</b>
            </p>
            {error && <p className="text-center text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep("choose")} disabled={busy} className="update-btn-ghost">
                <ArrowRight size={16} /> رجوع
              </button>
              <button type="button" onClick={confirm} disabled={busy || !!error} className="update-btn-primary flex-1">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {busy ? "جارٍ الإرسال…" : "تأكيد"}
              </button>
            </div>
          </div>
        )}

        {step === "pull" && (
          <div className="grid gap-3">
            <code className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed">{pullText}</code>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep("choose")} className="update-btn-ghost">
                <ArrowRight size={16} /> رجوع
              </button>
              <button type="button" onClick={copy} className="update-btn-primary flex-1">
                {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "تم النسخ" : "نسخ الطلب"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
