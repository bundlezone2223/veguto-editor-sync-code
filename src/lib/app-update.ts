import { APP_VERSION } from "@/version";

/** Main GitHub copy that every editor copy compares itself with. */
export const UPDATE_REPO = "bundlezone2223/veguto-editor-sync-code";
export const UPDATE_REPO_URL = `https://github.com/${UPDATE_REPO}`;
const VERSION_FILE_URL = `https://api.github.com/repos/${UPDATE_REPO}/contents/src/version.ts`;
const NUDGE_API = "/api/public/update-nudge";

export type UpdateStatus = "same" | "site-older" | "github-older" | "no-remote";

function parts(v: string): number[] {
  return v.trim().replace(/^v/i, "").split(".").map((p) => Number.parseInt(p, 10) || 0);
}

/** -1 when a is older than b, 1 when newer, 0 when equal ("1.2" == "1.2.0"). */
export function compareVersions(a: string, b: string): number {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function updateStatus(local: string, remote: string | null): UpdateStatus {
  if (!remote) return "no-remote";
  const c = compareVersions(local, remote);
  return c === 0 ? "same" : c < 0 ? "site-older" : "github-older";
}

/** Reads the version number out of the version file text. */
export function readVersion(fileText: string): string | null {
  return /APP_VERSION\s*=\s*["']([\d.]+)["']/.exec(fileText)?.[1] ?? null;
}

/** Version on GitHub, or null when GitHub has no version file yet. Throws on network errors. */
export async function fetchRemoteVersion(): Promise<string | null> {
  const res = await fetch(VERSION_FILE_URL, { headers: { Accept: "application/vnd.github.raw+json" }, cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return readVersion(await res.text());
}

/** Message the user can paste into the Lovable chat. */
export function requestText(status: UpdateStatus, local: string, remote: string | null): string {
  const base = `فحص التحديث: نسخة الموقع ${local}، نسخة GitHub ${remote ?? "غير موجودة"}.`;
  if (status === "site-older") return `${base} حدّث الموقع من GitHub.`;
  if (status === "github-older" || status === "no-remote") return `${base} ارفع النسخة الأحدث إلى GitHub.`;
  return `${base} النسختان متطابقتان.`;
}

/**
 * The "nudge": leaves a signal the assistant can read — a console line (captured with
 * the next chat message) and, in the editing preview, a small file on the preview server.
 */
export async function sendNudge(info: { status: UpdateStatus; local: string; remote: string | null }) {
  const payload = { ...info, at: new Date().toISOString(), repo: UPDATE_REPO };
  console.info("[veguto-update-nudge]", JSON.stringify(payload));
  if (!import.meta.env.DEV) return;
  try {
    await fetch(NUDGE_API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  } catch { /* the nudge is best-effort */ }
}

export { APP_VERSION };

/** Folders that only GitHub keeps (update records, saved drafts); never compared or removed. */
export const REMOTE_ONLY_PREFIXES = ["history/", "editor-articles/"];
export const isRemoteOnly = (p: string) => REMOTE_ONLY_PREFIXES.some((r) => p.startsWith(r));

/**
 * Server / run-time files of this hosting copy. The GitHub copy carries only the site itself,
 * so these are never compared, uploaded, removed or pulled.
 */
export const RUNTIME_FILES = [
  ".lovable/", ".npmrc", ".prettierignore", ".prettierrc", ".gitignore", "AGENTS.md", "README.md",
  "bun.lock", "bunfig.toml", "package.json", "package-lock.json", "components.json", "eslint.config.js",
  "tsconfig.json", "vite.config.ts", "vitest.config.ts", "wrangler.json",
  "src/router.tsx", "src/server.ts", "src/start.ts", "src/routeTree.gen.ts", "src/routes/README.md",
  "src/lib/error-capture.ts", "src/lib/error-page.ts", "src/lib/lovable-error-reporting.ts",
  "src/test/",
  "site/", ".site-sync.json", ".site-stage/", ".site-backup/", ".site-preview-runtime/",
];

export function isRuntimeFile(p: string) {
  return RUNTIME_FILES.some((r) => (r.endsWith("/") ? p.startsWith(r) : p === r));
}

export type FileDiff = { added: string[]; changed: string[]; removed: string[] };

/** Compares two "path → git blob sha" lists. Files under history/ and editor-articles/ on GitHub are ignored. */
export function diffFiles(local: Record<string, string>, remote: Record<string, string>): FileDiff {
  const added: string[] = [], changed: string[] = [], removed: string[] = [];
  for (const [p, sha] of Object.entries(local)) {
    if (isRuntimeFile(p)) continue;
    if (!(p in remote)) added.push(p);
    else if (remote[p] !== sha) changed.push(p);
  }
  for (const p of Object.keys(remote)) if (!(p in local) && !isRemoteOnly(p) && !isRuntimeFile(p)) removed.push(p);
  return { added: added.sort(), changed: changed.sort(), removed: removed.sort() };
}

export function diffCount(d: FileDiff) {
  return d.added.length + d.changed.length + d.removed.length;
}

/** The file that only holds the version number. */
export const VERSION_FILE = "src/version.ts";

/** The real code difference: the version file alone is not a code change (only its number differs). */
export function codeDiff(d: FileDiff): FileDiff {
  const keep = (l: string[]) => l.filter((p) => p !== VERSION_FILE);
  return { added: keep(d.added), changed: keep(d.changed), removed: keep(d.removed) };
}

/** The newest of the two numbers: what the site really is when its code matches GitHub. */
export function latestVersion(local: string, remote: string | null): string {
  return remote && compareVersions(remote, local) > 0 ? remote : local;
}

/**
 * What the update button does (`changedFiles` counts code files only, never the version file):
 * - same code → nothing to do, whatever the two version numbers say.
 * - code differs and GitHub has a higher version → ask (prompt) to bring GitHub to the site.
 * - otherwise (same or newer site version) → send the site's files to GitHub.
 */
export function decideSync(status: UpdateStatus, changedFiles: number): "same" | "push" | "pull-prompt" {
  if (changedFiles === 0) return "same";
  if (status === "site-older") return "pull-prompt";
  return "push";
}

/** A version the user can pick: three numbers, e.g. 1.4.2. */
export const VERSION_PATTERN = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** Why `next` cannot be sent as the new version (null when it can): it may not be lower than the current one. */
export function newVersionError(next: string, current: string): string | null {
  if (!VERSION_PATTERN.test(next)) return "رقم الإصدار يجب أن يكون بالشكل 1.2.3";
  if (compareVersions(next, current) < 0) return `الرقم ${next} أقدم من الإصدار الحالي ${current}`;
  return null;
}

/** The suggested next version: the last number plus one. */
export function nextPatchVersion(v: string): string {
  const [a = 0, b = 0, c = 0] = parts(v);
  return `${a}.${b}.${c + 1}`;
}

/** Version file text with a new version number and date. */
export function setVersionText(text: string, version: string, date: string): string {
  return text
    .replace(/(APP_VERSION\s*=\s*["'])[\d.]+(["'])/, `$1${version}$2`)
    .replace(/(APP_VERSION_DATE\s*=\s*["'])[^"']*(["'])/, `$1${date}$2`);
}

/** Chat request to bring the GitHub files into the site even when both have the same version. */
export function pullRequestText(local: string, remote: string | null): string {
  return `فحص التحديث: نسخة الموقع ${local}، نسخة GitHub ${remote ?? "غير موجودة"}. اجلب ملفات GitHub إلى الموقع.`;
}
