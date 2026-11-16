import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { WikiLayout } from "@/components/WikiLayout";
import { ProjectMetaModal, type ProjectMetaValues } from "@/components/ProjectMetaModal";
import { deleteProject, loadProjects, newId, upsertProject, type Project } from "@/lib/projects-store";
import { installSampleArticles } from "@/lib/sample-article";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Veguto Wiki Studio" },
      { name: "description", content: "أنشئ وأدر مشاريع مقالات الويكي الخاصة بك." },
      { property: "og:title", content: "Veguto Wiki Studio" },
      { property: "og:description", content: "أنشئ وأدر مشاريع مقالات الويكي الخاصة بك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [open, setOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  useEffect(() => {
    let alive = true;
    void installSampleArticles().then(loadProjects).then((list) => { if (alive) setProjects(list); });
    return () => { alive = false; };
  }, []);

  const handleCreated = async (v: ProjectMetaValues) => {
    const now = Date.now();
    const slug = (v.title || "untitled").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
    const p: Project = {
      id: newId(),
      title: v.title,
      excerpt: v.excerpt,
      thumbnail: v.thumbnail,
      categories: v.categories,
      tags: v.tags,
      createdAt: now,
      updatedAt: now,
      meta: {
        title: v.title,
        slug,
        excerpt: v.excerpt,
        categories: v.categories,
        tags: v.tags,
        hero: v.thumbnail,
      },
      sections: [],
    };
    if (!(await upsertProject(p))) return;
    setOpen(false);
    navigate({ to: "/studio/$id", params: { id: p.id } });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("حذف هذا المشروع؟")) return;
    await deleteProject(id);
    setProjects(await loadProjects());
  };

  const handleEdited = async (v: ProjectMetaValues) => {
    if (!editingProject) return;
    const slug = (v.title || "untitled").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
    const updated: Project = {
      ...editingProject,
      title: v.title,
      excerpt: v.excerpt,
      thumbnail: v.thumbnail,
      categories: v.categories,
      tags: v.tags,
      updatedAt: Date.now(),
      meta: {
        ...editingProject.meta,
        title: v.title,
        slug,
        excerpt: v.excerpt,
        categories: v.categories,
        tags: v.tags,
        hero: v.thumbnail,
      },
    };
    if (!(await upsertProject(updated))) return;
    setProjects(await loadProjects());
    setEditingProject(null);
  };

  return (
    <WikiLayout>
      <button
        onClick={() => setOpen(true)}
        className="w-full h-40 md:h-48 rounded-2xl gradient-hero border border-accent-pink/30 flex items-center justify-center gap-3 text-2xl md:text-3xl font-bold text-[oklch(0.35_0.15_330)] hover:opacity-90 transition-opacity shadow-[var(--card-shadow)]"
      >
        <span className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-[oklch(0.2_0.05_330)] text-white flex items-center justify-center text-3xl leading-none">+</span>
        مشروع جديد
      </button>

      {projects.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold mb-4">المشاريع</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpen={() => navigate({ to: "/studio/$id", params: { id: p.id } })}
                onDelete={() => handleDelete(p.id)}
                onEdit={() => setEditingProject(p)}
              />
            ))}
          </div>
        </section>
      )}

      {open && (
        <ProjectMetaModal
          onClose={() => setOpen(false)}
          onSubmit={handleCreated}
        />
      )}
      {editingProject && (
        <ProjectMetaModal
          title="تعديل الماتاداتا"
          submitLabel="حفظ"
          initial={{
            title: editingProject.title,
            excerpt: editingProject.excerpt,
            thumbnail: editingProject.thumbnail,
            categories: editingProject.categories,
            tags: editingProject.tags,
          }}
          onClose={() => setEditingProject(null)}
          onSubmit={handleEdited}
        />
      )}
    </WikiLayout>
  );
}

function ProjectCard({ project, onOpen, onDelete, onEdit }: { project: Project; onOpen: () => void; onDelete: () => void; onEdit: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative [container-type:inline-size] bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <button onClick={onOpen} className="block w-full text-right" aria-label={`فتح ${project.title || "المشروع"}`}>
        <div className="aspect-[2.037/1] bg-muted flex items-center justify-center overflow-hidden">
          {project.thumbnail
            ? <img src={project.thumbnail} alt={project.title} className="w-full h-full object-cover" />
            : <span className="text-5xl opacity-60">📜</span>}
        </div>
        <div className="relative p-3">
          <div className="flex items-center justify-between gap-2 pl-10">
            <h3 className="font-bold truncate">{project.title || "بدون عنوان"}</h3>
          </div>
          {cardDescription(project) && <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{cardDescription(project)}</p>}
          <div className="flex flex-wrap gap-1 mt-2">
            {project.categories.slice(0, 3).map((c) => (
              <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-[oklch(0.97_0.03_350)] text-accent-pink">{c}</span>
            ))}
            {project.tags.slice(0, 3).map((t) => (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">#{t}</span>
            ))}
          </div>
        </div>
      </button>
      <div className="absolute left-2 top-[calc(100cqw/2.037+0.5rem)]">
        <button
          type="button"
          aria-label="خيارات المشروع"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
          className="flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <MoreVertical size={18} />
        </button>
        {menuOpen && (
          <div className="absolute top-10 left-0 z-10 min-w-40 overflow-hidden rounded-md border border-border bg-card py-1 shadow-lg">
            <button type="button" onClick={() => { setMenuOpen(false); onEdit(); }} className="flex w-full items-center gap-2 px-3 py-2 text-right text-sm hover:bg-muted">
              <Pencil size={15} /> تعديل الماتاداتا
            </button>
            <button type="button" onClick={() => { setMenuOpen(false); onDelete(); }} className="flex w-full items-center gap-2 px-3 py-2 text-right text-sm text-red-600 hover:bg-muted">
              <Trash2 size={15} /> حذف
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Description for cards: the optional description, or the start of the first paragraph. */
function cardDescription(project: Project): string {
  const own = project.excerpt?.trim();
  if (own) return own;
  const first = project.sections?.find((s) => s.type === "p");
  const text = first && first.type === "p" ? first.text.replace(/\s+/g, " ").trim() : "";
  return text.length > 150 ? `${text.slice(0, 150).trim()}…` : text;
}
