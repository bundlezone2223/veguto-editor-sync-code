import { useRef, useState } from "react";
import { CheckCircle2, Download, FileArchive, Loader2, PlugZap, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { checkRepoAccess, commitFiles, isRepoName, saveGithubSettings, type GithubSettings, type RepoFile } from "@/lib/github-api";
import { readZip } from "@/lib/zip-upload";
import { Field, GhostButton, Panel, PrimaryButton } from "./ui";

type Check = { ok: boolean; message: string } | null;

export function GithubPanel({ settings, onChange }: { settings: GithubSettings; onChange: (s: GithubSettings) => void }) {
  const [checks, setChecks] = useState<{ site: Check; code: Check }>({ site: null, code: null });
  const [checking, setChecking] = useState(false);
  const [zip, setZip] = useState<{ name: string; files: RepoFile[]; skipped: number } | null>(null);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");
  const [pushing, setPushing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<GithubSettings>) => {
    const next = { ...settings, ...patch };
    saveGithubSettings(next);
    onChange(next);
  };

  const test = async () => {
    if (!settings.token) { toast.error("أدخل رمز GitHub أولا"); return; }
    setChecking(true);
    const [site, code] = await Promise.all([
      isRepoName(settings.siteRepo) ? checkRepoAccess(settings.token, settings.siteRepo) : Promise.resolve({ ok: false, message: "اكتب الاسم بالشكل owner/name" }),
      isRepoName(settings.codeRepo) ? checkRepoAccess(settings.token, settings.codeRepo) : Promise.resolve({ ok: false, message: "اكتب الاسم بالشكل owner/name" }),
    ]);
    setChecks({ site, code });
    setChecking(false);
  };

  const pickZip = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { files, skipped } = readZip(new Uint8Array(await file.arrayBuffer()));
      if (files.length === 0) { toast.error("الملف لا يحتوي على ملفات قابلة للرفع"); return; }
      setZip({ name: file.name, files, skipped });
      setMessage(`Upload ${file.name.replace(/\.zip$/i, "")}`);
    } catch {
      toast.error("تعذرت قراءة الملف. تأكد أنه ملف ZIP سليم.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const push = async () => {
    if (!zip) return;
    if (!settings.token || !isRepoName(settings.codeRepo)) { toast.error("أكمل رمز GitHub ومستودع الكود أولا"); return; }
    if (!confirm(`سيستبدل هذا كل الملفات في ${settings.codeRepo} (${settings.codeBranch}) بمحتوى ${zip.name}. يبقى السجل القديم في GitHub. متابعة؟`)) return;
    setPushing(true);
    try {
      const res = await commitFiles({
        token: settings.token, repo: settings.codeRepo, branch: settings.codeBranch,
        message: message.trim() || `Upload ${zip.name}`, files: zip.files, replaceAll: true,
        onProgress: (d, t) => setProgress(`رفع ${d} من ${t} ملف…`),
      });
      toast.success(`رُفع ${res.count} ملف إلى GitHub`, { action: { label: "عرض", onClick: () => window.open(res.url, "_blank") } });
      setZip(null);
    } catch (e) {
      toast.error(`تعذر الرفع: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setPushing(false); setProgress(""); }
  };

  const status = (c: Check) => c && (
    <p className={`mt-1 flex items-center gap-1 text-xs ${c.ok ? "text-accent-pink" : "text-muted-foreground"}`}>
      {c.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} <span dir="auto">{c.message}</span>
    </p>
  );

  return (
    <div className="space-y-4">
      <Panel title="الاتصال بـ GitHub" desc="يُحفظ الرمز في هذا المتصفح فقط ولا يُرسل إلا إلى GitHub">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="رمز GitHub (Personal access token بصلاحية repo)" type="password" value={settings.token} onChange={(v) => update({ token: v.trim() })} placeholder="ghp_…" />
          </div>
          <div>
            <Field label="مستودع الموقع الرئيسي (للمقالات والتخطيط)" value={settings.siteRepo} onChange={(v) => update({ siteRepo: v.trim() })} placeholder="owner/veguto-wiki" />
            {status(checks.site)}
          </div>
          <Field label="الفرع" value={settings.siteBranch} onChange={(v) => update({ siteBranch: v.trim() || "main" })} />
          <div>
            <Field label="مستودع الكود (لرفع ملف ZIP)" value={settings.codeRepo} onChange={(v) => update({ codeRepo: v.trim() })} placeholder="owner/repo" />
            {status(checks.code)}
          </div>
          <Field label="الفرع" value={settings.codeBranch} onChange={(v) => update({ codeBranch: v.trim() || "main" })} />
        </div>
        <div className="mt-3">
          <GhostButton onClick={test} disabled={checking}>{checking ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />} فحص الاتصال</GhostButton>
        </div>
      </Panel>

      <Panel
        title="رفع المشروع كاملا من ملف ZIP"
        desc="يستبدل كل ملفات مستودع الكود بمحتوى الملف في دفعة واحدة. لا تُرفع مجلدات .git وnode_modules وملفات .env."
        actions={isRepoName(settings.codeRepo) && (
          <a href={`https://github.com/${settings.codeRepo}/archive/refs/heads/${settings.codeBranch}.zip`} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-muted">
            <Download size={14} /> تنزيل النسخة الحالية
          </a>
        )}
      >
        <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => pickZip(e.target.files?.[0])} aria-label="اختيار ملف ZIP" />
        {!zip ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void pickZip(e.dataTransfer.files[0]); }}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-background py-8 text-sm text-muted-foreground hover:border-accent-pink"
          >
            <FileArchive size={28} /> اسحب ملف ZIP هنا أو اضغط للاختيار
          </button>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-background p-3 text-sm">
              <p className="font-medium" dir="ltr">{zip.name}</p>
              <p className="text-xs text-muted-foreground">{zip.files.length} ملف جاهز للرفع{zip.skipped > 0 && ` · تم تخطي ${zip.skipped}`}</p>
              <ul dir="ltr" className="mt-2 max-h-40 overflow-auto font-mono text-[11px] text-muted-foreground">
                {zip.files.slice(0, 200).map((f) => <li key={f.path}>{f.path}</li>)}
                {zip.files.length > 200 && <li>… +{zip.files.length - 200}</li>}
              </ul>
            </div>
            <Field label="وصف التحديث" value={message} onChange={setMessage} />
            {progress && <p role="status" className="text-xs text-muted-foreground">{progress}</p>}
            <div className="flex flex-wrap gap-2">
              <PrimaryButton onClick={push} disabled={pushing}>{pushing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} رفع إلى {settings.codeRepo || "GitHub"}</PrimaryButton>
              <GhostButton onClick={() => setZip(null)} disabled={pushing}>إلغاء</GhostButton>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
