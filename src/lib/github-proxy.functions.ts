import { createServerFn } from "@tanstack/react-start";

/** Only these repos can be reached through the saved server token. */
export const SITE_REPO = "bundlezone2223/veguto";
export const HISTORY_REPO = "bundlezone2223/veguto-editor-sync-code";
const ALLOWED = [SITE_REPO, HISTORY_REPO];

export function isAllowedPath(path: string) {
  return ALLOWED.some((r) => path === `/repos/${r}` || path.startsWith(`/repos/${r}/`) || path.startsWith(`/repos/${r}?`)) && !path.includes("..");
}

type Input = { method: string; path: string; body?: string | undefined; accept?: string | undefined };

export const githubProxy = createServerFn({ method: "POST" })
  .inputValidator((d: Input) => {
    if (!d || typeof d.path !== "string" || !isAllowedPath(d.path)) throw new Error("مسار غير مسموح");
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(d.method)) throw new Error("طريقة غير مسموحة");
    if (/^\/repos\/[^/]+\/[^/]+\/?$/.test(d.path) && d.method !== "GET") throw new Error("غير مسموح");
    return d;
  })
  .handler(async ({ data }) => {
    const token = process.env["GITHUB_PERSONAL_ACCESS_TOKEN"];
    if (!token) return { status: 500, text: JSON.stringify({ message: "GITHUB_PERSONAL_ACCESS_TOKEN غير مضبوط" }) };
    const res = await fetch(`https://api.github.com${data.path}`, {
      method: data.method,
      headers: {
        Accept: data.accept ?? "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "veguto-studio",
      },
      body: data.body ?? null,
    });
    return { status: res.status, text: res.status === 204 ? "" : await res.text() };
  });
