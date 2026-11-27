// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SiteWorkspace, blobSha, changes, safePath } from "../../scripts/site-workspace";
import { diffFiles } from "./app-update";

describe("main-site local workspace", () => {
  let root: string, workspace: SiteWorkspace;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "veguto-workspace-test-"));
    workspace = new SiteWorkspace(root, () => "test-only");
    await mkdir(workspace.root);
    await writeFile(path.join(workspace.root, "README.md"), "original");
    await writeFile(workspace.stateFile, JSON.stringify({ head: "base", files: { "README.md": { sha: blobSha(Buffer.from("original")), mode: "100644" } } }));
    vi.spyOn(workspace, "head").mockResolvedValue("base");
  });
  afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });

  it("rejects traversal, absolute paths, secrets and generated output", () => {
    for (const p of ["../outside", "/tmp/outside", "src/../../outside", "src\\..\\outside", ".env", "a/.env.production", "node_modules/a.js", ".git/config", "dist/app.js", "src//a.ts"]) expect(() => safePath(p)).toThrow();
    expect(safePath("src/routes/index.tsx")).toBe("src/routes/index.tsx");
  });
  it("rejects symlink reads outside site", async () => {
    await symlink(path.join(root, "outside"), path.join(workspace.root, "escape"));
    await expect(workspace.readFiles()).rejects.toThrow("الروابط الرمزية");
  });
  it("saves a text edit and a binary copy in one local batch without contacting GitHub writes", async () => {
    const s = await workspace.status();
    const work = { ...s.files, "README.md": { sha: "local:1", mode: "100644" }, "copy.md": { sha: blobSha(Buffer.from("original")), mode: "100644" } };
    const remote = vi.spyOn(workspace, "gh");
    const result = await workspace.apply(s.revision, work, { "local:1": "new text" });
    expect(await readFile(path.join(workspace.root, "README.md"), "utf8")).toBe("new text");
    expect(await readFile(path.join(workspace.root, "copy.md"), "utf8")).toBe("original");
    expect(result.dirty).toEqual(["README.md", "copy.md"]);
    expect(remote).not.toHaveBeenCalled();
  });
  it("rejects the entire batch when one path is unsafe, preserving original files", async () => {
    const s = await workspace.status();
    await expect(workspace.apply(s.revision, { "README.md": { sha: "local:1", mode: "100644" }, "../escape": { sha: "local:1", mode: "100644" } }, { "local:1": "changed" })).rejects.toThrow();
    expect(await readFile(path.join(workspace.root, "README.md"), "utf8")).toBe("original");
  });
  it("rejects stale local revisions", async () => {
    const s = await workspace.status(); await writeFile(path.join(workspace.root, "README.md"), "external edit");
    await expect(workspace.apply(s.revision, s.files, {})).rejects.toThrow("تغيّرت الملفات");
    expect(await readFile(path.join(workspace.root, "README.md"), "utf8")).toBe("external edit");
  });
  it("does not pull over unpublished local edits", async () => {
    await writeFile(path.join(workspace.root, "README.md"), "local edit");
    await expect(workspace.pull()).rejects.toThrow("توجد تعديلات محلية");
    expect(await readFile(path.join(workspace.root, "README.md"), "utf8")).toBe("local edit");
  });
  it("publishes exactly the changed local files in one non-forced commit and then reads back matched status", async () => {
    await writeFile(path.join(workspace.root, "README.md"), "published text");
    const s = await workspace.status();
    const requests: { p: string; method: string; body: unknown }[] = [];
    vi.spyOn(workspace, "gh").mockImplementation(async (p, method = "GET", body) => {
      requests.push({ p, method, body });
      if (p === "/git/blobs") return { sha: blobSha(Buffer.from("published text")) };
      if (p === "/git/commits/base") return { tree: { sha: "base-tree" } };
      if (p === "/git/trees") return { sha: "next-tree" };
      if (p === "/git/commits") return { sha: "published" };
      if (p === "/git/refs/heads/main") { vi.mocked(workspace.head).mockResolvedValue("published"); return {}; }
      throw new Error("Unexpected GitHub request");
    });
    const result = await workspace.publish("Custom commit message", s.revision);
    expect(requests.find((r) => r.p === "/git/commits")?.body).toEqual({ message: "Custom commit message", tree: "next-tree", parents: ["base"] });
    expect(requests.find((r) => r.p === "/git/refs/heads/main")?.body).toEqual({ sha: "published", force: false });
    expect(result.dirty).toEqual([]); expect(result.remoteChanged).toBe(false); expect(result.head).toBe("published");
  });
  it("never publishes over a concurrent GitHub update", async () => {
    await writeFile(path.join(workspace.root, "README.md"), "local edit");
    const s = await workspace.status(); vi.mocked(workspace.head).mockResolvedValue("someone-else");
    const gh = vi.spyOn(workspace, "gh");
    await expect(workspace.publish("Update", s.revision)).rejects.toThrow("توجد تحديثات");
    expect(gh).not.toHaveBeenCalled();
  });
  it("reports deletions and never includes the site workspace or state in studio sync", () => {
    expect(changes({ "old.ts": { sha: "a", mode: "100644" } }, {})).toEqual(["old.ts"]);
    expect(diffFiles({ "site/src/index.ts": "a", ".site-sync.json": "b", ".site-preview-runtime/main.tsx": "c" }, {})).toEqual({ added: [], changed: [], removed: [] });
  });
});