import type { Section } from "@/lib/article-content";
import { getProject, newArticleId, upsertProject, type Project } from "@/lib/projects-store";

/** Ready-made articles shipped as static JSON (images embedded as Base64) and added to the studio once. */
const SAMPLES = [{ id: "p_sample_miraculous", url: "/samples/miraculous.json" }];
const flagKey = (id: string) => `veguto:sample-installed:${id}`;

type SampleFile = {
  title: string; slug: string; excerpt: string; categories: string[]; tags: string[]; hero: string; sections: Section[];
};

/** Adds each sample article once. If the user later deletes it, it is not added again. Never throws. */
export async function installSampleArticles(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  let added = false;
  for (const sample of SAMPLES) {
    try {
      if (localStorage.getItem(flagKey(sample.id))) continue;
      if (await getProject(sample.id)) { localStorage.setItem(flagKey(sample.id), "1"); continue; }
      const res = await fetch(sample.url);
      if (!res.ok) continue;
      const a = (await res.json()) as SampleFile;
      const now = Date.now();
      const project: Project = {
        id: sample.id, title: a.title, excerpt: a.excerpt, thumbnail: a.hero, categories: a.categories, tags: a.tags,
        createdAt: now, updatedAt: now,
        meta: { title: a.title, slug: a.slug, articleId: await newArticleId(), excerpt: a.excerpt, categories: a.categories, tags: a.tags, hero: a.hero },
        sections: a.sections,
      };
      if (await upsertProject(project)) { localStorage.setItem(flagKey(sample.id), "1"); added = true; }
    } catch (error) {
      console.error("Installing sample article failed", error);
    }
  }
  return added;
}
