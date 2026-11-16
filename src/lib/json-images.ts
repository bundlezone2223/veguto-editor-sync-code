import type { Section } from "@/lib/article-content";

/** Shape of one entry of the JSON the site accepts:
 *  { "images": [{ url, source_url, alt, caption, section_heading, anchor_text, position }] } */
export type JsonImageSpec = {
  url: string;
  /** Set after the image is downloaded and converted to a base64 data URL. */
  src?: string;
  sourceUrl: string;
  alt: string;
  caption: string;
  sectionHeading: string;
  anchorText: string;
  position: "before" | "after";
};

export type PlacementMethod = "anchor" | "heading" | "fallback";

export type PlacementResult = {
  url: string;
  alt: string;
  placed: boolean;
  method: PlacementMethod;
  note: string;
};

/** Parse + validate the pasted JSON. Throws an Arabic error message on bad input. */
export function parseImagesJson(source: string): JsonImageSpec[] {
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    throw new Error("النص ليس JSON صالحاً.");
  }
  const arr = (data as { images?: unknown } | null)?.images;
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error('المطلوب كائن JSON يحتوي مصفوفة "images" غير فارغة.');
  }
  return arr.map((raw, i) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const url = typeof item["url"] === "string" ? (item["url"] as string).trim() : "";
    if (!url) throw new Error(`الصورة رقم ${i + 1}: حقل "url" مطلوب.`);
    const str = (key: string) => (typeof item[key] === "string" ? (item[key] as string).trim() : "");
    return {
      url,
      sourceUrl: str("source_url"),
      alt: str("alt") || "صورة",
      caption: str("caption"),
      sectionHeading: str("section_heading"),
      anchorText: str("anchor_text"),
      position: item["position"] === "before" ? "before" : "after",
    } satisfies JsonImageSpec;
  });
}

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Finds a paragraph containing the anchor sentence (whitespace-tolerant, case-insensitive). */
function findAnchor(sections: Section[], anchorText: string): { index: number; start: number; end: number } | null {
  const pattern = anchorText.trim().split(/\s+/).map(escapeRegex).join("\\s+");
  if (!pattern) return null;
  const re = new RegExp(pattern, "i");
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (!s || s.type !== "p") continue;
    const m = re.exec(s.text);
    if (m) return { index: i, start: m.index, end: m.index + m[0].length };
  }
  return null;
}

function findHeading(sections: Section[], heading: string): number {
  const target = normalize(heading);
  if (!target) return -1;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (!s || (s.type !== "h2" && s.type !== "h3")) continue;
    const t = normalize(s.text);
    if (t === target || t.includes(target) || target.includes(t)) return i;
  }
  return -1;
}

const makeImageSection = (spec: JsonImageSpec): Section => {
  const caption = spec.sourceUrl && spec.caption
    ? `${spec.caption} — المصدر: ${spec.sourceUrl}`
    : spec.sourceUrl
      ? `المصدر: ${spec.sourceUrl}`
      : spec.caption;
  return { type: "image", src: spec.src || spec.url, alt: spec.alt, caption };
};

const isBlank = (s: string) => !s.trim();

/** Inserts each image at its anchor/heading position, keeping the original text intact.
 *  Images are applied one by one in order, so several images in one paragraph work. */
export function insertImages(sections: Section[], specs: JsonImageSpec[]): { sections: Section[]; results: PlacementResult[] } {
  let current = sections;
  const results: PlacementResult[] = [];

  for (const spec of specs) {
    const image = makeImageSection(spec);
    let placed = false;

    const anchor = spec.anchorText ? findAnchor(current, spec.anchorText) : null;
    if (anchor) {
      const s = current[anchor.index];
      if (s?.type === "p") {
        const cut = spec.position === "after" ? anchor.end : anchor.start;
        const before = s.text.slice(0, cut).trim();
        const after = s.text.slice(cut).trim();
        const out: Section[] = [];
        if (before) out.push({ type: "p", text: before });
        out.push(image);
        if (after) out.push({ type: "p", text: after });
        current = [...current.slice(0, anchor.index), ...out, ...current.slice(anchor.index + 1)];
        results.push({ url: spec.url, alt: spec.alt, placed: true, method: "anchor", note: "أُدرجت عند الجملة المرجعية." });
        placed = true;
      }
    }

    if (!placed && spec.sectionHeading) {
      const h = findHeading(current, spec.sectionHeading);
      if (h >= 0) {
        const at = spec.position === "after" ? h + 1 : h;
        current = [...current.slice(0, at), image, ...current.slice(at)];
        results.push({ url: spec.url, alt: spec.alt, placed: true, method: "heading", note: "أُدرجت عند عنوان القسم." });
        placed = true;
      }
    }

    if (!placed) {
      const at = spec.position === "after" ? current.length : 0;
      current = [...current.slice(0, at), image, ...current.slice(at)];
      results.push({
        url: spec.url,
        alt: spec.alt,
        placed: true,
        method: "fallback",
        note: "لم أجد النص المرجعي ولا عنوان القسم؛ وضعتها في " + (spec.position === "after" ? "نهاية المقال." : "بداية المقال."),
      });
    }
  }

  return { sections: current, results };
}

export const jsonImagesHasData = (results: PlacementResult[]) => results.some((r) => !isBlank(r.note));
