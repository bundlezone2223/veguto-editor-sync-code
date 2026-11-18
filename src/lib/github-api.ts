/**
 * Minimal GitHub client. Requests go through a server function that holds the
 * saved GITHUB_PERSONAL_ACCESS_TOKEN and only reaches the two fixed repos.
 */
import { HISTORY_REPO, SITE_REPO, githubProxy } from "./github-proxy.functions";

export const SERVER_TOKEN = "@server";
const SETTINGS_KEY = "veguto:github-settings";

export type GithubSettings = {
  token: string;
  /** Repo the main site reads articles + home layout from, "owner/name". */
  siteRepo: string;
  siteBranch: string;
  /** Repo that receives full code ZIP uploads, "owner/name". */
  codeRepo: string;
  codeBranch: string;
};

export const DEFAULT_GITHUB_SETTINGS: GithubSettings = {
  token: SERVER_TOKEN, siteRepo: SITE_REPO, siteBranch: "main", codeRepo: SITE_REPO, codeBranch: "main",
};
export { SITE_REPO, HISTORY_REPO };

export function loadGithubSettings(): GithubSettings {
  return { ...DEFAULT_GITHUB_SETTINGS };
}

export function saveGithubSettings(s: GithubSettings) {
  void s; try { localStorage.removeItem(SETTINGS_KEY); } catch { /* ignore */ }
}

export function isRepoName(v: string) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(v.trim());
}

/** A file to write: text (utf-8) or binary given as Base64. */
export type RepoFile = { path: string; text?: string; base64?: string };

async function raw(path: string, init: { method?: string; body?: string | undefined; accept?: string } = {}) {
  return githubProxy({ data: { method: init.method ?? "GET", path, body: init.body, accept: init.accept } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function gh(_token: string, path: string, init: { method?: string; body?: string | undefined } = {}) {
  const res = await raw(path, init);
  if (res.status >= 300) {
    let msg = res.text;
    try { msg = JSON.parse(res.text).message ?? res.text; } catch { /* plain text */ }
    throw new Error(`GitHub ${res.status}: ${msg}`);
  }
  return res.text ? JSON.parse(res.text) : null;
}

export async function checkRepoAccess(token: string, repo: string): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await gh(token, `/repos/${repo}`);
    return r?.permissions?.push ? { ok: true, message: "متصل ولديك صلاحية الكتابة" } : { ok: false, message: "المستودع موجود لكن الرمز لا يملك صلاحية الكتابة" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

async function runLimited<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]!, i); }
  }));
  return out;
}

/**
 * Writes all files in ONE commit. `replaceAll` makes the commit contain only these files
 * (used for full code uploads); otherwise files are added on top of what is already there.
 */
