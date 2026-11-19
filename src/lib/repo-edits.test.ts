import { copyPaths, listDir, movePaths, removePaths, renamePath, setFileSha, treeChanges, uploadDrafts, type RepoFiles } from "@/lib/repo-edits";

const b = (sha: string) => ({ sha, mode: "100644" });
const files: RepoFiles = { "a.txt": b("1"), "docs/x.md": b("2"), "docs/sub/y.md": b("3"), "src/z.ts": b("4") };

describe("file manager edits", () => {
  it("lists folders before files", () => {
    expect(listDir(files, "").map((e) => e.name)).toEqual(["docs", "src", "a.txt"]);
  });
  it("deleting a folder deletes everything inside it", () => {
    expect(Object.keys(removePaths(files, ["docs"]))).toEqual(["a.txt", "src/z.ts"]);
  });
  it("copying into the same folder adds a (copy) name and keeps the original", () => {
    const next = copyPaths(files, ["a.txt"], "");
    expect(next["a.txt"]).toEqual(b("1"));
    expect(next["a (copy).txt"]).toEqual(b("1"));
  });
  it("cut and paste moves a folder with its contents", () => {
    const next = movePaths(files, ["docs"], "src");
    expect(next["src/docs/sub/y.md"]).toEqual(b("3"));
    expect(next["docs/x.md"]).toBeUndefined();
  });
  it("refuses to move a folder into itself", () => {
    expect(() => movePaths(files, ["docs"], "docs/sub")).toThrow();
  });
  it("refuses to overwrite an existing name when moving", () => {
    const withClash = { ...files, "src/a.txt": b("9") };
    expect(() => movePaths(withClash, ["a.txt"], "src")).toThrow();
  });
  it("rename keeps the file content", () => {
    expect(renamePath(files, "a.txt", "b.txt")["b.txt"]).toEqual(b("1"));
  });
  it("confirm writes only the differences", () => {
    const next = movePaths(files, ["a.txt"], "src");
    expect(treeChanges(files, next)).toEqual([
      { path: "a.txt", mode: "100644", type: "blob", sha: null },
      { path: "src/a.txt", mode: "100644", type: "blob", sha: "1" },
    ]);
  });
});

describe("editing a file's text", () => {
  it("an edited file counts as one change and keeps its mode", () => {
    const next = setFileSha(files, "src/z.ts", "local:1");
    expect(treeChanges(files, next)).toEqual([{ path: "src/z.ts", mode: "100644", type: "blob", sha: "local:1" }]);
  });
  it("on confirm the edited text is uploaded once and its real sha is written", async () => {
    const next = copyPaths(setFileSha(files, "a.txt", "local:1"), ["a.txt"], "docs");
    const uploaded: string[] = [];
    const out = await uploadDrafts(treeChanges(files, next), { "local:1": "new text" }, async (t) => { uploaded.push(t); return "real"; });
    expect(uploaded).toEqual(["new text"]);
    expect(out.map((c) => [c.path, c.sha])).toEqual([["a.txt", "real"], ["docs/a.txt", "real"]]);
  });
  it("refuses to confirm when an edited text went missing", async () => {
    const next = setFileSha(files, "a.txt", "local:9");
    await expect(uploadDrafts(treeChanges(files, next), {}, async () => "x")).rejects.toThrow();
  });
});
