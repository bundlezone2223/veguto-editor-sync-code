export type InlinePart = { text: string; marker?: "*" | "**" };

/** Both user-supported star formats mean bold, never italic. */
export function parseInlineBold(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const pattern = /\*\*([^*\n]+)\*\*|(?<!\*)\*([^*\n]+)\*(?!\*)/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    if (index > offset) parts.push({ text: text.slice(offset, index) });
    parts.push({ text: match[1] ?? match[2] ?? "", marker: match[1] !== undefined ? "**" : "*" });
    offset = index + match[0].length;
  }
  if (offset < text.length) parts.push({ text: text.slice(offset) });
  return parts;
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "<br>");

export function inlineBoldHtml(text: string): string {
  return parseInlineBold(text).map((part) => part.marker
    ? `<strong data-bold-marker="${part.marker}">${escape(part.text)}</strong>`
    : escape(part.text)).join("");
}

/** Preserve star delimiters when saving the editable rich text as article data. */
export function editableText(element: HTMLElement): string {
  const read = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof HTMLElement)) return "";
    if (node.tagName === "BR") return "\n";
    const text = Array.from(node.childNodes).map(read).join("");
    if (node.tagName === "STRONG" || node.tagName === "B") {
      const marker = node.dataset["boldMarker"] === "*" ? "*" : "**";
      return `${marker}${text}${marker}`;
    }
    return (node.tagName === "DIV" || node.tagName === "P") && node.previousSibling ? `\n${text}` : text;
  };
  return Array.from(element.childNodes).map(read).join("");
}