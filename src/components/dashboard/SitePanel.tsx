import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, Eye, FilePlus, FileText, Folder, FolderPlus, GitCommit, Globe, History, Loader2, Pencil, RefreshCw, RotateCcw, Save, Send, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { baseName, exists, isLocalSha, listDir, parentDir, pathsUnder, removePaths, renamePath, setFileSha, treeChanges, uploadDrafts, type RepoFiles } from "@/lib/repo-edits";
import { SITE_REPO, branchHead, commitChanges, commitTreeEdits, createBase64Blob, createTextBlob, listCommits, listTree, readBlobText, recordHistory, restoreVersion, type ChangedFile, type CommitInfo } from "@/lib/github-api";
import { lineDiff } from "@/lib/line-diff";
import { Field, GhostButton, PrimaryButton } from "./ui";
import { SiteFrame } from "./SiteFrame";

const BRANCH = "main";
const STORE = "veguto:site-workspace";
type Saved = { base: string; work: RepoFiles; drafts: Record<string, string> };
type OpenFile = { path: string; sha: string; text: string | null; draft: string };
type Browse = { sha: string; label: string; files: RepoFiles } | null;

const toFiles = (entries: Awaited<ReturnType<typeof listTree>>): RepoFiles =>
  Object.fromEntries(entries.filter((e) => e.type === "blob" && e.sha).map((e) => [e.path, { sha: e.sha!, mode: e.mode ?? "100644" }]));
const validPath = (p: string) => !!p && !p.startsWith("/") && !p.endsWith("/") && !p.split("/").some((s) => !s || s === "." || s === "..");

