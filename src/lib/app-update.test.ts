import { isRuntimeFile, compareVersions, decideSync, diffCount, diffFiles, newVersionError, nextPatchVersion, readVersion, setVersionText, updateStatus } from "@/lib/app-update";
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
  it("never removes the draft articles saved on GitHub", () => {
    expect(diffFiles({}, { "editor-articles/Miraculous.ts": "1", "editor-articles/index.json": "2" }).removed).toEqual([]);
  });
  it("hashes files the same way GitHub does", () => {
    expect(gitBlobSha(new TextEncoder().encode("hello\n"))).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });
});

describe("runtime files stay out of the GitHub copy", () => {
  it("ignores server files on both sides", () => {
    const d = diffFiles({ "src/server.ts": "1", "package.json": "2", "src/routes/index.tsx": "3" }, { "src/start.ts": "9" });
    expect(d).toEqual({ added: ["src/routes/index.tsx"], changed: [], removed: [] });
  });
  it("treats site files as site files", () => {
    expect(isRuntimeFile("src/lib/article-commands.ts")).toBe(false);
    expect(isRuntimeFile("src/test/setup.ts")).toBe(true);
  });
});

describe("picking a new version in the update window", () => {
  it("suggests the last number plus one", () => {
    expect(nextPatchVersion("1.4.0")).toBe("1.4.1");
  });
  it("refuses a version lower than the current one", () => {
    expect(newVersionError("1.3.9", "1.4.0")).not.toBeNull();
  });
  it("accepts the same or a higher version", () => {
    expect(newVersionError("1.4.0", "1.4.0")).toBeNull();
    expect(newVersionError("2.0.0", "1.4.0")).toBeNull();
  });
  it("refuses a version that is not three numbers", () => {
    expect(newVersionError("1.4", "1.0.0")).not.toBeNull();
  });
  it("writes the picked version and date into the version file", () => {
    const text = 'export const APP_VERSION = "1.4.0";\nexport const APP_VERSION_DATE = "2026-11-20";';
    expect(setVersionText(text, "1.5.0", "2026-11-21")).toBe('export const APP_VERSION = "1.5.0";\nexport const APP_VERSION_DATE = "2026-11-21";');
  });
});
