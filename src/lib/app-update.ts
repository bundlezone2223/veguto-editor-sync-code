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
