import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, Check, CheckCircle2, ClipboardPaste, Copy, ExternalLink, FilePen, FileText, Folder, Globe, Loader2, Pencil, RefreshCw, Save, Scissors, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { baseName, copyPaths, isLocalSha, listDir, movePaths, parentDir, removePaths, renamePath, setFileSha, treeChanges, type RepoFiles } from "@/lib/repo-edits";
import { workspaceCall, type WorkspaceStatus } from "@/lib/site-workspace-client";
import { Field, GhostButton, PrimaryButton, SmallInput } from "./ui";

type OpenFile = { path: string; text: string | null; draft?: string };
export function SitePanel({ active }: { active: boolean }) {
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [work, setWork] = useState<RepoFiles>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [view, setView] = useState<"preview" | "files">("preview");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dir, setDir] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [clip, setClip] = useState<{ mode: "copy" | "cut"; paths: string[] } | null>(null);
  const [rename, setRename] = useState<{ path: string; name: string } | null>(null);
  const [open, setOpen] = useState<OpenFile | null>(null);
  const [message, setMessage] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [frameLoading, setFrameLoading] = useState(true);
  const started = useRef(false), draftId = useRef(0), fileRequest = useRef(0);
  const pending = useMemo(() => treeChanges(status?.files ?? {}, work), [status, work]);
  const unsavedText = open?.draft !== undefined && open.draft !== open.text;
  const dirty = pending.length > 0 || unsavedText;
  const accept = useCallback((s: WorkspaceStatus) => { setStatus(s); setWork(s.files); setDrafts({}); setSelected([]); setClip(null); setOpen(null); setRename(null); setError(null); }, []);
  const run = async (label: string, fn: () => Promise<void>) => { setBusy(label); setError(null); try { await fn(); } catch (e) { const m = e instanceof Error ? e.message : "تعذرت العملية"; setError(m); toast.error(m); } finally { setBusy(null); } };
  const refreshPreview = () => { setFrameLoading(true); setPreviewVersion((n) => n + 1); };
  useEffect(() => {
    if (!active || started.current || !import.meta.env.DEV) return;
    started.current = true;
    void run("أقرأ الموقع من GitHub…", async () => {
      let s = await workspaceCall<WorkspaceStatus>("status");
      if (!s.initialized) s = await workspaceCall<WorkspaceStatus>("pull", { revision: s.revision });
      accept(s);
    });
  }, [active, accept]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const leave = () => !unsavedText || window.confirm("تجاهل تعديل النص غير المحفوظ؟");
  const go = (d: string) => { if (!leave()) return; fileRequest.current++; setDir(d); setOpen(null); setSelected([]); setRename(null); };
  const change = (fn: () => RepoFiles) => { try { setWork(fn()); setSelected([]); setOpen(null); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } };
  const readFile = async (p: string) => {
    if (!leave()) return;
    const request = ++fileRequest.current, sha = work[p]?.sha;
    if (isLocalSha(sha)) { setOpen({ path: p, text: drafts[sha] ?? "" }); return; }
    const source = Object.keys(status?.files ?? {}).find((f) => status?.files[f]?.sha === sha);
    if (!source) { toast.error("تعذر العثور على محتوى الملف"); return; }
    setBusy("أفتح الملف…");
    try { const result = await workspaceCall<{ text: string | null; size: number }>("read", { path: source }); if (fileRequest.current === request) setOpen({ path: p, text: result.text }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "تعذر فتح الملف"); } finally { setBusy(null); }
  };
  const copyText = async () => { if (!open || open.text === null) return; try { await navigator.clipboard.writeText(open.draft ?? open.text); toast.success("نُسخ نص الملف"); } catch { toast.error("تعذر نسخ النص؛ تحقق من إذن الحافظة"); } };
  const saveText = () => {
    if (!open || open.draft === undefined) return;
    const { draft, path } = open;
    if (draft !== open.text) { const sha = `local:${++draftId.current}`; setDrafts((d) => ({ ...d, [sha]: draft })); setWork((w) => setFileSha(w, path, sha)); }
    setOpen({ path, text: draft }); toast.success("حُفظ النص ضمن التعديلات المعلقة");
  };
  const saveBatch = () => {
    if (!status) return;
    void run("أحفظ الملفات محليًا…", async () => { accept(await workspaceCall<WorkspaceStatus>("apply", { revision: status.revision, files: work, drafts })); refreshPreview(); toast.success("حُفظت التعديلات محليًا؛ لم تُنشر على GitHub"); });
  };
  const check = () => void run("أفحص المزامنة…", async () => {
    const s = await workspaceCall<WorkspaceStatus>("status");
    if (dirty && s.revision !== status?.revision) throw new Error("تغيّرت الملفات محليًا؛ ألغِ التعديلات المعلقة ثم أعد الفحص");
    if (dirty) setStatus(s); else accept(s);
  });
  const pull = () => {
    if (dirty || status?.dirty.length) { toast.error("احفظ وانشر التعديلات المحلية قبل سحب تحديثات GitHub"); return; }
    void run("أسحب تحديثات GitHub…", async () => { const s = await workspaceCall<WorkspaceStatus>("pull", status ? { revision: status.revision } : {}); accept(s); setDir(""); refreshPreview(); toast.success("جُلبت أحدث ملفات الموقع"); });
  };
  const publish = () => {
    if (!status || !message.trim() || !window.confirm(`نشر ${status.dirty.length} تغيير إلى bundlezone2223/veguto؟ سيؤثر هذا في الموقع الحقيقي.`)) return;
    void run("أنشر التغييرات…", async () => { accept(await workspaceCall<WorkspaceStatus>("publish", { message, revision: status.revision })); setPublishOpen(false); setMessage(""); toast.success("نُشرت التغييرات على GitHub"); });
  };
  const items = useMemo(() => listDir(work, dir), [work, dir]);
  const editable = !!status?.initialized && !busy;
  const statusText = status ? !status.initialized ? "لم يُجلب الموقع بعد" : status.remoteChanged && (status.dirty.length || dirty) ? "تحديثات GitHub وتعديلات محلية — تحتاج مراجعة" : status.remoteChanged ? "توجد تحديثات من GitHub" : status.dirty.length || dirty ? "توجد تعديلات محلية غير منشورة" : "متطابق مع GitHub" : "جارٍ الاتصال…";
  if (!import.meta.env.DEV) return <p role="status" className="py-8 text-center text-muted-foreground">ملفات الموقع المحلية متاحة داخل معاينة المحرر فقط.</p>;
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3 text-sm">
        <Globe size={18} className="shrink-0 text-accent-pink" />
        <a href="https://github.com/bundlezone2223/veguto" target="_blank" rel="noreferrer" dir="ltr" className="break-all font-semibold underline underline-offset-4">bundlezone2223/veguto</a>
        <span role="status" className={`flex items-center gap-1.5 text-xs ${status?.remoteChanged || status?.dirty.length || dirty ? "text-accent-pink" : "text-muted-foreground"}`}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}{busy ?? statusText}
        </span>
        <div className="ms-auto flex flex-wrap gap-1.5">
          <GhostButton onClick={check} disabled={!!busy} ariaLabel="فحص مزامنة الموقع"><RefreshCw size={15} /></GhostButton>
          <GhostButton onClick={pull} disabled={!!busy || !!dirty || !!status?.dirty.length}><ArrowDownToLine size={15} /> سحب التحديثات</GhostButton>
          <PrimaryButton onClick={() => setPublishOpen((v) => !v)} disabled={!!busy || !!dirty || !status?.dirty.length || status.remoteChanged}><Send size={15} /> نشر التغييرات</PrimaryButton>
        </div>
      </div>
      {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {publishOpen && <div className="space-y-3 rounded-md border border-border bg-card p-4"><Field label="رسالة التحديث" dir="auto" value={message} onChange={setMessage} /><div className="flex gap-2"><PrimaryButton onClick={publish} disabled={!!busy || !message.trim()}><Send size={14} /> تأكيد النشر</PrimaryButton><GhostButton onClick={() => setPublishOpen(false)} disabled={!!busy}><X size={14} /> إلغاء</GhostButton></div></div>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="group" aria-label="عرض الموقع">
          {view === "preview" ? <PrimaryButton><Globe size={15} /> معاينة الموقع</PrimaryButton> : <GhostButton onClick={() => setView("preview")}><Globe size={15} /> معاينة الموقع</GhostButton>}
          {view === "files" ? <PrimaryButton><Folder size={15} /> ملفات الموقع</PrimaryButton> : <GhostButton onClick={() => setView("files")}><Folder size={15} /> ملفات الموقع</GhostButton>}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{Object.keys(work).length} ملف{status?.dirty.length ? ` · ${status.dirty.length} تغيير محلي` : ""}</span>
          <GhostButton onClick={refreshPreview} disabled={!status?.initialized || !!busy} ariaLabel="تحديث المعاينة"><RefreshCw size={15} /></GhostButton>
          <GhostButton onClick={() => window.open("/api/site-preview/", "_blank", "noopener,noreferrer")} disabled={!status?.initialized || !!busy} ariaLabel="فتح المعاينة في نافذة مستقلة"><ExternalLink size={15} /></GhostButton>
        </div>
      </div>
      {view === "preview" ? (
        <div className="relative h-[min(72dvh,850px)] min-h-80 overflow-hidden border border-border bg-card">
          {status?.initialized ? <><iframe key={previewVersion} title="معاينة الموقع الرئيسي" src={`/api/site-preview/?v=${previewVersion}`} sandbox="allow-scripts allow-forms allow-popups allow-modals" onLoad={() => setFrameLoading(false)} className="h-full w-full border-0" />{frameLoading && <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center gap-2 bg-card/90 py-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" /> أفتح المعاينة…</div>}</> : <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">{busy ? <Loader2 size={18} className="animate-spin" /> : <Globe size={22} />}{busy ?? "اسحب الموقع لفتح المعاينة"}</div>}
        </div>
      ) : (
        <div className="min-w-0 space-y-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2"><GhostButton onClick={() => go("")}><Folder size={14} /> site/</GhostButton><span dir="ltr" className="min-w-0 break-all font-mono text-xs text-muted-foreground">{dir || "/"}</span><span className="ms-auto text-xs text-muted-foreground">{items.length} عنصر</span></div>
          {pending.length > 0 && <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-accent-pink/40 bg-hero-from p-2 text-sm"><span className="flex-1">{pending.length} تعديل معلق</span><PrimaryButton onClick={saveBatch} disabled={!!busy || !!unsavedText}><Check size={14} /> تأكيد</PrimaryButton><GhostButton onClick={() => { if (status && (!dirty || confirm("إلغاء كل التعديلات المعلقة؟"))) accept(status); }} disabled={!!busy}><X size={14} /> إلغاء</GhostButton></div>}
          {open ? <div className="space-y-2">
            <div className="flex flex-wrap gap-2"><GhostButton onClick={() => { if (leave()) setOpen(null); }}>رجوع</GhostButton><span dir="ltr" className="min-w-0 flex-1 break-all self-center font-mono text-xs">{open.path}</span>{open.text !== null && <GhostButton onClick={() => void copyText()}><Copy size={14} /> نسخ النص</GhostButton>}{open.text !== null && open.draft === undefined && <GhostButton onClick={() => setOpen({ ...open, draft: open.text ?? "" })} disabled={!editable}><FilePen size={14} /> تعديل</GhostButton>}{open.draft !== undefined && <><PrimaryButton onClick={saveText} disabled={!!busy}><Save size={14} /> حفظ التعديل</PrimaryButton><GhostButton onClick={() => setOpen({ path: open.path, text: open.text })}><X size={14} /> إلغاء</GhostButton></>}</div>
            {open.draft !== undefined ? <textarea dir="ltr" aria-label={`تعديل ${baseName(open.path)}`} value={open.draft} onChange={(e) => setOpen({ ...open, draft: e.target.value })} spellCheck={false} wrap="off" className="h-[min(60dvh,600px)] w-full resize-y rounded-md border border-accent-pink bg-background p-3 font-mono text-xs leading-5 outline-none" /> : <pre dir="ltr" className="max-h-[60dvh] overflow-auto rounded-md border border-border bg-card p-3 font-mono text-xs">{open.text ?? "ملف غير نصي"}</pre>}
          </div> : <>
            <div className="flex flex-wrap gap-1.5"><GhostButton onClick={() => { if (confirm(`حذف ${selected.length} عنصر ضمن التعديلات المعلقة؟`)) change(() => removePaths(work, selected)); }} disabled={!editable || !selected.length}><Trash2 size={14} /> حذف</GhostButton><GhostButton onClick={() => setClip({ mode: "copy", paths: selected })} disabled={!editable || !selected.length}><Copy size={14} /> نسخ</GhostButton><GhostButton onClick={() => setClip({ mode: "cut", paths: selected })} disabled={!editable || !selected.length}><Scissors size={14} /> قص</GhostButton><GhostButton onClick={() => { const p = selected[0]; if (p) setRename({ path: p, name: baseName(p) }); }} disabled={!editable || selected.length !== 1}><Pencil size={14} /> إعادة تسمية</GhostButton><GhostButton onClick={() => { if (clip) { change(() => clip.mode === "copy" ? copyPaths(work, clip.paths, dir) : movePaths(work, clip.paths, dir)); if (clip.mode === "cut") setClip(null); } }} disabled={!editable || !clip}><ClipboardPaste size={14} /> لصق{clip ? ` (${clip.paths.length})` : ""}</GhostButton></div>
            {rename && <div className="flex flex-wrap gap-2"><SmallInput ariaLabel="الاسم الجديد" value={rename.name} onChange={(name) => setRename({ ...rename, name })} /><PrimaryButton onClick={() => { change(() => renamePath(work, rename.path, rename.name)); setRename(null); }}><Check size={14} /> تأكيد الاسم</PrimaryButton><GhostButton onClick={() => setRename(null)}>إلغاء</GhostButton></div>}
            <ul dir="ltr" className="max-h-[60dvh] divide-y divide-border overflow-auto rounded-md border border-border text-sm">
              {dir && <li><GhostButton onClick={() => go(parentDir(dir))} ariaLabel="رجوع للمجلد السابق"><Folder size={15} /> ..</GhostButton></li>}
              {!items.length && <li className="p-4 text-muted-foreground">{busy ?? "المجلد فارغ"}</li>}
              {items.map((item) => <li key={item.path} className={`flex min-w-0 items-center gap-2 p-2 ${clip?.mode === "cut" && clip.paths.includes(item.path) ? "opacity-50" : ""}`}><input type="checkbox" aria-label={`تحديد ${item.name}`} checked={selected.includes(item.path)} disabled={!editable} onChange={() => setSelected((s) => s.includes(item.path) ? s.filter((p) => p !== item.path) : [...s, item.path])} /><GhostButton onClick={() => item.type === "tree" ? go(item.path) : void readFile(item.path)} disabled={!!busy}>{item.type === "tree" ? <Folder size={15} className="shrink-0 text-accent-pink" /> : <FileText size={15} className="shrink-0 text-muted-foreground" />}<span className="break-all text-start">{item.name}</span></GhostButton>{isLocalSha(work[item.path]?.sha) && <span className="text-accent-pink">•</span>}</li>)}
            </ul>
          </>}
        </div>
      )}
    </div>
  );
}