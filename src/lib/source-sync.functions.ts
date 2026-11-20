import { createServerFn } from "@tanstack/react-start";
import { VERSION_PATTERN } from "./app-update";

/**
 * Compares the editor's files with GitHub and, when `push` is true and they differ,
 * sends the site's files to GitHub. With `version`, the site is sent under that new version number. Only works in the editing preview, where the
 * project files exist; elsewhere it answers { available: false }.
 */
export const syncEditorCode = createServerFn({ method: "POST" })
  .inputValidator((d: { push?: boolean; version?: string } | undefined) => {
    const version = d?.version;
    if (version !== undefined && (typeof version !== "string" || !VERSION_PATTERN.test(version))) throw new Error("رقم إصدار غير صالح");
    return version === undefined ? { push: d?.push === true } : { push: true, version };
  })
  .handler(async ({ data }) => {
    if (!import.meta.env.DEV) return { available: false as const };
    const { compareAndPush } = await import("./source-sync.server");
    return compareAndPush(data.push, "version" in data ? data.version : undefined);
  });
