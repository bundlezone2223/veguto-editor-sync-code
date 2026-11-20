import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CloudOff, CloudUpload, ExternalLink, Globe, Loader2, Lock, LockOpen, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteProject, type Project } from "@/lib/projects-store";
import { HISTORY_REPO, SITE_REPO } from "@/lib/github-api";
import {
  EDITOR_ARTICLES_DIR, EDITOR_BRANCH, SITE_ARTICLES_DIR, SITE_BRANCH, buildRows, deleteFromGithub, loadLibrary, makeDraft, makePrivate,
  openInEditor, publishRow, rowCategory, rowsToAutoSave, saveToEditorRepo, type ArticleRow, type ArticleStatus, type LibraryState,
} from "@/lib/article-library";
import { GhostButton, Panel } from "./ui";

const BADGE: Record<ArticleStatus, { text: string; cls: string }> = {
  published: { text: "منشور", cls: "bg-hero-from text-accent-pink" },
  draft: { text: "مسودة", cls: "bg-muted text-muted-foreground" },
  private: { text: "خاص", cls: "bg-hero-to text-accent-purple" },
};
type Filter = "all" | ArticleStatus;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "الكل" }, { id: "published", label: "منشور" }, { id: "draft", label: "مسودة" }, { id: "private", label: "خاص" },
];
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function ArticlesPanel({ projects, onProjectsChanged }: { projects: Project[]; onProjectsChanged: () => Promise<void> }) {
  const navigate = useNavigate();
  const [lib, setLib] = useState<LibraryState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [autoSaving, setAutoSaving] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const autoTried = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    setLoadError("");
    try { setLib(await loadLibrary()); } catch (e) { setLoadError(errText(e)); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const rows = useMemo(() => (lib ? buildRows(projects, lib) : []), [projects, lib]);

  // Every draft / private article changed in this browser is saved to the editor repo automatically.
  useEffect(() => {
    if (!lib || busy || autoSaving) return;
    const todo = rowsToAutoSave(rows).filter((r) => !autoTried.current.has(`${r.key}:${r.project!.updatedAt}`));
    if (todo.length === 0) return;
    todo.forEach((r) => autoTried.current.add(`${r.key}:${r.project!.updatedAt}`));
    setAutoSaving(todo.length);
    void (async () => {
      try {
        await saveToEditorRepo(todo.map((r) => r.project!));
        await onProjectsChanged();
        await refresh();
      } catch (e) { toast.error(`تعذر حفظ المسودات على GitHub: ${errText(e)}`); }
      finally { setAutoSaving(0); }
    })();
  }, [lib, rows, busy, autoSaving, onProjectsChanged, refresh]);

  const run = async (row: ArticleRow, label: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(`${row.key}:${label}`);
    try {
      await fn();
      await onProjectsChanged();
      await refresh();
      toast.success(done);
    } catch (e) { toast.error(`تعذر ${label}: ${errText(e)}`); }
    finally { setBusy(null); }
  };

  const publish = (row: ArticleRow) => {
    const cat = rowCategory(row);
    if (lib?.siteCategories && row.project && !lib.siteCategories.includes(cat)) {
      if (!confirm(`التصنيف «${cat || "بدون تصنيف"}» غير موجود في الموقع الرئيسي، لذلك لن يظهر المقال هناك.\nالتصنيفات المقبولة: ${lib.siteCategories.join("، ")}\n\nالنشر رغم ذلك؟`)) return;
    }
    void run(row, "النشر", () => publishRow(row), row.status === "published" ? "حُدّث المقال على الموقع الرئيسي" : "نُشر المقال على الموقع الرئيسي");
  };
  const lock = (row: ArticleRow) => {
    if (row.status === "published" && !confirm(`إخفاء «${row.title}» من الموقع الرئيسي؟ سيُحفظ في ${HISTORY_REPO} كمقال خاص.`)) return;
    void run(row, "القفل", () => makePrivate(row), "صار المقال خاصاً ولا يظهر في الموقع");
  };
  const unlock = (row: ArticleRow) => void run(row, "إلغاء القفل", () => makeDraft(row), "صار المقال مسودة يمكن نشرها");
  const remove = (row: ArticleRow) => {
    const where = row.status === "published" ? "من الموقع الرئيسي" : `من ${HISTORY_REPO}`;
    if (!confirm(`حذف «${row.title}» نهائياً؟\nسيُحذف ${row.onGithub ? where : ""}${row.project ? " ومن هذا المتصفح" : ""}. تبقى نسخته القديمة في سجل GitHub.`)) return;
    void run(row, "الحذف", async () => {
      await deleteFromGithub(row);
      if (row.project) await deleteProject(row.project.id);
    }, "حُذف المقال");
  };
  const edit = async (row: ArticleRow) => {
    setBusy(`${row.key}:open`);
    try {
      const p = await openInEditor(row);
      navigate({ to: "/studio/$id", params: { id: p.id } });
    } catch (e) { toast.error(`تعذر فتح المقال: ${errText(e)}`); setBusy(null); }
  };

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, published: 0, draft: 0, private: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);
  const shown = rows.filter((r) => filter === "all" || r.status === filter);
  const spin = (row: ArticleRow, label: string) => busy === `${row.key}:${label}`;

  return (
    <Panel
      title="المقالات"
      desc={`المنشورة تظهر في الموقع الرئيسي (${SITE_REPO}). المسودات والخاصة تُحفظ تلقائياً في ${HISTORY_REPO} ولا تظهر في الموقع.`}
      actions={<GhostButton ariaLabel="تحديث القائمة" disabled={!!busy} onClick={() => void refresh()}><RefreshCw size={14} /> تحديث</GhostButton>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f.id ? "bg-accent-pink text-card" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
            {f.label} ({counts[f.id]})
          </button>
        ))}
        {autoSaving > 0 && <span role="status" className="ms-auto flex items-center gap-1 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" /> حفظ {autoSaving} على GitHub…</span>}
      </div>

      {loadError && <p className="mb-2 rounded-md bg-muted p-2 text-xs text-destructive">تعذر قراءة GitHub: {loadError}</p>}
      {!lib && !loadError ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" /> جارٍ تحميل المقالات…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد مقالات هنا.</p>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((row) => {
            const p = row.project;
            const cat = rowCategory(row);
            const badCat = !!p && !!lib?.siteCategories && !lib.siteCategories.includes(cat);
            const ghUrl = row.onGithub
              ? row.status === "published"
                ? `https://github.com/${SITE_REPO}/blob/${SITE_BRANCH}/${SITE_ARTICLES_DIR}/${encodeURIComponent(row.entry?.file ?? row.file)}`
                : `https://github.com/${HISTORY_REPO}/blob/${EDITOR_BRANCH}/${EDITOR_ARTICLES_DIR}/${encodeURIComponent(row.entry?.file ?? row.file)}`
              : null;
            return (
              <li key={row.key} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="h-10 w-20 shrink-0 overflow-hidden rounded-md bg-muted">{p?.thumbnail && <img src={p.thumbnail} alt="" className="h-full w-full object-cover" />}</div>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-sm font-medium" dir="auto">{row.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${BADGE[row.status].cls}`}>
                      {row.status === "private" && <Lock size={10} />}{BADGE[row.status].text}
                    </span>
                    {!p && <span>على GitHub فقط</span>}
                    {p && row.status === "published" && row.changed && <span className="text-accent-purple">تغيّر بعد النشر</span>}
                    {p && row.status !== "published" && (row.changed
                      ? <span className="inline-flex items-center gap-1"><CloudOff size={11} /> لم يُحفظ على GitHub بعد</span>
                      : <span className="inline-flex items-center gap-1"><CloudUpload size={11} /> محفوظ على GitHub</span>)}
                    {badCat && <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle size={11} /> التصنيف «{cat || "—"}» غير موجود في الموقع</span>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {ghUrl && <a href={ghUrl} target="_blank" rel="noreferrer" aria-label="عرض على GitHub" className="p-1 text-muted-foreground hover:text-foreground"><ExternalLink size={16} /></a>}
                  <GhostButton disabled={!!busy} onClick={() => void edit(row)}>{spin(row, "open") ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />} تعديل</GhostButton>
                  {row.status === "private" ? (
                    <GhostButton disabled={!!busy} onClick={() => unlock(row)}>{spin(row, "إلغاء القفل") ? <Loader2 size={14} className="animate-spin" /> : <LockOpen size={14} />} إلغاء القفل</GhostButton>
                  ) : (
                    <>
                      {(row.status === "draft" || p) && (
                        <GhostButton disabled={!!busy} onClick={() => publish(row)}>
                          {spin(row, "النشر") ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />} {row.status === "published" ? "تحديث على الموقع" : "نشر"}
                        </GhostButton>
                      )}
                      <GhostButton disabled={!!busy} onClick={() => lock(row)}>{spin(row, "القفل") ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />} خاص</GhostButton>
                    </>
                  )}
                  <GhostButton ariaLabel={`حذف ${row.title}`} disabled={!!busy} onClick={() => remove(row)}>{spin(row, "الحذف") ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}</GhostButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
