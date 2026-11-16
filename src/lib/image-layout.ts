import type { Section } from "@/lib/article-content";

/** How an image section is laid out in the article. */
export type ImageLayout =
  | { kind: "full" }
  | { kind: "center" }
  | { kind: "float"; side: "start" | "end" }
  | { kind: "gallery"; cols: 2 | 3; first: boolean };

/** height / width above this counts as a tall (portrait) image. */
export const TALL_RATIO = 1.15;

/** Characters of following text needed so a floated image of this ratio is not left beside empty space. */
export const minTextForFloat = (ratio: number) => Math.round(380 * ratio);

const TEXT_TYPES = new Set<Section["type"]>(["p", "list", "quote", "h3", "emphasis"]);

const textLength = (s: Section) =>
  s.type === "list" ? s.items.join(" ").length : "text" in s ? s.text.length : 0;

/** Chooses a layout for every image so tall images sit beside enough text, never stack or leave gaps.
 *  `ratioOf` returns height/width once the image has loaded (undefined before). */
export function planImageLayouts(sections: Section[], ratioOf: (src: string) => number | undefined): (ImageLayout | null)[] {
  const out: (ImageLayout | null)[] = sections.map(() => null);
  const isTall = (s: Section | undefined) => {
    if (s?.type !== "image" || !s.src) return false;
    const r = ratioOf(s.src);
    return r !== undefined && r > TALL_RATIO;
  };
  let floats = 0;
  let i = 0;
  while (i < sections.length) {
    const s = sections[i];
    if (s?.type !== "image") { i++; continue; }

    // Run of consecutive tall images → side-by-side gallery rows (max 3 per row).
    let end = i;
    while (isTall(sections[end])) end++;
    const run = end - i;
    if (run >= 2) {
      for (let start = i; start < end; start += 3) {
        const size = Math.min(3, end - start);
        // A lone leftover is paired with nothing; show it centered instead.
        for (let k = 0; k < size; k++) {
          out[start + k] = size === 1 ? { kind: "center" } : { kind: "gallery", cols: size as 2 | 3, first: k === 0 };
        }
      }
      i = end;
      continue;
    }

    if (!isTall(s)) { out[i] = { kind: "full" }; i++; continue; }

    let chars = 0;
    for (let j = i + 1; j < sections.length; j++) {
      const next = sections[j];
      if (!next || !TEXT_TYPES.has(next.type)) break;
      chars += textLength(next);
    }
    const ratio = ratioOf(s.src) ?? 1;
    if (chars >= minTextForFloat(ratio)) {
      out[i] = { kind: "float", side: floats % 2 === 0 ? "start" : "end" };
      floats++;
    } else {
      out[i] = { kind: "center" };
    }
    i++;
  }
  return out;
}

/** Sections that must start below any floated image. */
export function needsClearBefore(sections: Section[], layouts: (ImageLayout | null)[], i: number) {
  const s = sections[i];
  if (!s) return false;
  if (s.type === "h2" || s.type === "callout") return true;
  if (s.type !== "image") return false;
  const l = layouts[i];
  return !(l?.kind === "gallery" && !l.first);
}
