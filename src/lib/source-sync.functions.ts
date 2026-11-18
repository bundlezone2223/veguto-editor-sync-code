import { createServerFn } from "@tanstack/react-start";

/**
 * Compares the editor's files with GitHub and, when `push` is true and they differ,
 * sends the site's files to GitHub. Only works in the editing preview, where the
 * project files exist; elsewhere it answers { available: false }.
 */
export const syncEditorCode = createServerFn({ method: "POST" })
  .inputValidator((d: { push?: boolean } | undefined) => ({ push: d?.push === true }))
  .handler(async ({ data }) => {
    if (!import.meta.env.DEV) return { available: false as const };
    const { compareAndPush } = await import("./source-sync.server");
    return compareAndPush(data.push);
  });
