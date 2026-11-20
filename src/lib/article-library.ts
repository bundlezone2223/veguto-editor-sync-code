/**
 * Where every article lives on GitHub:
 *   published → main site repo, src/content/articles/<Title>.ts (shown on the site)
 *   draft / private → editor repo, editor-articles/<Title>.ts (never shown on the site)
 * editor-articles/index.json remembers each article's status and the editor version last saved.
 */
import { HISTORY_REPO, SITE_REPO, SERVER_TOKEN, commitFiles, gh, readRepoText, type RepoFile } from "@/lib/github-api";
import { articleFileName } from "@/lib/article-file-name";
import { buildArticleTs } from "@/lib/article-ts";
import { newArticleId, newId, upsertProject, type Project } from "@/lib/projects-store";

export const SITE_BRANCH = "main";
export const EDITOR_BRANCH = "main";
export const SITE_ARTICLES_DIR = "src/content/articles";
export const EDITOR_ARTICLES_DIR = "editor-articles";
const INDEX_PATH = `${EDITOR_ARTICLES_DIR}/index.json`;
const NOT_ARTICLES = new Set(["index.ts", "types.ts"]);

export type ArticleStatus = "published" | "draft" | "private";
export type LibraryEntry = { articleId: string; file: string; title: string; status: ArticleStatus; updatedAt: number; savedAt: number };
export type LibraryIndex = { version: 1; articles: Record<string, LibraryEntry> };
export type LibraryState = { index: LibraryIndex; siteFiles: Set<string>; editorFiles: Set<string>; siteCategories: string[] | null };

export type ArticleRow = {
  key: string;
  title: string;
  /** File name where the article lives now (or will live). */
  file: string;
  status: ArticleStatus;
  project?: Project;
  entry?: LibraryEntry;
  /** A copy exists on GitHub. */
  onGithub: boolean;
  /** This browser's copy is newer than the GitHub copy. */
  changed: boolean;
};

export const emptyIndex = (): LibraryIndex => ({ version: 1, articles: {} });

export function isBlankProject(p: Project) {
  return !(p.title || p.meta?.title || "").trim() && (p.sections ?? []).length === 0;
}

export function projectTitle(p: Project) {
  return (p.meta?.title || p.title || "").trim();
}

export function projectFile(p: Project) {
  return articleFileName(projectTitle(p), p.meta?.articleId || "untitled");
}

/** "Miraculous-Tales-of-Ladybug-&-Cat-Noir.ts" → "Miraculous Tales of Ladybug & Cat Noir" */
export function titleFromFile(file: string) {
  return file.replace(/\.ts$/, "").replace(/-/g, " ").trim();
}

export function projectTs(p: Project) {
  return buildArticleTs({ ...p.meta, title: projectTitle(p), excerpt: p.meta?.excerpt ?? p.excerpt, hero: p.meta?.hero || p.thumbnail,
    categories: p.meta?.categories?.length ? p.meta.categories : p.categories, tags: p.meta?.tags?.length ? p.meta.tags : p.tags }, p.sections ?? []);
}

/** Joins this browser's articles with what GitHub has, one row per article. */
export function buildRows(projects: Project[], state: Pick<LibraryState, "index" | "siteFiles" | "editorFiles">): ArticleRow[] {
  const { index, siteFiles, editorFiles } = state;
  const usedSite = new Set<string>(), usedEditor = new Set<string>(), usedEntries = new Set<string>();
  const rows: ArticleRow[] = [];
  for (const p of projects) {
    if (isBlankProject(p)) continue;
    const id = p.meta?.articleId;
    const entry = id ? index.articles[id] : undefined;
    const file = projectFile(p);
    const title = projectTitle(p) || "بدون عنوان";
    if (entry && !usedEntries.has(entry.articleId)) {
      usedEntries.add(entry.articleId);
      const onSite = entry.status === "published" && siteFiles.has(entry.file);
      const inEditor = entry.status !== "published" && editorFiles.has(entry.file);
      if (onSite) usedSite.add(entry.file);
      if (inEditor) usedEditor.add(entry.file);
      const onGithub = onSite || inEditor;
      // Removed from the site by hand → it is a draft again.
      const status: ArticleStatus = entry.status === "published" && !onSite ? "draft" : entry.status;
      rows.push({ key: p.id, title, file, status, project: p, entry, onGithub, changed: !onGithub || p.updatedAt > entry.updatedAt || entry.file !== file });
    } else if (siteFiles.has(file) && !usedSite.has(file)) {
      usedSite.add(file);
      rows.push({ key: p.id, title, file, status: "published", project: p, onGithub: true, changed: false });
    } else {
      const inEditor = editorFiles.has(file) && !usedEditor.has(file);
      if (inEditor) usedEditor.add(file);
      rows.push({ key: p.id, title, file, status: "draft", project: p, onGithub: inEditor, changed: true });
    }
  }
  for (const entry of Object.values(index.articles)) {
    if (usedEntries.has(entry.articleId)) continue;
    if (entry.status === "published" && siteFiles.has(entry.file) && !usedSite.has(entry.file)) {
      usedSite.add(entry.file);
      rows.push({ key: `id:${entry.articleId}`, title: entry.title, file: entry.file, status: "published", entry, onGithub: true, changed: false });
    } else if (editorFiles.has(entry.file) && !usedEditor.has(entry.file)) {
      usedEditor.add(entry.file);
      rows.push({ key: `id:${entry.articleId}`, title: entry.title, file: entry.file, status: entry.status === "published" ? "draft" : entry.status, entry, onGithub: true, changed: false });
    }
  }
  for (const file of siteFiles) if (!usedSite.has(file)) rows.push({ key: `site:${file}`, title: titleFromFile(file), file, status: "published", onGithub: true, changed: false });
  for (const file of editorFiles) if (!usedEditor.has(file)) rows.push({ key: `editor:${file}`, title: titleFromFile(file), file, status: "draft", onGithub: true, changed: false });
  return rows;
}

