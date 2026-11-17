import type { Project } from "@/lib/projects-store";
import type { SiteConfig } from "@/lib/site-config";

/** A small live picture of how the main site's home page will look. */
export function HomePreview({ config, projects }: { config: SiteConfig; projects: Project[] }) {
  const latest = projects.slice(0, config.latest.count);
  return (
    <div dir="ltr" className="rounded-2xl border border-border bg-background p-3 text-left text-[11px]">
      <div className="grid grid-cols-[1fr_9rem] gap-3">
        <div className="min-w-0 space-y-3">
          {config.hero.visible && (
            <div className="gradient-hero rounded-xl px-3 py-5 text-center">
              <p className="italic text-accent-pink">{config.hero.kicker}</p>
              <p className="text-xl font-bold italic">{config.hero.title}</p>
              <p className="mx-auto mt-1 max-w-xs text-muted-foreground">{config.hero.subtitle}</p>
              {config.hero.showSearch && (
                <div className="mx-auto mt-2 flex max-w-xs items-center justify-between rounded-full bg-card py-1 pl-3 pr-1 shadow-sm">
                  <span className="truncate text-muted-foreground">{config.hero.searchPlaceholder}</span>
                  <span className="rounded-full bg-accent-pink px-2 py-0.5 text-card">Search</span>
                </div>
              )}
            </div>
          )}
          {config.stats.visible && config.stats.items.length > 0 && (
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(4, config.stats.items.length)}, minmax(0,1fr))` }}>
              {config.stats.items.map((s, i) => (
                <div key={i} className="rounded-lg bg-card py-2 text-center shadow-sm">
                  <p className="text-base font-bold text-accent-pink">{s.value}</p>
                  <p className="truncate px-1 text-[9px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          )}
          {config.latest.visible && (
            <div className="grid grid-cols-2 gap-1.5">
              {(latest.length ? latest : Array.from({ length: Math.min(2, config.latest.count) }, () => null)).map((p, i) => <MiniCard key={p?.id ?? i} project={p} />)}
            </div>
          )}
          {config.featured.filter((f) => f.visible).map((f) => {
            const items = projects.filter((p) => p.categories.some((c) => c.toLowerCase() === f.category.toLowerCase())).slice(0, f.limit);
            return (
              <div key={f.id}>
                <p className="mb-1 border-l-2 border-accent-pink pl-1.5 font-bold">{f.emoji} {f.title} <span className="text-accent-pink">{f.highlight}</span></p>
                <div className="flex gap-1.5 overflow-hidden">
                  {(items.length ? items : [null, null, null]).slice(0, 3).map((p, i) => <div key={p?.id ?? i} className="w-1/3 shrink-0"><MiniCard project={p} /></div>)}
                </div>
                {items.length === 0 && <p className="mt-1 text-[9px] text-muted-foreground">No articles in “{f.category}” yet</p>}
              </div>
            );
          })}
        </div>
        <aside className="h-fit space-y-1 rounded-xl border border-border bg-card p-2">
          <p className="font-bold italic text-accent-pink">{config.hero.title}</p>
          <p className="text-[9px] font-semibold uppercase text-muted-foreground">Quick nav</p>
          {config.quickNav.map((n, i) => <p key={i} className="truncate">{n.emoji} {n.label}</p>)}
          <p className="pt-1 text-[9px] font-semibold uppercase text-muted-foreground">Sections</p>
          {config.sections.filter((s) => s.visible).map((s) => <p key={s.slug} className="truncate">{s.emoji} {s.label}</p>)}
          {config.discord.visible && <p className="mt-1 rounded-md bg-accent-purple py-1 text-center text-card">{config.discord.label}</p>}
        </aside>
      </div>
    </div>
  );
}

function MiniCard({ project }: { project: Project | null }) {
  return (
    <div className="overflow-hidden rounded-lg bg-card shadow-sm">
      <div className="aspect-[2.037/1] bg-muted">
        {project?.thumbnail && <img src={project.thumbnail} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="p-1.5">
        {project?.categories[0] && <span className="rounded-full bg-hero-from px-1.5 text-[8px] uppercase text-accent-pink">{project.categories[0]}</span>}
        <p className="mt-0.5 line-clamp-2 font-semibold">{project?.title || "Article title"}</p>
      </div>
    </div>
  );
}
