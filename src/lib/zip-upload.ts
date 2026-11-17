import { unzipSync } from "fflate";
import type { RepoFile } from "@/lib/github-api";

/** Never upload repository metadata, installed packages, build output or secret files. */
const SKIP_DIRS = new Set([".git", "node_modules", ".jj", "dist", ".output", ".wrangler", ".vinxi", ".tanstack", ".DS_Store", "__MACOSX"]);

export function shouldSkip(path: string): boolean {
  const parts = path.split("/");
  if (parts.some((p) => SKIP_DIRS.has(p))) return true;
  const base = parts[parts.length - 1] ?? "";
  return base === "" || base.startsWith(".env") || base === ".DS_Store";
}

/** When every file sits inside one folder (as GitHub/Lovable ZIPs do), drop that folder. */
export function stripCommonRoot(paths: string[]): string {
  if (paths.length === 0) return "";
  const first = paths[0]!.split("/")[0]!;
  if (!paths.every((p) => p.includes("/") && p.split("/")[0] === first)) return "";
  return `${first}/`;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Reads a ZIP and returns the files to upload (paths relative to the project root). */
export function readZip(data: Uint8Array): { files: RepoFile[]; skipped: number; root: string } {
  const entries = unzipSync(data);
  const names = Object.keys(entries).filter((n) => !n.endsWith("/") && !n.startsWith("__MACOSX/"));
  const root = stripCommonRoot(names);
  const files: RepoFile[] = [];
  let skipped = 0;
  for (const name of names) {
    const path = name.slice(root.length);
    if (shouldSkip(path)) { skipped++; continue; }
    files.push({ path, base64: toBase64(entries[name]!) });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, skipped, root };
}
