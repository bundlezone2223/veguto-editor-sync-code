import type { Section } from "@/lib/article-content";

/** Convert the fixed plain-text article format (##, ###, •, 1., >, —) into editor sections. */
export function parseArticleText(source: string): Section[] {
  const sections: Section[] = [];
  let paragraph: string[] = [];
  let list: { items: string[]; ordered: boolean } | null = null;
  const flushParagraph = () => {
    if (paragraph.length) sections.push({ type: "p", text: paragraph.join("\n") });
    paragraph = [];
  };
  const flushList = () => {
    if (list?.items.length) sections.push({ type: "list", items: list.items, ...(list.ordered ? { ordered: true } : {}) });
    list = null;
  };
  const flush = () => { flushParagraph(); flushList(); };

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    // A blank line ends the current paragraph but keeps an open list running:
    // bullets/numbers separated by blank lines still belong to the same list,
    // until a heading, quote or plain paragraph line starts a different block.
    if (!line) { flushParagraph(); continue; }
    let match: RegExpMatchArray | null;
    if ((match = line.match(/^###\s+(.+)$/))) { flush(); sections.push({ type: "h3", text: (match[1] ?? "").trim() }); continue; }
    if ((match = line.match(/^##\s+(.+)$/))) { flush(); sections.push({ type: "h2", text: (match[1] ?? "").trim() }); continue; }
    if ((match = line.match(/^•\s*(.+)$/))) {
      flushParagraph();
      if (!list || list.ordered) { flushList(); list = { items: [], ordered: false }; }
      list.items.push((match[1] ?? "").trim()); continue;
    }
    if ((match = line.match(/^\d+[.)]\s+(.+)$/))) {
      flushParagraph();
      if (!list || !list.ordered) { flushList(); list = { items: [], ordered: true }; }
      list.items.push((match[1] ?? "").trim()); continue;
    }
    if ((match = line.match(/^>\s?(.*)$/))) {
      flush();
      const prev = sections[sections.length - 1];
      if (prev?.type === "quote" && prev.cite === undefined) prev.text += "\n" + (match[1] ?? "").trim();
      else sections.push({ type: "quote", text: (match[1] ?? "").trim() });
      continue;
    }
    if ((match = line.match(/^[—–]\s*(.+)$/))) {
      const prev = sections[sections.length - 1];
      if (!paragraph.length && !list && prev?.type === "quote" && prev.cite === undefined) { prev.cite = (match[1] ?? "").trim(); continue; }
    }
    flushList();
    paragraph.push(line);
  }
  flush();
  return sections;
}
