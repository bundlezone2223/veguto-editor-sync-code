import { useState } from "react";
import { BellRing, Check, Copy, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  APP_VERSION, UPDATE_REPO_URL, diffCount, fetchRemoteVersion, requestText, sendNudge, updateStatus,
  type FileDiff, type UpdateStatus,
} from "@/lib/app-update";
import { syncEditorCode } from "@/lib/source-sync.functions";
import { UpdateDialog } from "@/components/UpdateDialog";

type Result = {
  kind: "same" | "same-version" | "pushed" | "pull-prompt" | "version-only";
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
  if (r.kind === "same-version") return `رقم الإصدار مطابق لـ GitHub، لكن يوجد ${diffCount(r.diff!)} ملف مختلف. اضغط «تحديث» لاختيار الاتجاه.`;
  if (r.kind === "pushed") return `أُرسل ${diffCount(r.diff!)} ملف إلى GitHub بالإصدار ${r.local}. النسخة السابقة محفوظة في السجل.`;
  if (r.kind === "pull-prompt") return "يوجد إصدار أحدث على GitHub. انسخ الطلب وأرسله في المحادثة لتحديث الموقع.";
  return VERSION_ONLY[r.status];
}

export function UpdateCheck() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);

  type Sync = Extract<Awaited<ReturnType<typeof syncEditorCode>>, { available: true }>;
  const fromSync = (res: Sync): Result => ({
    kind: res.pushed ? "pushed" : res.action === "pull-prompt" ? "pull-prompt" : res.status === "same" ? (diffCount(res.diff) > 0 ? "same-version" : "same") : "pushed",
    status: res.status, local: res.local, remote: res.remote, diff: res.diff, url: res.pushed?.url,
    text: requestText(res.status, res.local, res.remote),
  });

  const check = async () => {
    setBusy(true);
    setCopied(false);
    try {
      // Compare first; only a newer site (or an empty GitHub copy) is sent straight away.
      let res = await syncEditorCode({ data: { push: false } });
      if (res.available && res.action === "push" && res.status !== "same") res = await syncEditorCode({ data: { push: true } });
      let r: Result;
      if (res.available) {
        r = fromSync(res);
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

  /** Sends the site to GitHub under the picked version; true when it worked. */
  const pushVersion = async (version: string) => {
    try {
      const res = await syncEditorCode({ data: { version } });
      if (!res.available) throw new Error("الإرسال يعمل فقط في معاينة التحرير");
      const r = fromSync(res);
      setResult(r);
      if (res.pushed) toast.success(`أُرسل الموقع إلى GitHub بالإصدار ${version}`);
      else toast.info("لا يوجد شيء جديد لإرساله: الإصدار والملفات متطابقة.");
      return true;
    } catch (e) {
      toast.error(`تعذر الإرسال إلى GitHub: ${e instanceof Error ? e.message : String(e)}`);
      return false;
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
  /** The update window opens only when the files really differ (same version, different files). */
  const canUpdate = result?.kind === "same-version";
  /** Files that are not the same on both sides. A finished push is excluded: those files are identical now. */
  const filesDiffer = !!result && result.kind !== "pushed" && !!result.diff && diffCount(result.diff) > 0;
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
          className={[
            "inline-flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60",
            filesDiffer ? "check-btn-diff border-accent-pink/45" : "border-border",
          ].join(" ")}
        >
          <span className="check-dot-wrap">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <BellRing size={16} />}
            {filesDiffer && <span className="check-dot" aria-hidden />}
          </span>
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
          {canUpdate && (
            <button type="button" onClick={() => setDialogOpen(true)} className="update-btn-primary mt-3">
              <RefreshCw size={16} /> تحديث
            </button>
          )}
          {(result.kind === "pushed" || result.kind === "same-version") && files.length > 0 && (
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
      {result && (
        <UpdateDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          local={result.local}
          remote={result.remote}
          filesDifferent={result.diff ? diffCount(result.diff) : 0}
          onPush={pushVersion}
        />
      )}
    </div>
  );
}