export function SitePanel({ active }: { active: boolean }) {
  const [base, setBase] = useState<{ sha: string; files: RepoFiles } | null>(null);
  const [work, setWork] = useState<RepoFiles>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"preview" | "files" | "changes" | "history">("preview");
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["src"]));
  const [open, setOpen] = useState<OpenFile | null>(null);
  const [browse, setBrowse] = useState<Browse>(null);
  const [message, setMessage] = useState("");
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<{ sha: string; files: ChangedFile[] | null } | null>(null);
  const started = useRef(false), seq = useRef(0), uploadRef = useRef<HTMLInputElement>(null);
  const textCache = useRef<Record<string, string | null>>({});

  const pending = useMemo(() => treeChanges(base?.files ?? {}, work), [base, work]);
  const unsaved = !!open && !browse && open.text !== null && open.draft !== open.text;
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setError(null);
    try { await fn(); } catch (e) { const m = e instanceof Error ? e.message : "تعذرت العملية"; setError(m); toast.error(m); } finally { setBusy(null); }
  };

  const load = useCallback((keepDrafts: boolean) => run("أقرأ ملفات الموقع من GitHub…", async () => {
    let saved: Saved | null = null;
    if (keepDrafts) { try { saved = JSON.parse(localStorage.getItem(STORE) ?? "null") as Saved | null; } catch { saved = null; } }
    const head = await branchHead(SITE_REPO, BRANCH);
    if (!head) throw new Error("المستودع فارغ");
    const ref = saved && Object.keys(saved.work).length ? saved.base : head;
    const files = toFiles(await listTree(SITE_REPO, ref));
    setBase({ sha: ref, files });
    setWork(saved && ref === saved.base ? saved.work : files);
    setDrafts(saved?.drafts ?? {}); setOpen(null);
    if (ref !== head) toast.warning("توجد تحديثات أحدث على GitHub منذ حُفظت مسوداتك؛ انشرها أو تجاهلها لجلب الأحدث");
  }), []);

  useEffect(() => { if (active && !started.current) { started.current = true; void load(true); } }, [active, load]);
  useEffect(() => {
    if (!base) return;
    try {
      if (pending.length) localStorage.setItem(STORE, JSON.stringify({ base: base.sha, work, drafts } satisfies Saved));
      else localStorage.removeItem(STORE);
    } catch { toast.error("تعذر حفظ المسودة محليًا (الحجم كبير)"); }
  }, [base, work, drafts, pending.length]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (unsaved) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const textOf = async (sha: string): Promise<string | null> => {
    if (isLocalSha(sha)) return drafts[sha] ?? "";
    if (!(sha in textCache.current)) textCache.current[sha] = await readBlobText(SITE_REPO, sha);
    return textCache.current[sha] ?? null;
  };
  const leave = () => !unsaved || window.confirm("تجاهل التعديل غير المحفوظ في الملف المفتوح؟");
  const openFile = async (path: string) => {
    if (!leave()) return;
    const files = browse?.files ?? work, sha = files[path]?.sha;
    if (!sha) return;
    const req = ++seq.current;
    setBusy("أفتح الملف…");
    try { const text = await textOf(sha); if (seq.current === req) setOpen({ path, sha, text, draft: text ?? "" }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "تعذر فتح الملف"); } finally { setBusy(null); }
  };
  const saveDraft = () => {
    if (!open || !unsaved) return;
    const sha = `local:${Date.now()}-${++seq.current}`;
    setDrafts((d) => ({ ...d, [sha]: open.draft })); setWork((w) => setFileSha(w, open.path, sha));
    setOpen({ ...open, sha, text: open.draft }); toast.success("حُفظ ضمن التعديلات المعلقة");
  };
  const edit = (fn: (w: RepoFiles) => RepoFiles) => { try { setWork(fn); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } };
  const addFile = (path: string, sha: string) => setWork((w) => ({ ...w, [path]: { sha, mode: "100644" } }));
  const newFile = (folder: boolean) => {
    const dir = open ? parentDir(open.path) : "";
    const name = window.prompt(folder ? "اسم المجلد الجديد (مسار كامل)" : "اسم الملف الجديد (مسار كامل)", dir ? `${dir}/` : "")?.trim();
    if (!name) return;
    const path = folder ? `${name.replace(/\/+$/, "")}/.gitkeep` : name;
    if (!validPath(path)) { toast.error("مسار غير صالح"); return; }
    if (exists(work, folder ? parentDir(path) : path)) { toast.error("يوجد ملف أو مجلد بهذا الاسم"); return; }
    const sha = `local:${Date.now()}-${++seq.current}`;
    setDrafts((d) => ({ ...d, [sha]: "" })); addFile(path, sha);
    setExpanded((s) => new Set([...s, ...path.split("/").slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join("/"))]));
    if (!folder) setOpen({ path, sha, text: "", draft: "" });
  };
  const remove = (path: string) => {
    const n = pathsUnder(work, path).length;
    if (!window.confirm(`حذف «${path}»${n > 1 ? ` (${n} ملفات)` : ""}؟`)) return;
    edit((w) => removePaths(w, [path])); if (open && (open.path === path || open.path.startsWith(`${path}/`))) setOpen(null);
  };
  const rename = (path: string) => {
    const name = window.prompt("الاسم الجديد", baseName(path))?.trim();
    if (!name || name === baseName(path)) return;
    edit((w) => renamePath(w, path, name)); setOpen(null);
  };
  const upload = (list: FileList | null) => {
    if (!list?.length) return;
    const dir = open ? parentDir(open.path) : "";
    const target = window.prompt("المجلد الذي تُرفع إليه الملفات", dir)?.trim().replace(/^\/+|\/+$/g, "");
    if (target === undefined) return;
    void run("أرفع الملفات…", async () => {
      for (const f of Array.from(list)) {
        const path = target ? `${target}/${f.name}` : f.name;
        if (!validPath(path)) throw new Error(`مسار غير صالح: ${path}`);
        const bytes = new Uint8Array(await f.arrayBuffer());
        let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        addFile(path, await createBase64Blob(SITE_REPO, btoa(bin)));
      }
      toast.success("أُضيفت الملفات إلى التعديلات المعلقة");
    });
  };
  const discard = () => { if (window.confirm("تجاهل كل التعديلات المعلقة وجلب أحدث نسخة؟")) { localStorage.removeItem(STORE); void load(false); } };
  const publish = () => {
    if (!base || !message.trim() || !pending.length || !leave()) return;
    if (!window.confirm(`نشر ${pending.length} تغيير إلى ${SITE_REPO} في Commit واحد؟ سيؤثر هذا في الموقع الحقيقي.`)) return;
    void run("أنشر التغييرات…", async () => {
      const entries = await uploadDrafts(pending, drafts, (t) => createTextBlob(SITE_REPO, t));
      const c = await commitTreeEdits(SITE_REPO, BRANCH, base.sha, message.trim(), entries);
      recordHistory({ sha: c.sha, message: message.trim(), repo: SITE_REPO, files: pending.map((p) => ({ filename: p.path, status: p.sha ? (base.files[p.path] ? "modified" : "added") : "removed", additions: 0, deletions: 0 })) }).catch(() => undefined);
      localStorage.removeItem(STORE); setMessage(""); setView("files");
      toast.success("نُشرت التغييرات على GitHub");
      await load(false);
    });
  };
  const loadCommits = (p: number) => run("أقرأ سجل التحديثات…", async () => {
    const list = await listCommits(SITE_REPO, BRANCH, p);
    setCommits((c) => (p === 1 ? list : [...c, ...list])); setPage(p);
  });
  useEffect(() => { if (view === "history" && !commits.length) void loadCommits(1); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (sha: string) => { if (picked?.sha === sha) { setPicked(null); return; } setPicked({ sha, files: null }); commitChanges(SITE_REPO, sha).then((files) => setPicked((p) => (p?.sha === sha ? { sha, files } : p))).catch((e) => toast.error(String(e))); };
  const browseAt = (c: CommitInfo) => { if (!leave()) return; void run("أقرأ ملفات هذا الإصدار…", async () => { setBrowse({ sha: c.sha, label: c.message.split("\n")[0] ?? c.sha, files: toFiles(await listTree(SITE_REPO, c.sha)) }); setOpen(null); setView("files"); }); };
  const restore = (c: CommitInfo) => {
    if (pending.length) { toast.error("انشر التعديلات المعلقة أو تجاهلها قبل الاسترجاع"); return; }
    if (!window.confirm(`استرجاع الموقع إلى الإصدار ${c.sha.slice(0, 7)}؟ سيُنشأ Commit جديد يعيد الملفات كما كانت.`)) return;
    void run("أسترجع الإصدار…", async () => {
      const r = await restoreVersion(SITE_REPO, BRANCH, c.sha, `استرجاع الإصدار ${c.sha.slice(0, 7)}: ${c.message.split("\n")[0] ?? ""}`);
      toast.success(`استُرجع الإصدار (${r.sha.slice(0, 7)})`); setBrowse(null); setPicked(null);
      await load(false); await loadCommits(1);
    });
  };

  const files = browse?.files ?? work;
  const Tree = ({ dir, depth }: { dir: string; depth: number }) => (
    <ul>{listDir(files, dir).map((it) => {
      const isOpen = expanded.has(it.path), changed = !browse && pending.some((p) => p.path === it.path || p.path.startsWith(`${it.path}/`));
      return (
        <li key={it.path}>
          <div className={`group flex items-center gap-1 rounded px-1 py-0.5 text-sm hover:bg-muted ${open?.path === it.path ? "bg-muted font-semibold" : ""}`} style={{ paddingInlineStart: depth * 12 + 4 }}>
            <button type="button" dir="ltr" className="flex min-w-0 flex-1 items-center gap-1 text-start"
              onClick={() => (it.type === "tree" ? setExpanded((s) => { const n = new Set(s); if (n.has(it.path)) n.delete(it.path); else n.add(it.path); return n; }) : void openFile(it.path))}>
              {it.type === "tree" ? <>{isOpen ? <ChevronDown size={13} /> : <ChevronLeft size={13} />}<Folder size={14} className="shrink-0 text-accent-pink" /></> : <FileText size={14} className="ms-3 shrink-0 text-muted-foreground" />}
              <span className="truncate">{it.name}</span>{changed && <span className="size-1.5 shrink-0 rounded-full bg-accent-pink" />}
            </button>
            {!browse && <span className="flex shrink-0 gap-0.5 opacity-60 group-hover:opacity-100">
              <button type="button" aria-label={`إعادة تسمية ${it.name}`} onClick={() => rename(it.path)} className="rounded p-0.5 hover:bg-card"><Pencil size={12} /></button>
              <button type="button" aria-label={`حذف ${it.name}`} onClick={() => remove(it.path)} className="rounded p-0.5 hover:bg-card"><Trash2 size={12} /></button>
            </span>}
          </div>
          {it.type === "tree" && isOpen && <Tree dir={it.path} depth={depth + 1} />}
        </li>
      );
    })}</ul>
  );

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3 text-sm">
        <Globe size={18} className="shrink-0 text-accent-pink" />
        <a href={`https://github.com/${SITE_REPO}`} target="_blank" rel="noreferrer" dir="ltr" className="font-semibold underline underline-offset-4">{SITE_REPO}</a>
        <span role="status" className={`flex items-center gap-1.5 text-xs ${pending.length ? "text-accent-pink" : "text-muted-foreground"}`}>
          {busy && <Loader2 size={14} className="animate-spin" />}{busy ?? (pending.length ? `${pending.length} تعديل معلق غير منشور` : base ? `متطابق مع GitHub · ${base.sha.slice(0, 7)}` : "")}
        </span>
        <div className="ms-auto flex flex-wrap gap-1.5">
          <GhostButton onClick={() => (pending.length ? discard() : void load(false))} disabled={!!busy} ariaLabel="تحديث من GitHub"><RefreshCw size={15} /></GhostButton>
          <PrimaryButton onClick={() => setView("changes")} disabled={!!busy || !pending.length}><Send size={15} /> نشر إلى {SITE_REPO}</PrimaryButton>
        </div>
      </div>
      {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="أقسام الموقع الرئيسي">
        {([["preview", "الموقع", Eye], ["files", "الملفات", Folder], ["changes", `التعديلات (${pending.length})`, GitCommit], ["history", "سجل التحديثات", History]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${view === id ? "bg-accent-pink text-card" : "border border-border bg-card hover:bg-muted"}`}><Icon size={15} />{label}</button>
        ))}
      </div>

      {view === "preview" && <SiteFrame />}

      {view === "files" && (
        <div className="space-y-2">
          {browse && <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent-pink/40 bg-accent-pink/10 p-2 text-sm"><Eye size={15} /> تتصفح إصدارًا سابقًا (للقراءة فقط): <span dir="auto" className="font-semibold">{browse.label}</span> <code dir="ltr">{browse.sha.slice(0, 7)}</code><button type="button" className="ms-auto underline" onClick={() => { setBrowse(null); setOpen(null); }}>العودة للنسخة الحالية</button></div>}
          {!browse && <div className="flex flex-wrap gap-1.5">
            <GhostButton onClick={() => newFile(false)} disabled={!base || !!busy}><FilePlus size={15} /> ملف جديد</GhostButton>
            <GhostButton onClick={() => newFile(true)} disabled={!base || !!busy}><FolderPlus size={15} /> مجلد جديد</GhostButton>
            <GhostButton onClick={() => uploadRef.current?.click()} disabled={!base || !!busy}><Upload size={15} /> رفع ملفات</GhostButton>
            <input ref={uploadRef} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </div>}
          <div className="grid min-h-[60vh] gap-2 md:grid-cols-[260px_minmax(0,1fr)]">
            <nav aria-label="شجرة الملفات" className="max-h-[70vh] overflow-auto rounded-md border border-border bg-card p-1">{base ? <Tree dir="" depth={0} /> : <p className="p-3 text-sm text-muted-foreground">جارٍ التحميل…</p>}</nav>
            <div className="flex min-w-0 flex-col rounded-md border border-border bg-card">
              {open ? <>
                <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
                  <span dir="ltr" className="min-w-0 truncate font-mono">{open.path}</span>{unsaved && <span className="shrink-0 text-xs text-accent-pink">● غير محفوظ</span>}
                  <span className="ms-auto flex shrink-0 gap-1.5">
                    {!browse && open.text !== null && <PrimaryButton onClick={saveDraft} disabled={!unsaved}><Save size={14} /> حفظ</PrimaryButton>}
                    <GhostButton onClick={() => { if (leave()) setOpen(null); }} ariaLabel="إغلاق الملف"><X size={14} /></GhostButton>
                  </span>
                </div>
                {open.text === null ? <p className="p-4 text-sm text-muted-foreground">ملف ثنائي (صورة أو غيرها) لا يمكن تحريره هنا؛ يمكن حذفه أو استبداله بالرفع.</p>
                  : <textarea dir="ltr" spellCheck={false} readOnly={!!browse} aria-label="محتوى الملف" value={open.draft}
                      onChange={(e) => setOpen({ ...open, draft: e.target.value })}
                      onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); saveDraft(); } if (e.key === "Tab" && !browse) { e.preventDefault(); const t = e.currentTarget, s = t.selectionStart; const v = `${t.value.slice(0, s)}  ${t.value.slice(t.selectionEnd)}`; setOpen({ ...open, draft: v }); requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2)); } }}
                      className="min-h-[60vh] w-full flex-1 resize-none bg-background p-3 font-mono text-[13px] leading-5 outline-none" />}
              </> : <p className="m-auto p-6 text-sm text-muted-foreground">اختر ملفًا من الشجرة لفتحه.</p>}
            </div>
          </div>
        </div>
      )}

      {view === "changes" && (
        <div className="space-y-3">
          {pending.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">لا توجد تعديلات معلقة.</p> : <>
            <div className="space-y-2 rounded-md border border-border bg-card p-3">
              <Field label="رسالة التحديث" dir="auto" value={message} onChange={setMessage} />
              <div className="flex flex-wrap gap-2">
                <PrimaryButton onClick={publish} disabled={!!busy || !message.trim()}><Send size={14} /> نشر {pending.length} تغيير إلى {SITE_REPO}</PrimaryButton>
                <GhostButton onClick={discard} disabled={!!busy}><Trash2 size={14} /> تجاهل كل التعديلات</GhostButton>
              </div>
            </div>
            {pending.map((p) => <ChangeDiff key={p.path} path={p.path} before={base?.files[p.path]?.sha ?? null} after={p.sha} textOf={textOf} />)}
          </>}
        </div>
      )}

      {view === "history" && (
        <ul className="space-y-2">
          {commits.map((c, i) => (
            <li key={c.sha} className="rounded-md border border-border bg-card p-3 text-sm">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <button type="button" onClick={() => pick(c.sha)} className="min-w-0 text-start">
                  <span dir="auto" className="block font-semibold">{c.message.split("\n")[0]}</span>
                  <span className="text-xs text-muted-foreground"><code dir="ltr">{c.sha.slice(0, 7)}</code> · {new Date(c.date).toLocaleString("ar")} · {c.author}{i === 0 && " · الحالي"}</span>
                </button>
                <span className="flex flex-wrap justify-end gap-1.5">
                  <GhostButton onClick={() => browseAt(c)} disabled={!!busy}><Eye size={14} /> تصفح</GhostButton>
                  {i > 0 && <GhostButton onClick={() => restore(c)} disabled={!!busy}><RotateCcw size={14} /> استرجاع هذا الإصدار</GhostButton>}
                </span>
              </div>
              {picked?.sha === c.sha && <div className="mt-2 border-t border-border pt-2" dir="ltr">{picked.files ? picked.files.map((f) => (
                <div key={f.filename} className="flex gap-2 font-mono text-xs"><span className="w-16 shrink-0 text-muted-foreground">{f.status}</span><span className="min-w-0 flex-1 truncate">{f.filename}</span><span className="text-green-600">+{f.additions}</span><span className="text-destructive">-{f.deletions}</span></div>
              )) : <Loader2 size={14} className="animate-spin" />}</div>}
            </li>
          ))}
          {commits.length > 0 && commits.length % 30 === 0 && <li><GhostButton onClick={() => void loadCommits(page + 1)} disabled={!!busy}>تحميل المزيد</GhostButton></li>}
        </ul>
      )}
    </div>
  );
}

function ChangeDiff({ path, before, after, textOf }: { path: string; before: string | null; after: string | null; textOf: (sha: string) => Promise<string | null> }) {
  const [lines, setLines] = useState<ReturnType<typeof lineDiff> | "binary" | null>(null);
  const [show, setShow] = useState(true);
  useEffect(() => {
    let live = true;
    void Promise.all([before ? textOf(before) : "", after ? textOf(after) : ""]).then(([a, b]) => { if (live) setLines(a === null || b === null ? "binary" : lineDiff(a, b)); }).catch(() => live && setLines("binary"));
    return () => { live = false; };
  }, [before, after]); // eslint-disable-line react-hooks/exhaustive-deps
  const kind = !before ? "جديد" : !after ? "محذوف" : "معدّل";
  return (
    <div className="rounded-md border border-border bg-card text-sm">
      <button type="button" onClick={() => setShow((s) => !s)} className="flex w-full items-center gap-2 px-3 py-2 text-start">
        {show ? <ChevronDown size={14} /> : <ChevronLeft size={14} />}<span className="rounded bg-muted px-1.5 text-xs">{kind}</span><span dir="ltr" className="min-w-0 truncate font-mono">{path}</span>
      </button>
      {show && <div dir="ltr" className="max-h-96 overflow-auto border-t border-border font-mono text-xs">
        {lines === null ? <p className="p-2">…</p> : lines === "binary" ? <p className="p-2 text-muted-foreground">ملف ثنائي</p>
          : lines.filter((l, i, a) => l.type !== " " || a.slice(Math.max(0, i - 3), i + 4).some((x) => x.type !== " ")).map((l, i) => (
            <div key={i} className={`whitespace-pre px-2 ${l.type === "+" ? "bg-green-500/10 text-green-700" : l.type === "-" ? "bg-destructive/10 text-destructive" : "text-muted-foreground"}`}>{l.type} {l.text}</div>
          ))}
      </div>}
    </div>
  );
}
