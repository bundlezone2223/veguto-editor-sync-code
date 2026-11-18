import { useState } from "react";
import { BellRing, Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  APP_VERSION, UPDATE_REPO_URL, diffCount, fetchRemoteVersion, requestText, sendNudge, updateStatus,
  type FileDiff, type UpdateStatus,
} from "@/lib/app-update";
import { syncEditorCode } from "@/lib/source-sync.functions";

type Result = {
  kind: "same" | "pushed" | "pull-prompt" | "version-only";
  status: UpdateStatus;
  local: string;
  remote: string | null;
  text: string;
  diff?: FileDiff | undefined;
  url?: string | undefined;
};

const VERSION_ONLY: Record<UpdateStatus, string> = {
  same: "رقم الإصدار مطابق لـ GitHub. (مقارنة الملفات تعمل فقط في معاينة التحرير.)",
  "site-older": "يوجد إصدار أحدث على GitHub. أرسل الطلب في المحادثة لتحديث الموقع.",
  "github-older": "نسختك أحدث من GitHub. أرسل الطلب في المحادثة لرفعها إلى GitHub.",
  "no-remote": "لا يوجد رقم إصدار على GitHub بعد. أرسل الطلب في المحادثة لرفع نسختك.",
};

function message(r: Result) {
  if (r.kind === "same") return "نسختك مطابقة لـ GitHub: نفس رقم الإصدار ونفس الملفات.";
  if (r.kind === "pushed") return `وُجد اختلاف في ${diffCount(r.diff!)} ملف، فحُدّثت ملفات GitHub بملفات الموقع. النسخة السابقة محفوظة في السجل.`;
  if (r.kind === "pull-prompt") return "يوجد إصدار أحدث على GitHub. انسخ الطلب وأرسله في المحادثة لتحديث الموقع.";
  return VERSION_ONLY[r.status];
}

export function UpdateCheck() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  const check = async () => {
    setBusy(true);
    setCopied(false);
    try {
      const res = await syncEditorCode({ data: { push: true } });
      let r: Result;
      if (res.available) {
        r = {
          kind: res.action === "same" ? "same" : res.action === "pull-prompt" ? "pull-prompt" : "pushed",
          status: res.status, local: res.local, remote: res.remote, diff: res.diff, url: res.pushed?.url,
          text: requestText(res.status, res.local, res.remote),
        };
      } else {
        const remote = await fetchRemoteVersion();
        const status = updateStatus(APP_VERSION, remote);
        r = { kind: "version-only", status, local: APP_VERSION, remote, text: requestText(status, APP_VERSION, remote) };
      }
      setResult(r);
      await sendNudge({ status: r.status, local: r.local, remote: r.remote });
    } catch (e) {
      toast.error(`تعذر الفحص أو الرفع إلى GitHub: ${e instanceof Error ? e.message : String(e)}`);
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

  const showPrompt = result && (result.kind === "pull-prompt" || (result.kind === "version-only" && result.status !== "same"));
  const files = result?.diff ? [
    ...result.diff.added.map((f) => ["+", f] as const),
    ...result.diff.changed.map((f) => ["~", f] as const),
    ...result.diff.removed.map((f) => ["−", f] as const),
  ] : [];

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
          {busy ? "جارٍ مقارنة الملفات…" : "فحص التحديث"}
        </button>
      </div>
      {result && (
        <div role="status" className="mt-3 rounded-xl border border-border bg-card p-3 text-sm shadow-[var(--card-shadow)]">
          <p className="font-medium">{message(result)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            الموقع <b dir="ltr">{result.local}</b> · GitHub <b dir="ltr">{result.remote ?? "—"}</b> ·{" "}
            <a href={UPDATE_REPO_URL} target="_blank" rel="noreferrer" className="underline">المستودع</a>
            {result.url && <> · <a href={result.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">التحديث على GitHub <ExternalLink size={12} /></a></>}
          </p>
          {result.kind === "pushed" && files.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">الملفات المختلفة ({files.length})</summary>
              <ul dir="ltr" className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px]">
                {files.map(([s, f]) => <li key={f}><span className="text-accent-pink">{s}</span> {f}</li>)}
              </ul>
            </details>
          )}
          {showPrompt && (
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
