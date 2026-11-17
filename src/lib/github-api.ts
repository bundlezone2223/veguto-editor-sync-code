/**
 * Minimal GitHub client that runs in the browser with the user's own token
 * (saved only in this browser), so no secret key ever sits on a public server.
 */
const API = "https://api.github.com";
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
  token: "", siteRepo: "", siteBranch: "main", codeRepo: "bundlezone2223/veguto-editor-sync-code", codeBranch: "main",
};

export function loadGithubSettings(): GithubSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return { ...DEFAULT_GITHUB_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch { return { ...DEFAULT_GITHUB_SETTINGS }; }
}

export function saveGithubSettings(s: GithubSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function isRepoName(v: string) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(v.trim());
}

/** A file to write: text (utf-8) or binary given as Base64. */
export type RepoFile = { path: string; text?: string; base64?: string };

async function gh(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    let msg = body;
    try { msg = JSON.parse(body).message ?? body; } catch { /* plain text */ }
    throw new Error(`GitHub ${res.status}: ${msg}`);
  }
  return res.status === 204 ? null : res.json();
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
  try {
    const r = await fetch(`${API}/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`, {
      headers: { Accept: "application/vnd.github.raw+json", Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}
