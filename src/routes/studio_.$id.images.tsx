import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ImagePlus } from "lucide-react";
import { WikiLayout } from "@/components/WikiLayout";
import type { Section } from "@/lib/article-content";
import { getProject, upsertProject, type Project } from "@/lib/projects-store";

export const Route = createFileRoute("/studio_/$id/images")({
  head: () => ({
    meta: [
      { title: "Image placeholders | Veguto Wiki Studio" },
      { name: "description", content: "Replace [🖼:name] placeholders in your article with real images." },
      { property: "og:title", content: "Image placeholders | Veguto Wiki Studio" },
      { property: "og:description", content: "Replace [🖼:name] placeholders in your article with real images." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImagesPage,
});

const TOKEN = /\[\s*🖼\uFE0F?\s*:\s*([^\]]+?)\s*\]/gu;

type Hit = { key: string; name: string; sectionIndex: number; token: string };

function findHits(sections: Section[]): Hit[] {
  const hits: Hit[] = [];
  sections.forEach((s, i) => {
    if (s.type !== "p") return;
    for (const m of s.text.matchAll(TOKEN)) {
      hits.push({ key: `${i}-${m.index}`, name: m[1] ?? "", sectionIndex: i, token: m[0] });
    }
  });
  return hits;
}

/** Splits the paragraph around the token and inserts an image section in its place. */
function replaceToken(sections: Section[], hit: Hit, src: string): Section[] {
  const s = sections[hit.sectionIndex];
  if (!s || s.type !== "p") return sections;
  const at = s.text.indexOf(hit.token);
  if (at < 0) return sections;
  const before = s.text.slice(0, at).trim();
  const after = s.text.slice(at + hit.token.length).trim();
  const out: Section[] = [];
  if (before) out.push({ type: "p", text: before });
  out.push({ type: "image", src, alt: hit.name, caption: "" });
  if (after) out.push({ type: "p", text: after });
  return [...sections.slice(0, hit.sectionIndex), ...out, ...sections.slice(hit.sectionIndex + 1)];
}

function ImagesPage() {
  const { id } = Route.useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [pending, setPending] = useState<Hit | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void getProject(id).then((p) => { if (alive) setProject(p); });
    return () => { alive = false; };
  }, [id]);

  const hits = project ? findHits(project.sections) : [];

  const pick = (h: Hit) => { setPending(h); fileRef.current?.click(); };

  const onFile = (file: File | undefined) => {
    if (!file || !pending || !project) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const next = { ...project, sections: replaceToken(project.sections, pending, String(reader.result || "")), updatedAt: Date.now() };
      if (!(await upsertProject(next))) return;
      setProject(next);
      setPending(null);
    };
    reader.readAsDataURL(file);
  };

  return (
    <WikiLayout>
      <div dir="ltr" className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <Link to="/studio/$id" params={{ id }} className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted"><ArrowLeft size={20} /></Link>
          <h1 className="text-lg font-bold">Image placeholders</h1>
          <span className="ml-auto text-xs text-muted-foreground">{hits.length} found</span>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Write <code className="px-1 rounded bg-muted">[🖼:name]</code> anywhere in a paragraph, then tap its card to pick an image from your device.
        </p>

        {!project && <p className="text-muted-foreground">Project not found.</p>}
        {project && hits.length === 0 && (
          <p className="text-muted-foreground text-sm border border-dashed border-border rounded-xl p-6 text-center">No placeholders in this article yet.</p>
        )}

        <ul className="space-y-2">
          {hits.map((h) => (
            <li key={h.key}>
              <button
                onClick={() => pick(h)}
                className="w-full flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2.5 shadow-sm hover:border-accent-pink hover:bg-[oklch(0.97_0.03_350)] transition-colors text-left"
              >
                <span className="shrink-0">🖼</span>
                <span className="min-w-0 flex-1 truncate font-medium" dir="auto">{h.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">§{h.sectionIndex + 1}</span>
                <ImagePlus size={18} className="shrink-0 text-accent-pink" />
              </button>
            </li>
          ))}
        </ul>

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onFile(f); }} />
      </div>
    </WikiLayout>
  );
}
