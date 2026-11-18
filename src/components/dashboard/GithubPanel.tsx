import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ExternalLink, FileArchive, FileText, Folder, History, Loader2, RefreshCw, Upload, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  HISTORY_REPO, checkRepoAccess, commitChanges, commitFiles, listCommits, listTree, readRepoText, recordHistory,
  type ChangedFile, type CommitInfo, type GithubSettings, type RepoFile, type TreeEntry,
} from "@/lib/github-api";
import { readZip } from "@/lib/zip-upload";
import { Field, GhostButton, Panel, PrimaryButton } from "./ui";

export function GithubPanel({ settings }: { settings: GithubSettings; onChange?: (s: GithubSettings) => void }) {
  const repo = settings.siteRepo, branch = settings.siteBranch;
  const [view, setView] = useState<"files" | "history">("files");
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [ref, setRef] = useState(branch);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => { void checkRepoAccess(settings.token, repo).then(setStatus); }, [repo, settings.token]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm">
        {status === null ? <Loader2 size={16} className="animate-spin" /> : status.ok ? <CheckCircle2 size={16} className="text-accent-pink" /> : <XCircle size={16} className="text-muted-foreground" />}
        <span>الموقع الرئيسي: <a dir="ltr" className="font-medium underline" href={`https://github.com/${repo}`} target="_blank" rel="noreferrer">{repo}</a></span>
        <span className="text-xs text-muted-foreground" dir="auto">{status?.message ?? "جارٍ الفحص…"}</span>
        <div className="ms-auto flex gap-1">
          <GhostButton onClick={() => setView("files")} disabled={view === "files"}><Folder size={14} /> الملفات</GhostButton>
          <GhostButton onClick={() => setView("history")} disabled={view === "history"}><History size={14} /> السجل</GhostButton>
        </div>
      </div>

      {view === "files" ? (
        <>
          <UploadZip repo={repo} branch={branch} onDone={() => { setRef(branch); setRefresh((n) => n + 1); }} />
          <FileManager repo={repo} gitRef={ref} key={`${ref}-${refresh}`} onBackToLatest={ref !== branch ? () => setRef(branch) : undefined} />
        </>
      ) : (
        <HistoryView repo={repo} branch={branch} onBrowse={(sha) => { setRef(sha); setView("files"); }} />
      )}
    </div>
  );
}

