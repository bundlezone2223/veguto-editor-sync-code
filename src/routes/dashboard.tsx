import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileJson, Github, LayoutTemplate, Loader2, Newspaper, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { WikiLayout } from "@/components/WikiLayout";
import { HomeLayoutEditor } from "@/components/dashboard/HomeLayoutEditor";
import { HomePreview } from "@/components/dashboard/HomePreview";
import { PublishPanel } from "@/components/dashboard/PublishPanel";
import { GithubPanel } from "@/components/dashboard/GithubPanel";
import { GhostButton, PrimaryButton } from "@/components/dashboard/ui";
import { loadProjects, type Project } from "@/lib/projects-store";
import { DEFAULT_SITE_CONFIG, loadSiteConfig, saveSiteConfig, type SiteConfig } from "@/lib/site-config";
import { DEFAULT_GITHUB_SETTINGS, commitFiles, loadGithubSettings, type GithubSettings } from "@/lib/github-api";
import { CONTENT_DIR } from "@/lib/publish-article";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم — Veguto Wiki Studio" },
      { name: "description", content: "تحكم في شكل الصفحة الرئيسية لموقع Veguto Wiki، وانشر المقالات، وارفع كود المشروع إلى GitHub." },
      { property: "og:title", content: "لوحة التحكم — Veguto Wiki Studio" },
      { property: "og:description", content: "تحكم في شكل الصفحة الرئيسية لموقع Veguto Wiki، وانشر المقالات، وارفع كود المشروع إلى GitHub." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

type Tab = "home" | "articles" | "github";
const TABS: { id: Tab; label: string; Icon: typeof Github }[] = [
  { id: "home", label: "الصفحة الرئيسية", Icon: LayoutTemplate },
  { id: "articles", label: "نشر المقالات", Icon: Newspaper },
  { id: "github", label: "GitHub", Icon: Github },
];

function DashboardPage() {
  const [tab, setTab] = useState<Tab>("home");
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [settings, setSettings] = useState<GithubSettings>(DEFAULT_GITHUB_SETTINGS);
  const [projects, setProjects] = useState<Project[]>([]);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    setConfig(loadSiteConfig());
    setSettings(loadGithubSettings());
    void loadProjects().then(setProjects);
  }, []);

  const categories = useMemo(() => [...new Set([...projects.flatMap((p) => p.categories), ...config.sections.map((s) => s.label)])].filter(Boolean), [projects, config.sections]);

  const change = (c: SiteConfig) => {
    setConfig(c);
    if (!saveSiteConfig(c)) toast.error("تعذر حفظ الإعدادات في هذا المتصفح");
  };

  const publishLayout = async () => {
    
    setPublishing(true);
    try {
      const res = await commitFiles({
        token: settings.token, repo: settings.siteRepo, branch: settings.siteBranch, message: "Update home page layout",
        files: [{ path: `${CONTENT_DIR}/home.json`, text: JSON.stringify({ ...config, updatedAt: Date.now() }, null, 2) }],
      });
      toast.success("نُشر تخطيط الصفحة الرئيسية", { action: { label: "عرض", onClick: () => window.open(res.url, "_blank") } });
    } catch (e) {
      toast.error(`تعذر النشر: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setPublishing(false); }
  };

  const downloadJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(config, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "home.json" });
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => { if (confirm("إرجاع الصفحة الرئيسية إلى الإعدادات الأصلية؟")) change(structuredClone(DEFAULT_SITE_CONFIG)); };

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

      {tab === "home" && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
            <GhostButton onClick={reset}><RotateCcw size={14} /> الإعدادات الأصلية</GhostButton>
            <GhostButton onClick={downloadJson}><FileJson size={14} /> تنزيل JSON</GhostButton>
            <PrimaryButton onClick={publishLayout} disabled={publishing}>{publishing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} نشر التخطيط</PrimaryButton>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <HomeLayoutEditor config={config} onChange={change} categories={categories} />
            <div className="lg:sticky lg:top-4 lg:self-start">
              <p className="mb-2 text-xs font-medium text-muted-foreground">معاينة مباشرة</p>
              <HomePreview config={config} projects={projects} />
            </div>
          </div>
        </>
      )}
      {tab === "articles" && <PublishPanel projects={projects} onNeedSettings={() => { toast.error("أضف رمز GitHub ومستودع الموقع الرئيسي أولا"); setTab("github"); }} />}
      {tab === "github" && <GithubPanel settings={settings} onChange={setSettings} />}
    </WikiLayout>
  );
}
