import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  Download, Check, ChevronLeft, FilePen, Save, ClipboardPaste, Copy, ExternalLink, FileArchive, FileText, Folder, History, Loader2, Pencil, RefreshCw,
  RotateCcw, Scissors, Trash2, Upload, CheckCircle2, X, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  HISTORY_REPO, branchHead, checkRepoAccess, commitChanges, commitFiles, commitTreeEdits, createTextBlob, gh, SERVER_TOKEN, listCommits, listTree,
  recordHistory, restoreVersion, type ChangedFile, type CommitInfo, type GithubSettings, type RepoFile,
} from "@/lib/github-api";
import { decodeBase64Bytes, deliverFile } from "@/lib/file-download";
import { readZip } from "@/lib/zip-upload";
import {
  LOCAL_SHA, baseName, copyPaths, isLocalSha, listDir, movePaths, parentDir, removePaths, renamePath, setFileSha, treeChanges, uploadDrafts,
  type RepoFiles,
} from "@/lib/repo-edits";
import { Field, GhostButton, Panel, PrimaryButton, SmallInput } from "./ui";

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
          <FileManager repo={repo} branch={branch} gitRef={ref} key={`${ref}-${refresh}`} onChanged={() => { setRef(branch); setRefresh((n) => n + 1); }}
            onBackToLatest={ref !== branch ? () => setRef(branch) : undefined} />
        </>
      ) : (
        <HistoryView repo={repo} branch={branch} key={refresh} onRestored={() => setRefresh((n) => n + 1)} onBrowse={(sha) => { setRef(sha); setView("files"); }} />
      )}
    </div>
  );
}

