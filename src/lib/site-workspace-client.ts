import type { RepoFiles } from "./repo-edits";
export type WorkspaceStatus = { initialized: boolean; head: string | null; remote: string; files: RepoFiles; revision: string; dirty: string[]; remoteChanged: boolean };
let session: Promise<string> | null = null;
export async function workspaceCall<T>(action: string, data: unknown = {}): Promise<T> {
  if (!import.meta.env.DEV) throw new Error("ملفات الموقع المحلية متاحة داخل المعاينة فقط");
  session ??= fetch("/api/site-workspace/session").then(async (r) => { if (!r.ok) throw new Error("تعذر فتح جلسة الموقع المحلية"); const d = await r.json(); return d.key as string; }).catch((e) => { session = null; throw e; });
  const key = await session;
  const r = await fetch(`/api/site-workspace/${action}`, { method: "POST", headers: { "content-type": "application/json", "x-site-workspace-key": key }, body: JSON.stringify(data) });
  const d = await r.json(); if (!r.ok) { if (r.status === 403) session = null; throw new Error(d.error ?? "تعذرت العملية"); } return d as T;
}