import { useState } from "react";
import { BellRing, Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  APP_VERSION, UPDATE_REPO_URL, fetchRemoteVersion, requestText, sendNudge, updateStatus, type UpdateStatus,
} from "@/lib/app-update";

type Result = { status: UpdateStatus; remote: string | null; text: string };

const LABELS: Record<UpdateStatus, string> = {
  same: "نسختك هي أحدث نسخة، ونسخة GitHub مطابقة لها.",
  "site-older": "يوجد إصدار أحدث على GitHub. أرسل الطلب في المحادثة لتحديث الموقع.",
  "github-older": "نسختك أحدث من GitHub. أرسل الطلب في المحادثة لرفعها إلى GitHub.",
  "no-remote": "لا يوجد رقم إصدار على GitHub بعد. أرسل الطلب في المحادثة لرفع نسختك.",
};

export function UpdateCheck() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  const check = async () => {
    setBusy(true);
    setCopied(false);
    try {
      const remote = await fetchRemoteVersion();
      const status = updateStatus(APP_VERSION, remote);
      setResult({ status, remote, text: requestText(status, APP_VERSION, remote) });
      await sendNudge({ status, local: APP_VERSION, remote });
    } catch {
      toast.error("تعذر الوصول إلى GitHub. تحقق من الاتصال وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
    } catch {
      toast.error("تعذر النسخ، انسخ النص يدويا.");
    }
  };

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-accent-pink" aria-hidden />
          الإصدار <b className="font-mono text-foreground" dir="ltr">{APP_VERSION}</b>
        </span>
        <button
          type="button"
          onClick={check}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <BellRing size={16} />}
          فحص التحديث
        </button>
      </div>
      {result && (
        <div role="status" className="mt-3 rounded-xl border border-border bg-card p-3 text-sm shadow-[var(--card-shadow)]">
          <p className="font-medium">{LABELS[result.status]}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            الموقع <b dir="ltr">{APP_VERSION}</b> · GitHub <b dir="ltr">{result.remote ?? "—"}</b> ·{" "}
            <a href={UPDATE_REPO_URL} target="_blank" rel="noreferrer" className="underline">المستودع</a>
          </p>
          {result.status !== "same" && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1.5 text-xs">{result.text}</code>
              <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-md bg-accent-pink px-3 py-1.5 text-xs font-medium text-card hover:opacity-90">
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "تم النسخ" : "نسخ الطلب"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