function FileManager({ repo, branch, gitRef, onBackToLatest, onChanged }: {
  repo: string; branch: string; gitRef: string; onBackToLatest?: (() => void) | undefined; onChanged: () => void;
}) {
  const latest = gitRef === branch;
  const [loaded, setLoaded] = useState<{ sha: string | null; files: RepoFiles; sizes: Record<string, number> } | null>(null);
  const [work, setWork] = useState<RepoFiles>({});
  const [dir, setDir] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [clip, setClip] = useState<{ mode: "copy" | "cut"; paths: string[] } | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);
  const [open, setOpen] = useState<OpenFile | null>(null);
  /** Edited texts by local sha; they reach GitHub only on Confirm. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftId = useRef(0);
  const [saving, setSaving] = useState(false);
  const [zipOpen, setZipOpen] = useState(false);

  useEffect(() => {
    setLoaded(null);
    (async () => {
      const sha = latest ? await branchHead(repo, branch) : gitRef;
      const entries = sha ? await listTree(repo, sha) : [];
      const files: RepoFiles = {}, sizes: Record<string, number> = {};
      for (const e of entries) if (e.type === "blob" && e.sha) { files[e.path] = { sha: e.sha, mode: e.mode ?? "100644" }; if (e.size !== undefined) sizes[e.path] = e.size; }
      setLoaded({ sha, files, sizes }); setWork(files);
    })().catch((e) => { toast.error(`تعذرت قراءة الملفات: ${e instanceof Error ? e.message : e}`); setLoaded({ sha: null, files: {}, sizes: {} }); });
  }, [repo, branch, gitRef, latest]);

  const items = useMemo(() => listDir(work, dir), [work, dir]);
  const changes = useMemo(() => (loaded ? treeChanges(loaded.files, work) : []), [loaded, work]);
  const pending = changes.length > 0;
  const editable = latest && !!loaded?.sha;

  const leaveEditor = () => !(open?.draft !== undefined && open.draft !== open.text) || confirm("تجاهل التعديل غير المحفوظ؟");
  const go = (d: string) => { if (!leaveEditor()) return; setDir(d); setSelected([]); setOpen(null); setRenaming(null); };
  const toggle = (p: string) => setSelected((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  const apply = (fn: () => RepoFiles) => { try { setWork(fn()); setSelected([]); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } };

  const paste = () => {
    if (!clip) return;
    apply(() => (clip.mode === "copy" ? copyPaths(work, clip.paths, dir) : movePaths(work, clip.paths, dir)));
    if (clip.mode === "cut") setClip(null);
  };
  const cancel = () => { if (loaded) setWork(loaded.files); setDrafts({}); setOpen(null); setSelected([]); setClip(null); setRenaming(null); };
  const confirmEdits = async () => {
    if (!loaded?.sha) return;
    setSaving(true);
    try {
      const removed = changes.filter((c) => !c.sha).length, written = changes.length - removed;
      const msg = `File manager: ${written} written, ${removed} removed`;
      const res = await commitTreeEdits(repo, branch, loaded.sha, msg, await uploadDrafts(changes, drafts, (t) => createTextBlob(repo, t)));
      try { await recordHistory({ sha: res.sha, message: msg, repo, files: await commitChanges(repo, res.sha) }); } catch { /* the record is optional */ }
      toast.success("حُفظت التعديلات على GitHub", { action: { label: "عرض", onClick: () => window.open(res.url, "_blank") } });
      setClip(null); setDrafts({}); onChanged();
    } catch (e) {
      toast.error(`تعذر الحفظ: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setSaving(false); }
  };

  /** A copied or moved file has a new path but the same content as a path in the loaded version. */
  const sourceOf = useMemo(() => {
    const bySha: Record<string, string> = {};
    for (const [p, b] of Object.entries(loaded?.files ?? {})) bySha[b.sha] ??= p;
    return (path: string) => (loaded?.files[path]?.sha === work[path]?.sha ? path : bySha[work[path]?.sha ?? ""]);
  }, [loaded, work]);

  const openFile = async (path: string) => {
    const sha = work[path]?.sha;
    if (isLocalSha(sha)) {
      const text = drafts[sha] ?? "";
      setOpen({ path, text, editable: true, download: new Blob([text], { type: "text/plain;charset=utf-8" }) });
      return;
    }
    setOpen({ path, text: null, editable: false });
    try {
      if (!sha) throw new Error("الملف غير موجود");
      const blob = await gh(SERVER_TOKEN, `/repos/${repo}/git/blobs/${sha}`);
      if (blob?.encoding !== "base64" || typeof blob.content !== "string") throw new Error("تعذر قراءة محتوى الملف");
      const bytes = decodeBase64Bytes(blob.content);
      const text = new TextDecoder().decode(bytes);
      const textFile = isTextFile(path, text) && !text.includes("\uFFFD");
      setOpen({ path, text: textFile ? text : "ملف غير نصي", editable: textFile,
        base: { sha, text }, download: new Blob([bytes], { type: textFile ? "text/plain;charset=utf-8" : "application/octet-stream" }) });
    } catch (error) {
      setOpen({ path, text: "تعذر فتح الملف", editable: false });
      toast.error(error instanceof Error ? error.message : "تعذر فتح الملف");
    }
  };

  /** Keeps the edited text locally; Confirm later writes it to GitHub together with the other changes. */
  const saveEdit = () => {
    if (!open || open.draft === undefined) return;
    const { path, draft } = open;
    if (draft === open.text) { setOpen({ ...open, draft: undefined }); return; }
    if (open.base && draft === open.base.text) {
      apply(() => setFileSha(work, path, open.base!.sha));
    } else {
      const sha = `${LOCAL_SHA}${++draftId.current}`;
      setDrafts((d) => ({ ...d, [sha]: draft }));
      apply(() => setFileSha(work, path, sha));
    }
    setOpen({ ...open, text: draft, draft: undefined });
    toast.success("حُفظ التعديل مؤقتا. اضغط تأكيد لإرساله إلى GitHub");
  };

  /** Tab inserts two spaces instead of leaving the box, like the GitHub editor. */
  const onEditorKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab" || !open || open.draft === undefined) return;
    e.preventDefault();
    const el = e.currentTarget, start = el.selectionStart, end = el.selectionEnd;
    const draft = open.draft.slice(0, start) + "  " + open.draft.slice(end);
    setOpen({ ...open, draft });
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2; });
  };

  const crumbs = dir ? dir.split("/") : [];
  const short = gitRef.length === 40 ? gitRef.slice(0, 7) : gitRef;
  const allHere = items.length > 0 && items.every((i) => selected.includes(i.path));

  return (
    <Panel title="مدير ملفات الموقع" desc={latest ? "حدد الملفات ثم احذف أو انسخ أو قص. لا يُحفظ شيء حتى تضغط تأكيد." : `تتصفح نسخة قديمة (${short}) للقراءة فقط`}
      actions={<div className="flex flex-wrap gap-1">
        {onBackToLatest && <GhostButton onClick={onBackToLatest}><RefreshCw size={14} /> العودة لأحدث نسخة</GhostButton>}
        {editable && !pending && <GhostButton onClick={() => setZipOpen((v) => !v)} ariaLabel="تحديث الموقع من ملف ZIP"><FileArchive size={14} /> ZIP</GhostButton>}
      </div>}>
      {zipOpen && editable && !pending && <UploadZip repo={repo} branch={branch} onClose={() => setZipOpen(false)} onDone={() => { setZipOpen(false); onChanged(); }} />}

      <div dir="ltr" className="mb-2 flex flex-wrap items-center gap-1 text-xs">
        <button className="underline" onClick={() => go("")}>{repo.split("/")[1]}</button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">/<button className="underline" onClick={() => go(crumbs.slice(0, i + 1).join("/"))}>{c}</button></span>
        ))}
      </div>

      {editable && !open && (
        <div className="mb-2 flex flex-wrap items-center gap-1">
          <GhostButton onClick={() => apply(() => removePaths(work, selected))} disabled={selected.length === 0}><Trash2 size={14} /> حذف</GhostButton>
          <GhostButton onClick={() => { setClip({ mode: "copy", paths: selected }); setSelected([]); }} disabled={selected.length === 0}><Copy size={14} /> نسخ</GhostButton>
          <GhostButton onClick={() => { setClip({ mode: "cut", paths: selected }); setSelected([]); }} disabled={selected.length === 0}><Scissors size={14} /> قص</GhostButton>
          <GhostButton onClick={() => setRenaming({ path: selected[0]!, name: baseName(selected[0]!) })} disabled={selected.length !== 1}><Pencil size={14} /> إعادة تسمية</GhostButton>
          <GhostButton onClick={paste} disabled={!clip}><ClipboardPaste size={14} /> لصق هنا{clip && ` (${clip.paths.length})`}</GhostButton>
          {clip && <span className="text-[11px] text-muted-foreground">{clip.mode === "cut" ? "للنقل" : "للنسخ"}: افتح المجلد الهدف ثم اضغط لصق</span>}
        </div>
      )}

      {renaming && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <SmallInput ariaLabel="الاسم الجديد" value={renaming.name} onChange={(name) => setRenaming({ ...renaming, name })} className="flex-1" />
          <PrimaryButton onClick={() => { const r = renaming; apply(() => renamePath(work, r.path, r.name)); setRenaming(null); }}><Check size={14} /> تم</PrimaryButton>
          <GhostButton onClick={() => setRenaming(null)}>إلغاء</GhostButton>
        </div>
      )}

      {pending && (
        <div role="status" className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-accent-pink bg-background p-2 text-sm">
          <span className="flex-1">{changes.length} تغيير غير محفوظ</span>
          <PrimaryButton onClick={confirmEdits} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} تأكيد</PrimaryButton>
          <GhostButton onClick={cancel} disabled={saving}><X size={14} /> إلغاء</GhostButton>
        </div>
      )}

      {loaded === null ? <Loader2 className="animate-spin" size={18} /> : open ? (
        <div>
          <div className="flex flex-wrap items-center gap-1">
            <GhostButton onClick={() => { if (leaveEditor()) setOpen(null); }}><ChevronLeft size={14} /> رجوع</GhostButton>
            <span className="flex-1" />
            <GhostButton disabled={!open.download} onClick={() => {
              if (!open.download) return;
              const file = open.editable ? new Blob([open.draft ?? open.text ?? ""], { type: "text/plain;charset=utf-8" }) : open.download;
              void deliverFile(file, baseName(open.path)).catch(() => toast.error("تعذر تنزيل الملف"));
            }} ariaLabel="تنزيل الملف"><Download size={14} /> تنزيل الملف</GhostButton>
            {open.text !== null && open.editable && <GhostButton onClick={() => {
              void navigator.clipboard.writeText(open.draft ?? open.text ?? "").then(() => toast.success("نُسخ نص الملف")).catch(() => toast.error("تعذر نسخ النص؛ تحقق من إذن الحافظة"));
            }}><Copy size={14} /> نسخ النص</GhostButton>}
            {open.draft === undefined ? (
              editable && open.editable && <GhostButton onClick={() => setOpen({ ...open, draft: open.text ?? "" })}><FilePen size={14} /> التعديل</GhostButton>
            ) : (
              <>
                <PrimaryButton onClick={saveEdit}><Save size={14} /> حفظ التعديل</PrimaryButton>
                <GhostButton onClick={() => setOpen({ ...open, draft: undefined })}><X size={14} /> إلغاء</GhostButton>
              </>
            )}
          </div>
          <p dir="ltr" className="my-2 font-mono text-xs">{open.path}{work[open.path] && isLocalSha(work[open.path]!.sha) && <span className="ms-2 text-accent-pink">• معدّل</span>}</p>
          {open.draft !== undefined ? (
            <textarea dir="ltr" aria-label={`تعديل ${baseName(open.path)}`} value={open.draft} onChange={(e) => setOpen({ ...open, draft: e.target.value })} onKeyDown={onEditorKey}
              spellCheck={false} wrap="off" autoFocus
              className="h-[28rem] w-full resize-y rounded-lg border border-accent-pink bg-background p-3 font-mono text-[12px] leading-5 outline-none" />
          ) : (
            <pre dir="ltr" className="max-h-[28rem] overflow-auto rounded-lg border border-border bg-background p-3 text-[11px]">{open.text === null ? "…" : open.text.slice(0, 200000)}</pre>
          )}
        </div>
      ) : (
        <ul dir="ltr" className="divide-y divide-border rounded-lg border border-border bg-background text-sm">
          {editable && items.length > 0 && (
            <li className="flex items-center gap-2 px-3 py-1 text-[11px] text-muted-foreground">
              <input type="checkbox" aria-label="تحديد الكل" checked={allHere} onChange={() => setSelected(allHere ? [] : items.map((i) => i.path))} />
              {selected.length > 0 ? `${selected.length} محدد` : "تحديد الكل"}
            </li>
          )}
          {dir && (
            <li>
              <button className="flex w-full items-center gap-2 px-3 py-1.5 text-start hover:bg-muted" onClick={() => go(parentDir(dir))} aria-label="رجوع للمجلد السابق">
                {editable && <span className="w-[13px]" />}
                <Folder size={14} className="text-accent-pink" /><span className="font-mono">..</span>
              </button>
            </li>
          )}
          {items.length === 0 && <li className="p-3 text-muted-foreground">فارغ</li>}
          {items.map((e) => {
            const cut = clip?.mode === "cut" && clip.paths.includes(e.path);
            const size = loaded.sizes[sourceOf(e.path) ?? ""];
            return (
              <li key={e.path} className={`flex items-center gap-2 px-3 ${cut ? "opacity-50" : ""}`}>
                {editable && <input type="checkbox" aria-label={`تحديد ${e.name}`} checked={selected.includes(e.path)} onChange={() => toggle(e.path)} />}
                <button className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-start hover:text-accent-pink" onClick={() => (e.type === "tree" ? go(e.path) : openFile(e.path))}>
                  {e.type === "tree" ? <Folder size={14} className="text-accent-pink" /> : <FileText size={14} className="text-muted-foreground" />}
                  <span className="flex-1 truncate">{e.name}</span>
                  {e.type === "blob" && size !== undefined && <span className="text-[11px] text-muted-foreground">{(size / 1024).toFixed(1)} KB</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

type OpenFile = {
  path: string;
  text: string | null;
  download?: Blob;
  /** Text files of the latest version can be edited. */
  editable: boolean;
  /** Content as loaded from GitHub, so typing it back unchanged leaves no change. */
  base?: { sha: string; text: string } | undefined;
  /** Text in the edit box while editing. */
  draft?: string | undefined;
};

const BINARY_EXT = /\.(png|jpe?g|gif|webp|avif|ico|bmp|pdf|zip|gz|woff2?|ttf|otf|eot|mp[34]|webm|wav|ogg|lockb)$/i;
function isTextFile(path: string, text: string) {
  return !BINARY_EXT.test(path) && !text.includes("\u0000");
}

function UploadZip({ repo, branch, onDone, onClose }: { repo: string; branch: string; onDone: () => void; onClose: () => void }) {
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
    <div className="mb-3 rounded-lg border border-border bg-background p-3">
      <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => pick(e.target.files?.[0])} aria-label="اختيار ملف ZIP" />
      {!zip ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <GhostButton onClick={() => fileRef.current?.click()}><Upload size={14} /> اختر ملف ZIP</GhostButton>
          <span className="flex-1">يستبدل كل ملفات الموقع. النسخة القديمة تبقى في السجل.</span>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="hover:text-foreground"><X size={14} /></button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm"><span dir="ltr" className="font-medium">{zip.name}</span> — {zip.files.length} ملف{zip.skipped > 0 && ` · تخطي ${zip.skipped}`}</p>
          <Field label="وصف التحديث" value={message} onChange={setMessage} />
          {progress && <p role="status" className="text-xs text-muted-foreground">{progress}</p>}
          <div className="flex flex-wrap gap-2">
            <PrimaryButton onClick={push} disabled={pushing}>{pushing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} رفع التحديث</PrimaryButton>
            <GhostButton onClick={() => setZip(null)} disabled={pushing}>إلغاء</GhostButton>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryView({ repo, branch, onBrowse, onRestored }: { repo: string; branch: string; onBrowse: (sha: string) => void; onRestored: () => void }) {
  const [restoring, setRestoring] = useState<string | null>(null);
  const restore = async (c: CommitInfo) => {
    const label = c.message.split("\n")[0];
    if (!confirm(`ترجع ملفات الموقع إلى هذه النسخة:\n"${label}"\n\nالنسخ الأحدث تبقى في السجل ويمكنك الرجوع إليها. متابعة؟`)) return;
    setRestoring(c.sha);
    try {
      const msg = `Restore version ${c.sha.slice(0, 7)}: ${label}`;
      const res = await restoreVersion(repo, branch, c.sha, msg);
      try { await recordHistory({ sha: res.sha, message: msg, repo, files: await commitChanges(repo, res.sha) }); } catch { /* the record is optional */ }
      toast.success("رجع الموقع إلى النسخة المختارة");
      onRestored();
    } catch (e) {
      toast.error(`تعذر الرجوع: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setRestoring(null); }
  };
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
          {commits.map((c, i) => (
            <li key={c.sha} className="py-2">
              <div className="flex flex-wrap items-center gap-2">
                <button className="min-w-0 flex-1 text-start" onClick={() => toggle(c.sha)}>
                  <p className="truncate text-sm font-medium" dir="auto">{c.message.split("\n")[0]}</p>
                  <p className="text-[11px] text-muted-foreground"><span dir="ltr">{c.sha.slice(0, 7)}</span> · {new Date(c.date).toLocaleString("ar")} · {c.author}</p>
                </button>
                <GhostButton onClick={() => onBrowse(c.sha)}><Folder size={14} /> تصفح هذه النسخة</GhostButton>
                {i > 0 && <GhostButton onClick={() => restore(c)} disabled={restoring !== null}>{restoring === c.sha ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} الرجوع لهذه النسخة</GhostButton>}
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
