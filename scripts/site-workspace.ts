import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const SITE_REPO = "bundlezone2223/veguto";
export const excluded = (p: string) => p.split("/").some((x) => [".git", ".jj", "node_modules", "dist", ".output", ".tanstack", ".nitro", ".wrangler"].includes(x) || x.startsWith(".env")) || p === "src/routeTree.gen.ts";
export function safePath(p: string) {
  if (!p || p.startsWith("/") || p.includes("\\") || p.includes("\0") || p.split("/").some((x) => !x || x === "." || x === "..") || excluded(p)) throw new Error("مسار ملف غير مسموح");
  return p;
}
export const blobSha = (b: Uint8Array) => createHash("sha1").update(`blob ${b.byteLength}\0`).update(b).digest("hex");
type Entry = { sha: string; mode: string };
type Files = Record<string, Entry>;
type State = { head: string; files: Files };
export const changes = (base: Files, work: Files) => [...new Set([...Object.keys(base), ...Object.keys(work)])].filter((p) => base[p]?.sha !== work[p]?.sha || base[p]?.mode !== work[p]?.mode).sort();

export class SiteWorkspace {
  root: string;
  stateFile: string;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(public projectRoot: string, private token: () => string | undefined = () => process.env["GITHUB_PERSONAL_ACCESS_TOKEN"]) {
    this.root = path.join(projectRoot, "site"); this.stateFile = path.join(projectRoot, ".site-sync.json");
  }
  async locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn); this.tail = run.catch(() => undefined); return run;
  }
  async gh(p: string, method = "GET", body?: unknown): Promise<any> {
    const token = this.token(); if (!token) throw new Error("مفتاح GitHub غير محفوظ");
    const r = await fetch(`https://api.github.com/repos/${SITE_REPO}${p}`, { method, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "veguto-studio" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!r.ok) throw new Error(`تعذر الاتصال بـ GitHub (${r.status})`);
    return r.json();
  }
  async head(): Promise<string> { return (await this.gh("/git/ref/heads/main")).object.sha; }
  async state(): Promise<State | null> { try { return JSON.parse(await readFile(this.stateFile, "utf8")); } catch { return null; } }
  async readFiles(): Promise<Map<string, Buffer>> {
    const out = new Map<string, Buffer>();
    try { if (!(await lstat(this.root)).isDirectory() || (await lstat(this.root)).isSymbolicLink()) throw new Error("مجلد الموقع غير آمن"); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return out; throw e; }
    const walk = async (dir: string) => {
      for (const e of await readdir(path.join(this.root, dir), { withFileTypes: true })) {
        const p = dir ? `${dir}/${e.name}` : e.name; if (excluded(p)) continue;
        if (e.isSymbolicLink()) throw new Error("الروابط الرمزية غير مسموحة في ملفات الموقع");
        if (e.isDirectory()) await walk(p); else if (e.isFile()) { safePath(p); const b = await readFile(path.join(this.root, p)); if (b.length > 20 * 1024 * 1024) throw new Error("ملف أكبر من الحد المسموح (20 MB)"); out.set(p, b); }
      }
    };
    await walk(""); return out;
  }
  map(buffers: Map<string, Buffer>, base: Files = {}): Files {
    return Object.fromEntries([...buffers].map(([p, b]) => [p, { sha: blobSha(b), mode: base[p]?.mode ?? "100644" }]));
  }
  revision(files: Files) { return createHash("sha256").update(JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))).digest("hex"); }
  async status() {
    const state = await this.state(), files = this.map(await this.readFiles(), state?.files);
    const remote = await this.head();
    return { initialized: !!state, head: state?.head ?? null, remote, files, revision: this.revision(files), dirty: state ? changes(state.files, files) : [], remoteChanged: !!state && state.head !== remote };
  }
  async replace(buffers: Map<string, Buffer>) {
    const stage = path.join(this.projectRoot, ".site-stage"), backup = path.join(this.projectRoot, ".site-backup");
    await rm(stage, { recursive: true, force: true }); await mkdir(stage, { recursive: true });
    for (const [p, b] of buffers) { safePath(p); const target = path.join(stage, p); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, b); }
    await rm(backup, { recursive: true, force: true });
    let existed = false;
    try { await rename(this.root, backup); existed = true; } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    try { await rename(stage, this.root); } catch (e) { if (existed) await rename(backup, this.root); throw e; }
    await rm(backup, { recursive: true, force: true });
  }
  async pull(expectedRevision?: string) {
    return this.locked(async () => {
      const state = await this.state(), local = this.map(await this.readFiles(), state?.files);
      if (expectedRevision && expectedRevision !== this.revision(local)) throw new Error("تغيّرت الملفات محليًا؛ أعد الفحص");
      if ((state && changes(state.files, local).length) || (!state && Object.keys(local).length)) throw new Error("توجد تعديلات محلية؛ انشرها أولًا قبل السحب");
      const head = await this.head(), tree = await this.gh(`/git/trees/${head}?recursive=1`);
      if (tree.truncated) throw new Error("قائمة ملفات GitHub غير مكتملة");
      const entries = (tree.tree as { path: string; sha: string; type: string; mode: string }[]).filter((e) => e.type === "blob" && !excluded(e.path));
      if (entries.length > 3000) throw new Error("المستودع أكبر من الحد المسموح");
      const buffers = new Map<string, Buffer>(), files: Files = {}; let next = 0, total = 0;
      await Promise.all(Array.from({ length: 8 }, async () => {
        while (next < entries.length) {
          const e = entries[next++]; if (!e) continue; safePath(e.path);
          if (!["100644", "100755"].includes(e.mode)) throw new Error("GitHub يحتوي رابطًا رمزيًا غير مسموح");
          const blob = await this.gh(`/git/blobs/${e.sha}`); const b = Buffer.from(blob.content, "base64");
          total += b.length; if (b.length > 20 * 1024 * 1024 || total > 100 * 1024 * 1024) throw new Error("ملفات الموقع تتجاوز الحد المسموح");
          if (blobSha(b) !== e.sha) throw new Error("محتوى ملف GitHub غير مطابق");
          buffers.set(e.path, b); files[e.path] = { sha: e.sha, mode: e.mode };
        }
      }));
      if (head !== await this.head()) throw new Error("تغيّر GitHub أثناء السحب؛ حاول مرة أخرى");
      await this.replace(buffers); await writeFile(this.stateFile, JSON.stringify({ head, files })); return this.status();
    });
  }
  async text(p: string) {
    safePath(p); const b = (await this.readFiles()).get(p); if (!b) throw new Error("الملف غير موجود");
    const binary = /\.(png|jpe?g|gif|webp|avif|ico|pdf|zip|gz|woff2?|ttf|mp[34]|webm)$/i.test(p) || b.includes(0);
    return { text: binary ? null : b.toString("utf8"), size: b.length };
  }
  async apply(revision: string, work: Files, drafts: Record<string, string>) {
    return this.locked(async () => {
      const state = await this.state(); if (!state) throw new Error("اسحب الموقع أولًا");
      const current = await this.readFiles(), files = this.map(current, state.files);
      if (revision !== this.revision(files)) throw new Error("تغيّرت الملفات منذ فتحها؛ أعد تحميل القائمة");
      const bySha = new Map([...current].map(([, b]) => [blobSha(b), b])); const next = new Map<string, Buffer>();
      let total = 0;
      for (const [p, e] of Object.entries(work)) {
        safePath(p); if (!["100644", "100755"].includes(e.mode)) throw new Error("نوع ملف غير مسموح");
        const b = e.sha.startsWith("local:") && typeof drafts[e.sha] === "string" ? Buffer.from(drafts[e.sha] ?? "") : bySha.get(e.sha);
        if (!b) throw new Error("محتوى الملف غير موجود"); total += b.length;
        if (b.length > 20 * 1024 * 1024 || total > 100 * 1024 * 1024) throw new Error("حجم الملفات يتجاوز الحد المسموح"); next.set(p, b);
      }
      // Validate completely before the atomic directory swap; failed batches leave every file intact.
      await this.replace(next); return this.status();
    });
  }
  async publish(message: string, revision: string) {
    return this.locked(async () => {
      if (!message.trim() || message.length > 500) throw new Error("اكتب رسالة تحديث بين 1 و500 حرف");
      const state = await this.state(); if (!state) throw new Error("اسحب الموقع أولًا");
      const buffers = await this.readFiles(), files = this.map(buffers, state.files);
      if (this.revision(files) !== revision) throw new Error("تغيّرت الملفات محليًا؛ أعد الفحص");
      if (state.head !== await this.head()) throw new Error("توجد تحديثات على GitHub؛ لن يتم استبدالها. راجعها أولًا");
      const diff = changes(state.files, files); if (!diff.length) throw new Error("لا توجد تغييرات للنشر");
      const entries = [];
      for (const p of diff) {
        const b = buffers.get(p);
        const sha = b ? (await this.gh("/git/blobs", "POST", { content: b.toString("base64"), encoding: "base64" })).sha : null;
        entries.push({ path: p, mode: files[p]?.mode ?? state.files[p]?.mode ?? "100644", type: "blob", sha });
      }
      const base = await this.gh(`/git/commits/${state.head}`);
      const tree = await this.gh("/git/trees", "POST", { base_tree: base.tree.sha, tree: entries });
      const commit = await this.gh("/git/commits", "POST", { message: message.trim(), tree: tree.sha, parents: [state.head] });
      if (state.head !== await this.head()) throw new Error("تغيّر GitHub أثناء النشر؛ لم يتم استبداله");
      await this.gh("/git/refs/heads/main", "PATCH", { sha: commit.sha, force: false });
      await writeFile(this.stateFile, JSON.stringify({ head: commit.sha, files })); return this.status();
    });
  }
}