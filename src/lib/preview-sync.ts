import type { Project } from "@/lib/projects-store";

/**
 * Dev-preview mirror: the editor copies the open article to the preview server
 * so the assistant's browser can open the exact same article. Base64 images are
 * uploaded once each and replaced by short image links in the mirrored copy.
 * Only active in the dev preview (never in the published site).
 */
export const SYNC_ENABLED = import.meta.env.DEV;
const API = "/api/public/preview-sync";
const uploaded = new Set<string>();
const hashCache = new Map<string, string>();

async function hashOf(dataUrl: string) {
  const cached = hashCache.get(dataUrl);
  if (cached) return cached;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(dataUrl));
  const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  hashCache.set(dataUrl, hex);
  return hex;
}

async function lighten(value: unknown): Promise<unknown> {
  if (typeof value === "string") {
    if (!value.startsWith("data:image/")) return value;
    const hash = await hashOf(value);
    if (!uploaded.has(hash)) {
      const res = await fetch(`${API}?img=${hash}`, { method: "POST", headers: { "content-type": "text/plain" }, body: value });
      if (!res.ok) throw new Error("image upload failed");
      uploaded.add(hash);
    }
    return `${API}?img=${hash}`;
  }
  if (Array.isArray(value)) return Promise.all(value.map(lighten));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = await lighten(v);
    return out;
  }
  return value;
}

export async function pushPreview(project: Project) {
  if (!SYNC_ENABLED) return;
  try {
    const light = await lighten(project);
    await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(light) });
  } catch { /* mirror is best-effort */ }
}

export async function pullPreview(id: string): Promise<Project | null> {
  if (!SYNC_ENABLED) return null;
  try {
    const res = await fetch(`${API}?id=${encodeURIComponent(id)}`);
    return res.ok ? ((await res.json()) as Project) : null;
  } catch { return null; }
}