function FileManager({ repo, gitRef, onBackToLatest }: { repo: string; gitRef: string; onBackToLatest?: (() => void) | undefined }) {
  const [entries, setEntries] = useState<TreeEntry[] | null>(null);
  const [dir, setDir] = useState("");
  const [open, setOpen] = useState<{ path: string; text: string | null } | null>(null);

  useEffect(() => {
    setEntries(null);
    listTree(repo, gitRef).then(setEntries).catch((e) => { toast.error(`تعذرت قراءة الملفات: ${e instanceof Error ? e.message : e}`); setEntries([]); });
  }, [repo, gitRef]);

  const items = useMemo(() => {
    if (!entries) return [];
    const prefix = dir ? `${dir}/` : "";
    return entries.filter((e) => e.path.startsWith(prefix) && !e.path.slice(prefix.length).includes("/"))
      .sort((a, b) => (a.type === b.type ? a.path.localeCompare(b.path) : a.type === "tree" ? -1 : 1));
  }, [entries, dir]);

  const openFile = async (path: string) => {
    setOpen({ path, text: null });
    const text = await readRepoText(repo, gitRef, path);
    setOpen({ path, text: text ?? "تعذر فتح الملف" });
  };

  const crumbs = dir ? dir.split("/") : [];
  const short = gitRef.length === 40 ? gitRef.slice(0, 7) : gitRef;

  return (
    <Panel title="مدير ملفات الموقع" desc={`يعرض محتوى المستودع (${short})`}
      actions={onBackToLatest && <GhostButton onClick={onBackToLatest}><RefreshCw size={14} /> العودة لأحدث نسخة</GhostButton>}>
      <div dir="ltr" className="mb-2 flex flex-wrap items-center gap-1 text-xs">
        <button className="underline" onClick={() => { setDir(""); setOpen(null); }}>{repo.split("/")[1]}</button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">/<button className="underline" onClick={() => { setDir(crumbs.slice(0, i + 1).join("/")); setOpen(null); }}>{c}</button></span>
        ))}
      </div>
      {entries === null ? <Loader2 className="animate-spin" size={18} /> : open ? (
        <div>
          <GhostButton onClick={() => setOpen(null)}><ChevronLeft size={14} /> رجوع</GhostButton>
          <p dir="ltr" className="my-2 font-mono text-xs">{open.path}</p>
          <pre dir="ltr" className="max-h-[28rem] overflow-auto rounded-lg border border-border bg-background p-3 text-[11px]">{open.text === null ? "…" : open.text.slice(0, 200000)}</pre>
        </div>
      ) : (
        <ul dir="ltr" className="divide-y divide-border rounded-lg border border-border bg-background text-sm">
          {items.length === 0 && <li className="p-3 text-muted-foreground">فارغ</li>}
          {items.map((e) => {
            const name = e.path.split("/").pop();
            return (
              <li key={e.path}>
                <button className="flex w-full items-center gap-2 px-3 py-1.5 text-start hover:bg-muted" onClick={() => (e.type === "tree" ? setDir(e.path) : openFile(e.path))}>
                  {e.type === "tree" ? <Folder size={14} className="text-accent-pink" /> : <FileText size={14} className="text-muted-foreground" />}
                  <span className="flex-1 truncate">{name}</span>
                  {e.size !== undefined && <span className="text-[11px] text-muted-foreground">{(e.size / 1024).toFixed(1)} KB</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function UploadZip({ repo, branch, onDone }: { repo: string; branch: string; onDone: () => void }) {
  const [zip, setZip] = useState<{ name: string; files: RepoFile[]; skipped: number } | null>(null);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");
  const [pushing, setPushing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { files, skipped } = readZip(new Uint8Array(await file.arrayBuffer()));
      if (files.length === 0) { toast.error("الملف لا يحتوي على ملفات قابلة للرفع"); return; }
      setZip({ name: file.name, files, skipped });
      setMessage(`Update site from ${file.name.replace(/\.zip$/i, "")}`);
    } catch { toast.error("تعذرت قراءة الملف. تأكد أنه ملف ZIP سليم."); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  };

  const push = async () => {
    if (!zip) return;
    if (!confirm(`سيستبدل هذا ملفات ${repo} بمحتوى ${zip.name}. النسخة القديمة تبقى في السجل. متابعة؟`)) return;
    setPushing(true);
    try {
      const msg = message.trim() || `Update site from ${zip.name}`;
      const res = await commitFiles({ token: "@server", repo, branch, message: msg, files: zip.files, replaceAll: true, onProgress: (d, t) => setProgress(`رفع ${d} من ${t} ملف…`) });
      setProgress("حفظ التغييرات في السجل…");
      try {
        const files = await commitChanges(repo, res.sha);
        await recordHistory({ sha: res.sha, message: msg, repo, files });
      } catch (e) { toast.error(`رُفع التحديث لكن تعذر حفظ السجل: ${e instanceof Error ? e.message : e}`); }
      toast.success(`رُفع ${res.count} ملف إلى الموقع الرئيسي`, { action: { label: "عرض", onClick: () => window.open(res.url, "_blank") } });
      setZip(null); onDone();
    } catch (e) {
      toast.error(`تعذر الرفع: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setPushing(false); setProgress(""); }
  };

  return (
    <Panel title="تحديث الموقع الرئيسي من ملف ZIP" desc="يرفع كل الملفات في دفعة واحدة. لا تُرفع مجلدات .git وnode_modules وملفات .env.">
      <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => pick(e.target.files?.[0])} aria-label="اختيار ملف ZIP" />
      {!zip ? (
        <button type="button" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void pick(e.dataTransfer.files[0]); }}
          className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-background py-6 text-sm text-muted-foreground hover:border-accent-pink">
          <FileArchive size={26} /> اسحب ملف ZIP هنا أو اضغط للاختيار
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm"><span dir="ltr" className="font-medium">{zip.name}</span> — {zip.files.length} ملف{zip.skipped > 0 && ` · تخطي ${zip.skipped}`}</p>
          <Field label="وصف التحديث" value={message} onChange={setMessage} />
          {progress && <p role="status" className="text-xs text-muted-foreground">{progress}</p>}
          <div className="flex flex-wrap gap-2">
            <PrimaryButton onClick={push} disabled={pushing}>{pushing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} رفع التحديث</PrimaryButton>
            <GhostButton onClick={() => setZip(null)} disabled={pushing}>إلغاء</GhostButton>
          </div>
        </div>
      )}
    </Panel>
  );
}

function HistoryView({ repo, branch, onBrowse }: { repo: string; branch: string; onBrowse: (sha: string) => void }) {
  const [commits, setCommits] = useState<CommitInfo[] | null>(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(true);
  const [openSha, setOpenSha] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, ChangedFile[]>>({});

  useEffect(() => {
    listCommits(repo, branch, page).then((list) => {
      setCommits((c) => [...(page === 1 ? [] : c ?? []), ...list]);
      setMore(list.length === 30);
    }).catch((e) => { toast.error(`تعذر تحميل السجل: ${e instanceof Error ? e.message : e}`); setCommits([]); });
  }, [repo, branch, page]);

  const toggle = async (sha: string) => {
    if (openSha === sha) { setOpenSha(null); return; }
    setOpenSha(sha);
    if (!files[sha]) {
      const f = await commitChanges(repo, sha).catch(() => []);
      setFiles((m) => ({ ...m, [sha]: f }));
    }
  };

  return (
    <Panel title="سجل تحديثات الموقع" desc={`كل نسخة سابقة محفوظة في GitHub ويمكن تصفحها. ملخص كل تحديث يُحفظ أيضا في ${HISTORY_REPO}.`}>
      {commits === null ? <Loader2 className="animate-spin" size={18} /> : (
        <ul className="divide-y divide-border">
          {commits.length === 0 && <li className="py-2 text-sm text-muted-foreground">لا توجد تحديثات بعد — ارفع أول نسخة من تبويب الملفات.</li>}
          {commits.map((c) => (
            <li key={c.sha} className="py-2">
              <div className="flex flex-wrap items-center gap-2">
                <button className="min-w-0 flex-1 text-start" onClick={() => toggle(c.sha)}>
                  <p className="truncate text-sm font-medium" dir="auto">{c.message.split("\n")[0]}</p>
                  <p className="text-[11px] text-muted-foreground"><span dir="ltr">{c.sha.slice(0, 7)}</span> · {new Date(c.date).toLocaleString("ar")} · {c.author}</p>
                </button>
                <GhostButton onClick={() => onBrowse(c.sha)}><Folder size={14} /> تصفح هذه النسخة</GhostButton>
                <a href={`https://github.com/${repo}/archive/${c.sha}.zip`} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-muted"><FileArchive size={14} /> ZIP</a>
                <a href={`https://github.com/${repo}/commit/${c.sha}`} target="_blank" rel="noreferrer" aria-label="عرض على GitHub" className="text-muted-foreground hover:text-foreground"><ExternalLink size={16} /></a>
              </div>
              {openSha === c.sha && (
                <ul dir="ltr" className="mt-2 max-h-56 overflow-auto rounded-lg border border-border bg-background p-2 font-mono text-[11px]">
                  {!files[c.sha] ? <li>…</li> : files[c.sha]!.length === 0 ? <li>no file changes</li> : files[c.sha]!.map((f) => (
                    <li key={f.filename}><span className="text-accent-pink">{f.status}</span> {f.filename} <span className="text-muted-foreground">+{f.additions} −{f.deletions}</span></li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {more && commits && <div className="mt-2"><GhostButton onClick={() => setPage((p) => p + 1)}>تحميل المزيد</GhostButton></div>}
    </Panel>
  );
}