/** Articles that must be (re)saved to the editor repo right now: drafts and private ones changed in this browser. */
export function rowsToAutoSave(rows: ArticleRow[]) {
  return rows.filter((r) => r.project && r.status !== "published" && r.changed);
}

/** Category ids the main site accepts (an article with another category is hidden there). */
export function readSiteCategories(categoriesTs: string): string[] | null {
  const body = /export const CATEGORIES\s*=\s*\[([\s\S]*?)\]/.exec(categoriesTs)?.[1];
  return body ? [...body.matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]!) : null;
}

export function rowCategory(row: ArticleRow): string {
  const p = row.project;
  return (p?.meta?.categories?.[0] ?? p?.categories?.[0] ?? "").trim();
}

/* ------------------------------ GitHub ------------------------------ */

async function listArticleFiles(repo: string, branch: string, dir: string): Promise<Set<string>> {
  try {
    const t = await gh(SERVER_TOKEN, `/repos/${repo}/git/trees/${encodeURIComponent(`${branch}:${dir}`)}`);
    return new Set((t?.tree ?? []).filter((e: { type: string; path: string }) => e.type === "blob" && e.path.endsWith(".ts") && !NOT_ARTICLES.has(e.path)).map((e: { path: string }) => e.path));
  } catch (e) {
    if (e instanceof Error && /GitHub 40[49]/.test(e.message)) return new Set();
    throw e;
  }
}

/** Reads the status file; a missing file is an empty list, any other failure stops (so nothing gets overwritten). */
async function readIndex(): Promise<LibraryIndex> {
  try {
    const r = await gh(SERVER_TOKEN, `/repos/${HISTORY_REPO}/contents/${INDEX_PATH}?ref=${EDITOR_BRANCH}`);
    const text = new TextDecoder().decode(Uint8Array.from(atob(String(r.content).replace(/\s/g, "")), (c) => c.charCodeAt(0)));
    const parsed = JSON.parse(text) as LibraryIndex;
    return parsed && typeof parsed.articles === "object" ? parsed : emptyIndex();
  } catch (e) {
    if (e instanceof Error && /GitHub 40[49]/.test(e.message)) return emptyIndex();
    throw e;
  }
}

export async function loadLibrary(): Promise<LibraryState> {
  const [index, siteFiles, editorFiles, cats] = await Promise.all([
    readIndex(),
    listArticleFiles(SITE_REPO, SITE_BRANCH, SITE_ARTICLES_DIR),
    listArticleFiles(HISTORY_REPO, EDITOR_BRANCH, EDITOR_ARTICLES_DIR),
    readRepoText(SITE_REPO, SITE_BRANCH, "src/content/categories/categories.ts").catch(() => null),
  ]);
  return { index, siteFiles, editorFiles, siteCategories: cats ? readSiteCategories(cats) : null };
}

/** One commit to the editor repo: re-reads the status file first, retries once if GitHub moved meanwhile. */
async function updateEditorRepo(message: string, change: (index: LibraryIndex) => { files?: RepoFile[]; remove?: string[] }) {
  for (let attempt = 0; ; attempt++) {
    try {
      const index = await readIndex();
      const { files = [], remove = [] } = change(index);
      return await commitFiles({
        token: SERVER_TOKEN, repo: HISTORY_REPO, branch: EDITOR_BRANCH, message,
        files: [...files, { path: INDEX_PATH, text: JSON.stringify(index, null, 2) }], remove,
      });
    } catch (e) {
      if (attempt === 0 && e instanceof Error && /GitHub 4(09|22)/.test(e.message)) continue;
      throw e;
    }
  }
}

