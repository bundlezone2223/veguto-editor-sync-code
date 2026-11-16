import { compareVersions, readVersion, updateStatus } from "@/lib/app-update";

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