export async function commitFiles(opts: {
  token: string; repo: string; branch: string; message: string; files: RepoFile[];
  replaceAll?: boolean; remove?: string[]; onProgress?: (done: number, total: number) => void;
}): Promise<{ sha: string; url: string; count: number }> {
  const { token, repo, branch, files } = opts;
  const remove = opts.replaceAll ? [] : (opts.remove ?? []);
  if (files.length === 0 && remove.length === 0) throw new Error("لا توجد ملفات للرفع");
  let parent: string | null = null, baseTree: string | null = null;
  try {
    const ref = await gh(token, `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    parent = ref.object.sha;
    const commit = await gh(token, `/repos/${repo}/git/commits/${parent}`);
    baseTree = commit.tree.sha;
  } catch (e) {
    // An empty repo has no branch yet; GitHub refuses blobs there, so seed it with a first file.
    if (!(e instanceof Error) || !/40[49]/.test(e.message)) throw e;
    await gh(token, `/repos/${repo}/contents/.veguto`, { method: "PUT", body: JSON.stringify({ message: "Start", content: btoa("veguto\n"), branch }) });
    const ref = await gh(token, `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    parent = ref.object.sha;
    baseTree = (await gh(token, `/repos/${repo}/git/commits/${parent}`)).tree.sha;
  }
  let done = 0;
  const tree = await runLimited(files, 6, async (f) => {
    const body = f.base64 !== undefined ? { content: f.base64, encoding: "base64" } : { content: f.text ?? "", encoding: "utf-8" };
    const blob = await gh(token, `/repos/${repo}/git/blobs`, { method: "POST", body: JSON.stringify(body) });
    opts.onProgress?.(++done, files.length);
    return { path: f.path, mode: "100644", type: "blob", sha: blob.sha as string | null };
  });
  for (const path of remove) tree.push({ path, mode: "100644", type: "blob", sha: null });
  const t = await gh(token, `/repos/${repo}/git/trees`, {
    method: "POST", body: JSON.stringify(opts.replaceAll ? { tree } : { tree, base_tree: baseTree }),
  });
  const c = await gh(token, `/repos/${repo}/git/commits`, {
    method: "POST", body: JSON.stringify({ message: opts.message, tree: t.sha, parents: parent ? [parent] : [] }),
  });
  await gh(token, `/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { method: "PATCH", body: JSON.stringify({ sha: c.sha }) });
  return { sha: c.sha, url: `https://github.com/${repo}/commit/${c.sha}`, count: files.length };
}

/** Reads a JSON file from the repo, or null when it does not exist. */
export async function readRepoJson<T>(token: string, repo: string, branch: string, path: string): Promise<T | null> {
  void token;
  try {
    const r = await raw(`/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`, { accept: "application/vnd.github.raw+json" });
    if (r.status >= 300) return null;
    return JSON.parse(r.text) as T;
  } catch { return null; }
}

/** An empty repo (409) or missing branch (404) simply has nothing to list. */
function emptyRepo(e: unknown): null {
  if (e instanceof Error && /GitHub 40[49]/.test(e.message)) return null;
  throw e;
}

export type TreeEntry = { path: string; type: "blob" | "tree"; size?: number };
export async function listTree(repo: string, ref: string): Promise<TreeEntry[]> {
  const t = await gh(SERVER_TOKEN, `/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`).catch(emptyRepo);
  return (t?.tree ?? []).map((e: TreeEntry) => ({ path: e.path, type: e.type, size: e.size }));
}

export type CommitInfo = { sha: string; message: string; date: string; author: string };
export async function listCommits(repo: string, branch: string, page = 1): Promise<CommitInfo[]> {
  const list = await gh(SERVER_TOKEN, `/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=30&page=${page}`).catch(emptyRepo);
  return (list ?? []).map((c: { sha: string; commit: { message: string; author: { date: string; name: string } } }) => ({
    sha: c.sha, message: c.commit.message, date: c.commit.author.date, author: c.commit.author.name,
  }));
}

export type ChangedFile = { filename: string; status: string; additions: number; deletions: number };
export async function commitChanges(repo: string, sha: string): Promise<ChangedFile[]> {
  const c = await gh(SERVER_TOKEN, `/repos/${repo}/commits/${sha}`);
  return (c?.files ?? []).map((f: ChangedFile) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions }));
}

export async function readRepoText(repo: string, ref: string, path: string): Promise<string | null> {
  const r = await raw(`/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`, { accept: "application/vnd.github.raw+json" });
  return r.status >= 300 ? null : r.text;
}

/** Saves a small record (message, sha, changed files — never the files themselves) to the history repo. */
export async function recordHistory(entry: { sha: string; message: string; repo: string; files: ChangedFile[] }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const text = JSON.stringify({ ...entry, savedAt: new Date().toISOString() }, null, 2);
  await commitFiles({ token: SERVER_TOKEN, repo: HISTORY_REPO, branch: "main", message: `History: ${entry.message}`, files: [{ path: `history/${stamp}-${entry.sha.slice(0, 7)}.json`, text }] });
}
