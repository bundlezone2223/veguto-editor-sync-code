import { compareVersions, decideSync, diffCount, diffFiles, readVersion, updateStatus } from "@/lib/app-update";
import { gitBlobSha } from "@/lib/source-sync.server";

describe("version comparison", () => {
  it("treats a lower number as older", () => {
    expect(compareVersions("1.0.0", "1.1.0")).toBe(-1);
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
  });
  it("says the site is older when GitHub has a higher version", () => {
    expect(updateStatus("1.0.0", "1.0.1")).toBe("site-older");
  });
  it("says GitHub is older when the site has a higher version", () => {
    expect(updateStatus("2.0.0", "1.9.9")).toBe("github-older");
  });
  it("reports no remote when GitHub has no version file", () => {
    expect(updateStatus("1.0.0", null)).toBe("no-remote");
  });
  it("reads the version out of the version file", () => {
    expect(readVersion('export const APP_VERSION = "1.4.2";')).toBe("1.4.2");
    expect(readVersion("nothing here")).toBeNull();
  });
});

describe("file comparison for the update button", () => {
  it("same version and same files means nothing to do", () => {
    const d = diffFiles({ "a.ts": "1" }, { "a.ts": "1" });
    expect(diffCount(d)).toBe(0);
    expect(decideSync("same", diffCount(d))).toBe("same");
  });
  it("same version but different files sends the site's files to GitHub", () => {
    const d = diffFiles({ "a.ts": "2", "new.ts": "3" }, { "a.ts": "1", "old.ts": "4" });
    expect(d).toEqual({ added: ["new.ts"], changed: ["a.ts"], removed: ["old.ts"] });
    expect(decideSync("same", diffCount(d))).toBe("push");
  });
  it("an older site version gives a prompt instead of overwriting GitHub", () => {
    expect(decideSync("site-older", 5)).toBe("pull-prompt");
  });
  it("never removes the update records kept on GitHub", () => {
    expect(diffFiles({}, { "history/x.json": "1" }).removed).toEqual([]);
  });
  it("hashes files the same way GitHub does", () => {
    expect(gitBlobSha(new TextEncoder().encode("hello\n"))).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });
});
