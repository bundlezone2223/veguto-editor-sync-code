import type { Section } from "@/lib/article-content";
import type { Meta } from "@/lib/projects-store";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
const jsonStr = (s: string) => JSON.stringify(s ?? "");

export function serializeSection(s: Section): string {
  switch (s.type) {
    case "h2":
    case "h3":
    case "p":
    case "emphasis":
      return `    { type: "${s.type}", text: \`${esc(s.text)}\` }`;
    case "list":
      return `    { type: "list", ordered: ${s.ordered ? "true" : "false"}, items: [${s.items.map(i => `\`${esc(i)}\``).join(", ")}] }`;
    case "quote":
      return `    { type: "quote", text: \`${esc(s.text)}\`${s.cite ? `, cite: \`${esc(s.cite)}\`` : ""} }`;
    case "image":
      return `    { type: "image", src: ${jsonStr(s.src)}, alt: ${jsonStr(s.alt)}${s.caption ? `, caption: ${jsonStr(s.caption)}` : ""} }`;
    case "callout":
      return `    { type: "callout", title: \`${esc(s.title)}\`, text: \`${esc(s.text)}\` }`;
  }
}

/** The main site's article file format (src/content/articles/<Title>.ts). */
export function buildArticleTs(meta: Meta, sections: Section[]): string {
  const bt = (s: string) => `\`${esc(s ?? "")}\``;
  return `import type { Section } from "./types";

export const article = {
  id: ${bt(meta.articleId ?? "")},
  title: ${bt(meta.title)},${meta.excerpt?.trim() ? `\n  description: ${bt(meta.excerpt.trim())},` : ""}
  thumbnail: ${jsonStr(meta.hero)},
  category: ${bt((meta.categories ?? [])[0] ?? "")},
  tags: [${(meta.tags ?? []).map(bt).join(", ")}],
  content: [
${sections.map(serializeSection).join(",\n")}
  ] as Section[],
};

export default article;
`;
}
