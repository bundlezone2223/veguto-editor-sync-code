import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileJson, Github, Globe, LayoutTemplate, Loader2, Newspaper, Redo2, RefreshCw, RotateCcw, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { WikiLayout } from "@/components/WikiLayout";
import { HomeLayoutEditor, type SiteData } from "@/components/dashboard/HomeLayoutEditor";
import { HomePreview } from "@/components/dashboard/HomePreview";
import { ArticlesPanel } from "@/components/dashboard/ArticlesPanel";
import { GithubPanel } from "@/components/dashboard/GithubPanel";
import { SitePanel } from "@/components/dashboard/SitePanel";
import { GhostButton, PrimaryButton } from "@/components/dashboard/ui";
import type { EditTarget } from "@/components/dashboard/block-info";
import { loadProjects, type Project } from "@/lib/projects-store";
import {
  DEFAULT_HOME_CONFIG, HOME_CONFIG_PATH, checkHome, loadHomeDraft, saveHomeDraft, serializeHomeConfig,
  type FeedArticle, type HomeConfig,
} from "@/lib/site-config";
import { SITE_BRANCH, cardDescription, currentHomeSha, loadSiteSnapshot, type SiteSnapshot } from "@/lib/site-snapshot";
import { DEFAULT_GITHUB_SETTINGS, SERVER_TOKEN, SITE_REPO, commitFiles, loadGithubSettings, type GithubSettings } from "@/lib/github-api";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم — Veguto Wiki Studio" },
      { name: "description", content: "تحكم في عناصر الصفحة الرئيسية الحقيقية لموقع Veguto Wiki وترتيبها، وانشر المقالات، وارفع كود المشروع إلى GitHub." },
      { property: "og:title", content: "لوحة التحكم — Veguto Wiki Studio" },
      { property: "og:description", content: "تحكم في عناصر الصفحة الرئيسية الحقيقية لموقع Veguto Wiki وترتيبها، وانشر المقالات، وارفع كود المشروع إلى GitHub." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

type Tab = "home" | "articles" | "site" | "github";
const TABS: { id: Tab; label: string; Icon: typeof Github }[] = [
  { id: "home", label: "الصفحة الرئيسية", Icon: LayoutTemplate },
  { id: "articles", label: "المقالات", Icon: Newspaper },
  { id: "site", label: "الموقع الرئيسي", Icon: Globe },
  { id: "github", label: "GitHub", Icon: Github },
];

type History = { past: HomeConfig[]; present: HomeConfig; future: HomeConfig[]; at: number };
const fresh = (c: HomeConfig): History => ({ past: [], present: c, future: [], at: 0 });

const toFeed = (p: Project): FeedArticle => ({
  id: p.id, title: p.title || "Untitled", description: cardDescription(p.excerpt ?? "", p.sections as { type: string; text?: string }[]),
  thumbnail: p.thumbnail, category: p.categories[0] ?? "", tags: p.tags,
});

function timeAgo(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "الآن";
  const m = Math.round(s / 60);
  return m < 60 ? `قبل ${m} دقيقة` : `قبل ${Math.round(m / 60)} ساعة`;
}

function DashboardPage() {
  const [tab, setTab] = useState<Tab>("home");
  const [settings, setSettings] = useState<GithubSettings>(DEFAULT_GITHUB_SETTINGS);
  const [projects, setProjects] = useState<Project[]>([]);
  const reloadProjects = useCallback(async () => { setProjects(await loadProjects()); }, []);

  useEffect(() => {
    setSettings(loadGithubSettings());
    void reloadProjects();
  }, [reloadProjects]);

  return (
    <WikiLayout withNav wide>
      <header className="mb-4">
        <h1 className="text-2xl font-bold">لوحة التحكم</h1>
        <p className="text-sm text-muted-foreground">تحكم في موقع Veguto Wiki الرئيسي من هنا.</p>
      </header>

      <div role="tablist" className="mb-4 flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === id ? "bg-accent-pink text-card" : "text-muted-foreground hover:bg-muted"}`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === "home" && <HomeTab projects={projects} />}
      {tab === "articles" && <ArticlesPanel projects={projects} onProjectsChanged={reloadProjects} />}
      <div hidden={tab !== "site"}><SitePanel active={tab === "site"} /></div>
      {tab === "github" && <GithubPanel settings={settings} onChange={setSettings} />}
    </WikiLayout>
  );
}

function HomeTab({ projects }: { projects: Project[] }) {
  const [snap, setSnap] = useState<SiteSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hist, setHist] = useState<History>(() => fresh(DEFAULT_HOME_CONFIG));
  const [staleDraft, setStaleDraft] = useState(false);
  const [selected, setSelected] = useState<EditTarget | null>(null);
  const [publishing, setPublishing] = useState(false);
  const ready = useRef(false);
  const config = hist.present;

  const load = useCallback(async (keepEdits: boolean) => {
    setLoading(true); setLoadError(null);
    try {
      const s = await loadSiteSnapshot();
      setSnap(s);
      const base = s.home ?? DEFAULT_HOME_CONFIG;
      const draft = keepEdits ? loadHomeDraft() : null;
      if (draft && serializeHomeConfig(draft.config) !== serializeHomeConfig(base)) {
        setHist(fresh(draft.config));
        setStaleDraft(draft.baseSha !== s.homeSha);
      } else {
        setHist(fresh(base)); setStaleDraft(false); saveHomeDraft(null);
      }
      ready.current = true;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(true); }, [load]);

  const base = snap?.home ?? DEFAULT_HOME_CONFIG;
  const dirty = serializeHomeConfig(config) !== serializeHomeConfig(base);

  // Unpublished edits survive a reload.
  useEffect(() => {
    if (!ready.current || !snap) return;
    if (!saveHomeDraft(dirty ? { baseSha: snap.homeSha, config, savedAt: Date.now() } : null)) toast.error("تعذر حفظ التعديلات في هذا المتصفح");
  }, [config, dirty, snap]);

  const change = useCallback((c: HomeConfig) => {
    setHist((h) => {
      const now = Date.now();
      // Typing in one field quickly counts as a single step for undo.
      if (now - h.at < 600 && h.past.length) return { ...h, present: c, future: [], at: now };
      return { past: [...h.past.slice(-59), h.present], present: c, future: [], at: now };
    });
  }, []);
  const undo = useCallback(() => setHist((h) => h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1]!, future: [h.present, ...h.future], at: 0 } : h), []);
  const redo = useCallback(() => setHist((h) => h.future.length ? { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1), at: 0 } : h), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement)?.closest("input, textarea")) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const site: SiteData = useMemo(() => ({
    articles: snap?.articles ?? [], categories: snap?.categories ?? null, counts: snap?.counts ?? { articles: 0, categories: 0, tags: 0 },
  }), [snap]);
  const editorArticles = useMemo(() => projects.map(toFeed), [projects]);
  const issues = useMemo(() => checkHome(config, { articles: site.articles, categories: site.categories?.map((c) => c.id) ?? null }), [config, site]);
  const errors = issues.filter((i) => i.level === "error").length;
  const warnings = issues.filter((i) => i.level === "warn").length;

  const selectFromPreview = (t: EditTarget) => {
    setSelected(t);
    requestAnimationFrame(() => document.getElementById(`edit-${t}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  const publish = async () => {
    if (!snap) return;
    if (errors) { toast.error("أصلح المشاكل المعلّمة بالأحمر قبل النشر"); return; }
    setPublishing(true);
    try {
      const sha = await currentHomeSha();
      if (sha !== snap.homeSha && !confirm("تغيّر تخطيط الصفحة الرئيسية على GitHub منذ فتحت هذه الصفحة. هل تريد استبداله بنسختك؟")) return;
      const res = await commitFiles({ token: SERVER_TOKEN, repo: SITE_REPO, branch: SITE_BRANCH, message: "Update home page layout", files: [{ path: HOME_CONFIG_PATH, text: serializeHomeConfig(config) }] });
      saveHomeDraft(null);
      toast.success(snap?.siteReadsConfig ? "نُشر تخطيط الصفحة الرئيسية — يظهر على الموقع خلال دقيقة أو دقيقتين" : "نُشر تخطيط الصفحة الرئيسية", { action: { label: "عرض", onClick: () => window.open(res.url, "_blank") } });
      await load(false);
    } catch (e) {
      toast.error(`تعذر النشر: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setPublishing(false); }
  };

  const discard = () => { if (confirm("تجاهل كل التعديلات غير المنشورة والرجوع لما يعرضه الموقع الآن؟")) { change(structuredClone(base)); setStaleDraft(false); } };
  const downloadJson = () => {
    const url = URL.createObjectURL(new Blob([serializeHomeConfig(config)], { type: "application/json" }));
    Object.assign(document.createElement("a"), { href: url, download: "home.json" }).click();
    URL.revokeObjectURL(url);
  };

  if (loading && !snap) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-10 text-sm text-muted-foreground">
        <Loader2 size={18} className="animate-spin" /> أقرأ الصفحة الرئيسية من {SITE_REPO}…
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* On phones the preview comes first. */}
      <div className="order-first min-w-0 lg:order-last lg:sticky lg:top-4 lg:self-start">
        <HomePreview config={config} onChange={change} site={site} editorArticles={editorArticles} selected={selected} onSelect={selectFromPreview} />
      </div>
      <div className="min-w-0 space-y-3">
      {/* Connection + real counts */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-[var(--card-shadow)]">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className={`size-2 shrink-0 rounded-full ${loadError ? "bg-destructive" : "bg-accent-pink"}`} />
          <span className="font-semibold" dir="ltr">{SITE_REPO}</span>
          <span className="text-xs text-muted-foreground">{loadError ? "تعذر الاتصال" : snap ? `قُرئ ${timeAgo(snap.fetchedAt)}` : ""}</span>
        </div>
        {snap && (
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-full bg-hero-from px-2.5 py-0.5 font-semibold text-accent-pink">{snap.counts.articles} مقال منشور</span>
            <span className="rounded-full bg-muted px-2.5 py-0.5">{snap.counts.categories} تصنيف</span>
            <span className="rounded-full bg-muted px-2.5 py-0.5">{snap.counts.tags} وسم</span>
            {snap.hiddenArticles > 0 && <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-destructive" title="مقالات على GitHub تصنيفها غير معروف للموقع فلا تظهر">{snap.hiddenArticles} مقال مخفي (تصنيف غير معروف)</span>}
          </div>
        )}
        <div className="ms-auto">
          <GhostButton onClick={() => void load(true)} disabled={loading}>{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} تحديث من الموقع</GhostButton>
        </div>
      </div>

      {loadError && <Notice tone="error">تعذر قراءة الموقع: {loadError}</Notice>}
      {snap && !snap.siteReadsConfig && (
        <Notice tone="warn">
          الصفحة الرئيسية في الموقع ما زالت مكتوبة داخل الكود ولا تقرأ ملف <span dir="ltr" className="font-mono">{HOME_CONFIG_PATH}</span> بعد، لذلك النشر من هنا يحفظ التخطيط على GitHub لكنه لن يغيّر شكل الموقع حتى يُربط الموقع بهذا الملف. العناصر أدناه منسوخة من الصفحة الحقيقية كما هي الآن.
        </Notice>
      )}
      {staleDraft && <Notice tone="warn">تغيّر تخطيط الموقع على GitHub منذ حفظت تعديلاتك غير المنشورة. راجعها، أو اضغط «تجاهل التعديلات» لترى نسخة الموقع.</Notice>}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <GhostButton ariaLabel="تراجع" onClick={undo} disabled={!hist.past.length}><Undo2 size={15} /></GhostButton>
          <GhostButton ariaLabel="إعادة" onClick={redo} disabled={!hist.future.length}><Redo2 size={15} /></GhostButton>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs ${dirty ? "text-accent-pink" : "text-muted-foreground"}`}>
          {dirty ? <><span className="size-1.5 rounded-full bg-accent-pink" /> تعديلات غير منشورة (محفوظة في هذا المتصفح)</> : <><CheckCircle2 size={14} /> مطابق للموقع</>}
        </span>
        {(errors > 0 || warnings > 0) && (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive"><AlertTriangle size={13} /> {errors + warnings} تحتاج مراجعة</span>
        )}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {dirty && <GhostButton onClick={discard}><RotateCcw size={14} /> تجاهل التعديلات</GhostButton>}
          <GhostButton onClick={downloadJson}><FileJson size={14} /> تنزيل JSON</GhostButton>
          <PrimaryButton onClick={publish} disabled={publishing || !snap || (!dirty && !!snap.homeSha) || errors > 0}>
            {publishing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} نشر على الموقع
          </PrimaryButton>
        </div>
      </div>

        <HomeLayoutEditor config={config} onChange={change} site={site} selected={selected} onSelect={setSelected} issues={issues} />
      </div>
    </div>
  );
}

function Notice({ tone, children }: { tone: "warn" | "error"; children: React.ReactNode }) {
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${tone === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-accent-pink/30 bg-hero-from text-foreground"}`}>
      <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${tone === "error" ? "" : "text-accent-pink"}`} />
      <p>{children}</p>
    </div>
  );
}
