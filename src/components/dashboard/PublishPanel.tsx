import { useMemo, useState } from "react";
import { ExternalLink, Globe, Loader2, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import type { Project } from "@/lib/projects-store";
import { commitFiles, isRepoName, loadGithubSettings, readRepoJson } from "@/lib/github-api";
import {
  CONTENT_DIR, buildArticleFiles, loadPublishRecords, mergeIndex, publishState, removeFromIndex, savePublishRecords,
  type ArticleIndex, type PublishState,
} from "@/lib/publish-article";
import { GhostButton, Panel, PrimaryButton } from "./ui";

const BADGE: Record<PublishState, { text: string; cls: string }> = {
  draft: { text: "مسودة", cls: "bg-muted text-muted-foreground" },
  published: { text: "منشور", cls: "bg-hero-from text-accent-pink" },
  changed: { text: "تغيّر بعد النشر", cls: "bg-hero-to text-accent-purple" },
};

export function PublishPanel({ projects, onNeedSettings }: { projects: Project[]; onNeedSettings: () => void }) {
  const [records, setRecords] = useState(loadPublishRecords);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const settings = loadGithubSettings();
  const ready = !!settings.token && isRepoName(settings.siteRepo);

  const states = useMemo(() => new Map(projects.map((p) => [p.id, publishState(p, records[p.id])])), [projects, records]);

  const publish = async (list: Project[]) => {
    if (!ready) { onNeedSettings(); return; }
    if (list.length === 0) return;
    setBusy("publish");
    try {
      const built = [];
      for (const [i, p] of list.entries()) {
        setProgress(`تجهيز ${i + 1} من ${list.length}…`);
        built.push(await buildArticleFiles(p));
      }
      const index = await readRepoJson<ArticleIndex>(settings.token, settings.siteRepo, settings.siteBranch, `${CONTENT_DIR}/articles/index.json`);
      const merged = mergeIndex(index, built.map((b) => b.article));
      const files = [...built.flatMap((b) => b.files), { path: `${CONTENT_DIR}/articles/index.json`, text: JSON.stringify(merged, null, 2) }];
      const unique = [...new Map(files.map((f) => [f.path, f])).values()];
      const res = await commitFiles({
        token: settings.token, repo: settings.siteRepo, branch: settings.siteBranch,
        message: list.length === 1 ? `Publish: ${built[0]!.article.title}` : `Publish ${list.length} articles`,
        files: unique, onProgress: (d, t) => setProgress(`رفع ${d} من ${t} ملف…`),
      });
      const next = { ...records };
      for (const [i, p] of list.entries()) next[p.id] = { slug: built[i]!.article.slug, publishedAt: Date.now(), articleUpdatedAt: p.updatedAt };
      savePublishRecords(next);
      setRecords(next);
      setSelected(new Set());
      toast.success(list.length === 1 ? "نُشر المقال على الموقع الرئيسي" : `نُشر ${list.length} مقالات`, { action: { label: "عرض", onClick: () => window.open(res.url, "_blank") } });
    } catch (e) {
      toast.error(`تعذر النشر: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(null); setProgress(""); }
  };

  const unpublish = async (p: Project) => {
    const rec = records[p.id];
    if (!rec || !ready) return;
    if (!confirm(`إزالة «${p.title}» من الموقع الرئيسي؟ يبقى المقال هنا في المحرر.`)) return;
    setBusy(p.id);
    try {
      const index = await readRepoJson<ArticleIndex>(settings.token, settings.siteRepo, settings.siteBranch, `${CONTENT_DIR}/articles/index.json`);
      await commitFiles({
        token: settings.token, repo: settings.siteRepo, branch: settings.siteBranch, message: `Unpublish: ${p.title}`,
        files: [{ path: `${CONTENT_DIR}/articles/index.json`, text: JSON.stringify(removeFromIndex(index, rec.slug), null, 2) }],
        remove: [`${CONTENT_DIR}/articles/${rec.slug}.json`],
      });
      const next = { ...records }; delete next[p.id];
      savePublishRecords(next); setRecords(next);
      toast.success("أزيل المقال من الموقع الرئيسي");
    } catch (e) {
      toast.error(`تعذرت الإزالة: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(null); }
  };

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const changed = projects.filter((p) => states.get(p.id) === "changed");

  return (
    <Panel
      title="نشر المقالات للموقع الرئيسي"
      desc={ready ? `يُرفع إلى ${settings.siteRepo} في مجلد content` : "أضف رمز GitHub ومستودع الموقع الرئيسي أولا من تبويب GitHub"}
      actions={
        <div className="flex flex-wrap gap-2">
          {changed.length > 0 && <GhostButton disabled={!!busy} onClick={() => publish(changed)}><RefreshCw size={14} /> تحديث المتغيّرة ({changed.length})</GhostButton>}
          <PrimaryButton disabled={!!busy || selected.size === 0} onClick={() => publish(projects.filter((p) => selected.has(p.id)))}>
            {busy === "publish" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} نشر المحدد ({selected.size})
          </PrimaryButton>
        </div>
      }
    >
      {progress && <p role="status" className="mb-2 text-xs text-muted-foreground">{progress}</p>}
      {projects.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد مقالات بعد.</p> : (
        <ul className="divide-y divide-border">
          {projects.map((p) => {
            const st = states.get(p.id) ?? "draft";
            const rec = records[p.id];
            return (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <input type="checkbox" aria-label={`تحديد ${p.title}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="size-4 accent-[var(--accent-pink)]" />
                <div className="h-10 w-20 shrink-0 overflow-hidden rounded-md bg-muted">{p.thumbnail && <img src={p.thumbnail} alt="" className="h-full w-full object-cover" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" dir="auto">{p.title || "بدون عنوان"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    <span className={`rounded-full px-2 py-0.5 ${BADGE[st].cls}`}>{BADGE[st].text}</span>
                    {rec && <> · {new Date(rec.publishedAt).toLocaleString("ar")}</>}
                  </p>
                </div>
                {rec && ready && (
                  <a href={`https://github.com/${settings.siteRepo}/blob/${settings.siteBranch}/${CONTENT_DIR}/articles/${rec.slug}.json`} target="_blank" rel="noreferrer" aria-label="عرض على GitHub" className="text-muted-foreground hover:text-foreground"><ExternalLink size={16} /></a>
                )}
                <GhostButton disabled={!!busy} onClick={() => publish([p])}>
                  {busy === "publish" ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />} {st === "draft" ? "نشر" : "إعادة نشر"}
                </GhostButton>
                {rec && <GhostButton disabled={!!busy} onClick={() => unpublish(p)}>{busy === p.id ? <Loader2 size={14} className="animate-spin" /> : "إزالة"}</GhostButton>}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