async function ensureArticleId(p: Project): Promise<Project> {
  if (/^[A-Za-z0-9]{11}$/.test(p.meta?.articleId ?? "")) return p;
  const next = { ...p, meta: { ...p.meta, articleId: await newArticleId() } };
  await upsertProject(next);
  return next;
}

const editorPath = (file: string) => `${EDITOR_ARTICLES_DIR}/${file}`;
const sitePath = (file: string) => `${SITE_ARTICLES_DIR}/${file}`;

/** Saves drafts / private articles (this browser's copy) to the editor repo in one commit. */
export async function saveToEditorRepo(projects: Project[], status?: ArticleStatus) {
  if (projects.length === 0) return;
  const ready = await Promise.all(projects.map(ensureArticleId));
  const now = Date.now();
  await updateEditorRepo(ready.length === 1 ? `Save draft: ${projectTitle(ready[0]!)}` : `Save ${ready.length} drafts`, (index) => {
    const files: RepoFile[] = [], remove: string[] = [];
    for (const p of ready) {
      const id = p.meta.articleId!;
      const old = index.articles[id];
      const file = projectFile(p);
      if (old && old.status !== "published" && old.file !== file) remove.push(editorPath(old.file));
      files.push({ path: editorPath(file), text: projectTs(p) });
      const nextStatus = status ?? (old?.status === "private" ? "private" : "draft");
      index.articles[id] = { articleId: id, file, title: projectTitle(p), status: nextStatus, updatedAt: p.updatedAt, savedAt: now };
    }
    return { files, remove };
  });
}

