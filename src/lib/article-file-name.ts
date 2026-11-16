/** Create a portable .ts filename from the article's visible title. */
export function articleFileName(title: string, fallback = "untitled"): string {
  const safe = title
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[. -]+|[. -]+$/g, "")
    .slice(0, 120);
  return `${safe || fallback}.ts`;
}