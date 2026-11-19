/**
 * Pending file-manager edits on a GitHub repo, kept as a plain "path → blob" map.
 * Nothing is sent until the user confirms; then `treeChanges` lists what to write in one commit.
 * Folders are not stored: in git a folder exists only while it holds files.
 */
export type Blob = { sha: string; mode: string };
export type RepoFiles = Record<string, Blob>;

export function parentDir(path: string) {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

export function baseName(path: string) {
  return path.slice(path.lastIndexOf("/") + 1);
}

const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/** Files at `path` itself or inside the folder `path`. */
export function pathsUnder(files: RepoFiles, path: string): string[] {
  return Object.keys(files).filter((p) => p === path || p.startsWith(`${path}/`));
}

export function exists(files: RepoFiles, path: string) {
  return pathsUnder(files, path).length > 0;
}

/** Direct children of a folder: sub-folders first, then files, each sorted by name. */
export function listDir(files: RepoFiles, dir: string): { name: string; path: string; type: "tree" | "blob" }[] {
  const prefix = dir ? `${dir}/` : "";
  const folders = new Set<string>(), out: { name: string; path: string; type: "tree" | "blob" }[] = [];
  for (const p of Object.keys(files)) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length), slash = rest.indexOf("/");
    if (slash >= 0) folders.add(rest.slice(0, slash));
    else out.push({ name: rest, path: p, type: "blob" });
  }
  const dirs = [...folders].map((name) => ({ name, path: join(dir, name), type: "tree" as const }));
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return [...dirs.sort(byName), ...out.sort(byName)];
}

export function removePaths(files: RepoFiles, paths: string[]): RepoFiles {
  const next = { ...files };
  for (const p of paths) for (const f of pathsUnder(files, p)) delete next[f];
  return next;
}

/** "a.ts" → "a (copy).ts", "a (copy 2).ts", … until the name is free in `dir`. */
export function freeName(files: RepoFiles, dir: string, name: string): string {
  if (!exists(files, join(dir, name))) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 1; ; n++) {
    const candidate = `${stem} (copy${n > 1 ? ` ${n}` : ""})${ext}`;
    if (!exists(files, join(dir, candidate))) return candidate;
  }
}

function relocate(files: RepoFiles, from: string, to: string, keepSource: boolean): RepoFiles {
  const next = { ...files };
  for (const f of pathsUnder(files, from)) {
    next[to + f.slice(from.length)] = files[f]!;
    if (!keepSource) delete next[f];
  }
  return next;
}

/** Copies files/folders into `destDir`; a clashing name gets a "(copy)" suffix. */
export function copyPaths(files: RepoFiles, paths: string[], destDir: string): RepoFiles {
  let next = files;
  for (const p of paths) {
    if (!exists(files, p)) continue;
    next = relocate(next, p, join(destDir, freeName(next, destDir, baseName(p))), true);
  }
  return next;
}

/** Moves (cut + paste) files/folders into `destDir`. Throws on a clash or a folder moved into itself. */
export function movePaths(files: RepoFiles, paths: string[], destDir: string): RepoFiles {
  let next = files;
  for (const p of paths) {
    if (!exists(next, p)) continue;
    if (destDir === p || destDir.startsWith(`${p}/`)) throw new Error(`لا يمكن نقل "${baseName(p)}" إلى داخل نفسه`);
    const to = join(destDir, baseName(p));
    if (to === p) continue;
    if (exists(next, to)) throw new Error(`يوجد بالفعل "${baseName(p)}" في هذا المجلد`);
    next = relocate(next, p, to, false);
  }
  return next;
}

export function renamePath(files: RepoFiles, path: string, newName: string): RepoFiles {
  const name = newName.trim();
  if (!name || name.includes("/") || name === "." || name === "..") throw new Error("اسم غير صالح");
  const to = join(parentDir(path), name);
  if (to === path) return files;
  if (exists(files, to)) throw new Error(`يوجد بالفعل "${name}" في هذا المجلد`);
  return relocate(files, path, to, false);
}

/** What one commit must write to turn `before` into `after` (sha null = delete). */
export function treeChanges(before: RepoFiles, after: RepoFiles): { path: string; mode: string; type: "blob"; sha: string | null }[] {
  const out: { path: string; mode: string; type: "blob"; sha: string | null }[] = [];
  for (const [p, b] of Object.entries(after)) {
    const old = before[p];
    if (!old || old.sha !== b.sha || old.mode !== b.mode) out.push({ path: p, mode: b.mode, type: "blob", sha: b.sha });
  }
  for (const p of Object.keys(before)) if (!(p in after)) out.push({ path: p, mode: before[p]!.mode, type: "blob", sha: null });
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Edited file contents live only in the browser until Confirm, under a temporary "local:" sha. */
export const LOCAL_SHA = "local:";
export const isLocalSha = (sha: string | null | undefined): sha is string => !!sha && sha.startsWith(LOCAL_SHA);

/** Points one existing file at new content (a GitHub blob sha or a local draft sha), keeping its mode. */
export function setFileSha(files: RepoFiles, path: string, sha: string): RepoFiles {
  const old = files[path];
  if (!old) throw new Error("الملف غير موجود");
  return { ...files, [path]: { sha, mode: old.mode } };
}

/** Uploads every edited draft once and swaps its local sha for the real GitHub blob sha. */
export async function uploadDrafts<C extends { sha: string | null }>(
  changes: C[], drafts: Record<string, string>, createBlob: (text: string) => Promise<string>,
): Promise<C[]> {
  const made: Record<string, string> = {};
  const out: C[] = [];
  for (const c of changes) {
    if (!isLocalSha(c.sha)) { out.push(c); continue; }
    const text = drafts[c.sha];
    if (text === undefined) throw new Error("ضاع تعديل غير محفوظ، ألغِ التغييرات وأعد المحاولة");
    made[c.sha] ??= await createBlob(text);
    out.push({ ...c, sha: made[c.sha]! });
  }
  return out;
}