const ID_IN_TS = /\bid:\s*[`'"]([A-Za-z0-9]{11})[`'"]/;
const TITLE_IN_TS = /\btitle:\s*`((?:[^`\\]|\\.)*)`/;

/** The article file text for a row: this browser's copy first, otherwise the GitHub copy. */
async function rowText(row: ArticleRow): Promise<string> {
  if (row.project) return projectTs(row.project);
  const text = row.status === "published"
    ? await readRepoText(SITE_REPO, SITE_BRANCH, sitePath(row.file))
    : await readRepoText(HISTORY_REPO, EDITOR_BRANCH, editorPath(row.file));
  if (text === null) throw new Error("لم أجد ملف المقال على GitHub");
  return text;
}

function rowIdentity(row: ArticleRow, text: string) {
  const id = row.project?.meta?.articleId || row.entry?.articleId || ID_IN_TS.exec(text)?.[1] || `file-${row.file}`;
  const title = row.project ? projectTitle(row.project) : (TITLE_IN_TS.exec(text)?.[1] ?? row.title);
  return { id, title };
}

/** Puts the article on the main site, then removes its draft copy from the editor repo. */
export async function publishRow(row: ArticleRow) {
  if (row.project) row = { ...row, project: await ensureArticleId(row.project) };
  const text = await rowText(row);
  const { id, title } = rowIdentity(row, text);
  const file = row.project ? projectFile(row.project) : row.file;
  const removeSite = row.entry?.status === "published" && row.entry.file !== file ? [sitePath(row.entry.file)] : [];
  const res = await commitFiles({
    token: SERVER_TOKEN, repo: SITE_REPO, branch: SITE_BRANCH, message: `Publish: ${title}`,
    files: [{ path: sitePath(file), text }], remove: removeSite,
  });
  await updateEditorRepo(`Published: ${title}`, (index) => {
    const old = index.articles[id];
    const remove = old && old.status !== "published" ? [editorPath(old.file)] : row.status !== "published" && row.onGithub ? [editorPath(row.file)] : [];
    index.articles[id] = { articleId: id, file, title, status: "published", updatedAt: row.project?.updatedAt ?? old?.updatedAt ?? Date.now(), savedAt: Date.now() };
    return { remove: [...new Set(remove)] };
  });
  return res;
}

/** Locks an article: keeps it in the editor repo only (hidden from the site). */
export async function makePrivate(row: ArticleRow) {
  const text = await rowText(row);
  const { id, title } = rowIdentity(row, text);
  const file = row.project ? projectFile(row.project) : row.file;
  await updateEditorRepo(`Private: ${title}`, (index) => {
    const old = index.articles[id];
    const remove = old && old.status !== "published" && old.file !== file ? [editorPath(old.file)] : [];
    index.articles[id] = { articleId: id, file, title, status: "private", updatedAt: row.project?.updatedAt ?? old?.updatedAt ?? Date.now(), savedAt: Date.now() };
    return { files: [{ path: editorPath(file), text }], remove };
  });
  if (row.status === "published" && row.onGithub) {
    await commitFiles({ token: SERVER_TOKEN, repo: SITE_REPO, branch: SITE_BRANCH, message: `Hide (private): ${title}`, files: [], remove: [sitePath(row.entry?.file ?? row.file)] });
  }
}

/** Unlocks a private article: it becomes a normal draft again (still not on the site). */
export async function makeDraft(row: ArticleRow) {
  const text = await rowText(row);
  const { id, title } = rowIdentity(row, text);
  const file = row.project ? projectFile(row.project) : row.file;
  await updateEditorRepo(`Draft: ${title}`, (index) => {
    const old = index.articles[id];
    const remove = old && old.status !== "published" && old.file !== file ? [editorPath(old.file)] : [];
    index.articles[id] = { articleId: id, file, title, status: "draft", updatedAt: row.project?.updatedAt ?? old?.updatedAt ?? Date.now(), savedAt: Date.now() };
    return { files: [{ path: editorPath(file), text }], remove };
  });
}

/** Removes the article from the site and from the editor repo. (This browser's copy is removed by the caller.) */
export async function deleteFromGithub(row: ArticleRow) {
  const id = row.project?.meta?.articleId || row.entry?.articleId;
  if (row.status === "published" && row.onGithub) {
    await commitFiles({ token: SERVER_TOKEN, repo: SITE_REPO, branch: SITE_BRANCH, message: `Delete: ${row.title}`, files: [], remove: [sitePath(row.entry?.file ?? row.file)] });
  }
  const editorFile = row.status !== "published" && row.onGithub ? (row.entry?.file ?? row.file) : null;
  if (!editorFile && !(id && row.entry)) return;
  await updateEditorRepo(`Delete: ${row.title}`, (index) => {
    const old = id ? index.articles[id] : undefined;
    if (id) delete index.articles[id];
    const remove = new Set<string>();
    if (editorFile) remove.add(editorPath(editorFile));
    if (old && old.status !== "published") remove.add(editorPath(old.file));
    return { remove: [...remove] };
  });
}

/** Removes only the editor-repo copy of a draft (used when an article is deleted from the projects page). */
export async function forgetDraft(p: Project) {
  const id = p.meta?.articleId;
  if (!id) return;
  const index = await readIndex();
  const entry = index.articles[id];
  if (!entry || entry.status === "published") return;
  await updateEditorRepo(`Delete draft: ${entry.title}`, (idx) => {
    const e = idx.articles[id];
    delete idx.articles[id];
    return { remove: e ? [editorPath(e.file)] : [] };
  });
}

/** Downloads a GitHub article into this browser so it can be edited. Returns the new local project. */
export async function openInEditor(row: ArticleRow): Promise<Project> {
  if (row.project) return row.project;
  const text = await rowText(row);
  const { parseArticleTs } = await import("@/lib/article-import");
  // Site files embed their pictures, so they can be far larger than a pasted snippet.
  const a = await parseArticleTs(text, { maxLength: 60_000_000 });
  const now = Date.now();
  const updatedAt = row.entry?.updatedAt ?? now;
  const articleId = a.articleId ?? (await newArticleId());
  const p: Project = {
    id: newId(), title: a.title, excerpt: a.excerpt, thumbnail: a.hero, categories: a.categories, tags: a.tags,
    createdAt: now, updatedAt,
    meta: { title: a.title, slug: a.title.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "untitled", articleId, excerpt: a.excerpt, categories: a.categories, tags: a.tags, hero: a.hero },
    sections: a.sections,
  };
  if (!(await upsertProject(p))) throw new Error("لم يُحفظ المقال في مساحة المتصفح");
  // A site article opened for the first time: remember it so later edits show as "changed".
  if (!row.entry && row.status === "published") {
    await updateEditorRepo(`Track: ${a.title}`, (index) => {
      index.articles[articleId] = { articleId, file: row.file, title: a.title, status: "published", updatedAt, savedAt: now };
      return {};
    });
  }
  return p;
}

/* ---------------- automatic saving from the editor ---------------- */
export type AutoSaveResult = "saved" | "same" | "published" | "skipped";
let queue: Promise<unknown> = Promise.resolve();

/** Saves a draft/private article to the editor repo when it changed; published articles are left for "update on site". */
export function autoSaveArticle(p: Project): Promise<AutoSaveResult> {
  const run = async (): Promise<AutoSaveResult> => {
    if (isBlankProject(p) || !p.meta?.articleId) return "skipped";
    const index = await readIndex();
    const entry = index.articles[p.meta.articleId];
    if (entry?.status === "published") return "published";
    if (!entry && (await listArticleFiles(SITE_REPO, SITE_BRANCH, SITE_ARTICLES_DIR)).has(projectFile(p))) return "published";
    if (entry && entry.updatedAt >= p.updatedAt && entry.file === projectFile(p)) return "same";
    await saveToEditorRepo([p]);
    return "saved";
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}
