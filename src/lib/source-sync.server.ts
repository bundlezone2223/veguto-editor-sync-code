/**
 * Dev-preview only: compares the editor's own files with the main GitHub copy and,
 * when they differ, sends the site's files to GitHub in one commit (older versions stay
 * in the GitHub history, plus a small record under history/).
 */
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ignore from "ignore";
import {
  UPDATE_REPO, decideSync, diffCount, diffFiles, newVersionError, readVersion, setVersionText, updateStatus,
  type FileDiff, type UpdateStatus,
} from "./app-update";

const API = `https://api.github.com/repos/${UPDATE_REPO}`;
const SKIP_DIRS = new Set([".git", "node_modules", ".jj"]);

export function gitBlobSha(buf: Uint8Array): string {
  return createHash("sha1").update(`blob ${buf.byteLength}\0`).update(buf).digest("hex");
}

/** Same file set as scripts/github-sync.py (rg): honours every .gitignore, skips .git, dependencies and .env files. */
export async function readLocalFiles(root: string): Promise<Map<string, Buffer>> {
  type Rules = { base: string; ig: ReturnType<typeof ignore> };
  const loadRules = async (dir: string, file: string): Promise<Rules[]> => {
    try { return [{ base: dir, ig: ignore().add(await readFile(path.join(root, dir, file), "utf8")) }]; } catch { return []; }
  };
  const ignored = (rules: Rules[], rel: string) =>
    rules.some((r) => { const sub = r.base ? rel.slice(r.base.length + 1) : rel; return sub !== "" && r.ig.ignores(sub); });
  const out = new Map<string, Buffer>();
  const walk = async (dir: string, parentRules: Rules[]) => {
    const rules = [...parentRules, ...(await loadRules(dir, ".gitignore")), ...(await loadRules(dir, ".ignore"))];
    for (const e of await readdir(path.join(root, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (SKIP_DIRS.has(e.name)) continue;
      if (e.isDirectory()) {
        if (!ignored(rules, `${rel}/`)) await walk(rel, rules);
      } else if (e.isFile()) {
        if (e.name.startsWith(".env") || ignored(rules, rel)) continue;
        out.set(rel, await readFile(path.join(root, rel)));
      }
    }
  };
  await walk("", await loadRules("", ".git/info/exclude"));
  return out;
}

async function gh(token: string, p: string, init: { method?: string; body?: unknown; accept?: string } = {}) {
  const res = await fetch(`${API}${p}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: init.accept ?? "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "veguto-studio",
    },
    body: init.body === undefined ? null : JSON.stringify(init.body),
  });
  return res;
}

async function ghJson(token: string, p: string, init: { method?: string; body?: unknown } = {}) {
  const res = await gh(token, p, init);
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export type SyncResult = {
  available: true;
  status: UpdateStatus;
  local: string;
  remote: string | null;
  action: "same" | "push" | "pull-prompt";
  diff: FileDiff;
  pushed: { sha: string; url: string; count: number } | null;
};

/**
 * `version` (optional): send the site with this new version number. The version file is changed in
 * the upload first and written to the site only after GitHub accepted the commit.
 */
export async function compareAndPush(push: boolean, version?: string): Promise<SyncResult> {
  const token = process.env["GITHUB_PERSONAL_ACCESS_TOKEN"];
  if (!token) throw new Error("GITHUB_PERSONAL_ACCESS_TOKEN غير مضبوط");
  const root = process.cwd();
  const files = await readLocalFiles(root);
  let newVersionText: string | null = null;
  if (version !== undefined) {
    const current = files.get("src/version.ts")?.toString("utf8") ?? "";
    const err = newVersionError(version, readVersion(current) ?? "0.0.0");
    if (err) throw new Error(err);
    newVersionText = setVersionText(current, version, new Date().toISOString().slice(0, 10));
    files.set("src/version.ts", Buffer.from(newVersionText));
  }
  const local = readVersion(files.get("src/version.ts")?.toString("utf8") ?? "") ?? "0.0.0";
  const localSha: Record<string, string> = {};
  for (const [p, buf] of files) localSha[p] = gitBlobSha(buf);

  // Current GitHub state (an empty repo has no branch yet).
  let parent: string | null = null, baseTree: string | null = null;
  const remoteSha: Record<string, string> = {};
  const ref = await gh(token, "/git/ref/heads/main");
  if (ref.ok) {
    parent = (await ref.json()).object.sha as string;
    const commit = await ghJson(token, `/git/commits/${parent}`);
    baseTree = commit.tree.sha;
    const tree = await ghJson(token, `/git/trees/${baseTree}?recursive=1`);
    if (tree.truncated) throw new Error("GitHub tree is too large to compare");
    for (const e of tree.tree as { path: string; type: string; sha: string }[]) if (e.type === "blob") remoteSha[e.path] = e.sha;
  } else if (![404, 409].includes(ref.status)) {
    throw new Error(`GitHub ${ref.status}`);
  }
  let remote: string | null = null;
  if (remoteSha["src/version.ts"]) {
    const v = await gh(token, "/contents/src/version.ts", { accept: "application/vnd.github.raw+json" });
    if (v.ok) remote = readVersion(await v.text());
  }

  const status = updateStatus(local, remote);
  const diff = diffFiles(localSha, remoteSha);
  const action = decideSync(status, diffCount(diff));
  const result: SyncResult = { available: true, status, local, remote, action, diff, pushed: null };
  if (newVersionText !== null && status === "site-older") throw new Error(`GitHub عنده إصدار أحدث (${remote})؛ اجلبه أولا`);
  if (!push || action !== "push") return result;

  // Upload only the files that changed, then one commit on top of the current GitHub copy.
  const upload = [...diff.added, ...diff.changed];
  const entries: { path: string; mode: string; type: string; sha?: string | null; content?: string }[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, upload.length) }, async () => {
    while (next < upload.length) {
      const p = upload[next++]!;
      const blob = await ghJson(token, "/git/blobs", { method: "POST", body: { content: files.get(p)!.toString("base64"), encoding: "base64" } });
      entries.push({ path: p, mode: "100644", type: "blob", sha: blob.sha });
    }
  }));
  for (const p of diff.removed) entries.push({ path: p, mode: "100644", type: "blob", sha: null });
  const savedAt = new Date().toISOString();
  entries.push({
    path: `history/${savedAt.replace(/[:.]/g, "-")}-${(parent ?? "first").slice(0, 7)}.json`,
    mode: "100644", type: "blob",
    content: JSON.stringify({ kind: "editor-sync", version: local, previousVersion: remote, previousSha: parent, savedAt, ...diff }, null, 2),
  });
  const tree = await ghJson(token, "/git/trees", { method: "POST", body: baseTree ? { tree: entries, base_tree: baseTree } : { tree: entries } });
  const message = `Veguto editor ${local} — ${diffCount(diff)} file(s) updated`;
  const commit = await ghJson(token, "/git/commits", { method: "POST", body: { message, tree: tree.sha, parents: parent ? [parent] : [] } });
  if (parent) await ghJson(token, "/git/refs/heads/main", { method: "PATCH", body: { sha: commit.sha } });
  else await ghJson(token, "/git/refs", { method: "POST", body: { ref: "refs/heads/main", sha: commit.sha } });
  if (newVersionText !== null) await writeFile(path.join(root, "src/version.ts"), newVersionText);
  result.pushed = { sha: commit.sha, url: `https://github.com/${UPDATE_REPO}/commit/${commit.sha}`, count: diffCount(diff) };
  return result;
}
