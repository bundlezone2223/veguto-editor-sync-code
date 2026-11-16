import { z } from "zod";

const stringOrList = z.union([z.string(), z.array(z.string())]).optional();
const metadataSchema = z.object({
  title: z.string().trim().min(1, "العنوان مطلوب."),
  description: z.string().optional(),
  excerpt: z.string().optional(),
  thumbnail: z.string().trim().optional(),
  hero: z.string().trim().optional(),
  category: z.string().optional(),
  categories: stringOrList,
  tags: stringOrList,
});

const splitEntries = (value: string) => value.split(/[\n\r,،]+/).map((item) => item.trim()).filter(Boolean);
const toList = (value: string | string[] | undefined) =>
  Array.from(new Set((Array.isArray(value) ? value.flatMap(splitEntries) : splitEntries(value ?? ""))));

export type ImportedMetadata = {
  title: string;
  excerpt: string;
  thumbnailUrl: string;
  categories: string[];
  tags: string[];
};

/** Parse metadata-only JSON. The JSON is data, never executable code. */
export function parseMetadataJson(source: string): ImportedMetadata {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("النص ليس JSON صالحاً.");
  }

  const result = metadataSchema.safeParse(value);
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "تحقق من حقول JSON.");

  const rawThumbnail = result.data.thumbnail || result.data.hero || "";
  if (rawThumbnail) {
    try {
      const url = new URL(rawThumbnail);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    } catch {
      throw new Error("رابط الصورة يجب أن يبدأ بـ http:// أو https://.");
    }
  }

  const categories = toList(result.data.categories);
  const category = result.data.category?.trim();
  if (category && !categories.includes(category)) categories.unshift(category);

  return {
    title: result.data.title,
    excerpt: result.data.description ?? result.data.excerpt ?? "",
    thumbnailUrl: rawThumbnail,
    categories,
    tags: toList(result.data.tags),
  };
}