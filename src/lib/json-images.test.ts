import { describe, expect, it } from "vitest";
import { insertImages, parseImagesJson } from "./json-images";
import type { Section } from "./article-content";

const article: Section[] = [
  { type: "p", text: "Intro sentence here." },
  { type: "h2", text: "History of the show" },
  { type: "p", text: "The show began as a sticker line before becoming a series." },
  { type: "p", text: "Fans loved the characters immediately." },
];

const spec = (extra: Partial<Parameters<typeof insertImages>[1][number]>): Parameters<typeof insertImages>[1][number] => ({
  url: "https://example.com/a.jpg",
  sourceUrl: "",
  alt: "alt text",
  caption: "",
  sectionHeading: "",
  anchorText: "",
  position: "after",
  ...extra,
});

describe("parseImagesJson", () => {
  it("accepts the documented JSON shape and defaults position to after", () => {
    const specs = parseImagesJson(JSON.stringify({
      images: [{ url: "https://x/i.jpg", source_url: "https://x/p", alt: "d", caption: "c", section_heading: "H", anchor_text: "sentence", position: "after" }],
    }));
    expect(specs).toEqual([{ url: "https://x/i.jpg", src: undefined, sourceUrl: "https://x/p", alt: "d", caption: "c", sectionHeading: "H", anchorText: "sentence", position: "after" }]);
  });
  it("rejects invalid JSON and empty images arrays", () => {
    expect(() => parseImagesJson("not json")).toThrow();
    expect(() => parseImagesJson('{"images":[]}')).toThrow();
  });
});

describe("insertImages", () => {
  it("splits the paragraph and inserts the image right after the anchor sentence", () => {
    const { sections, results } = insertImages(article, [spec({ anchorText: "began as a sticker line", position: "after" })]);
    expect(sections.map((s) => s.type)).toEqual(["p", "h2", "p", "image", "p", "p"]);
    expect(sections[2]).toEqual({ type: "p", text: "The show began as a sticker line" });
    expect(sections[4]).toEqual({ type: "p", text: "before becoming a series." });
    expect(results[0]).toMatchObject({ placed: true, method: "anchor" });
  });

  it("inserts before the anchor sentence when position is before", () => {
    const { sections } = insertImages(article, [spec({ anchorText: "Fans loved", position: "before" })]);
    expect(sections[3]).toMatchObject({ type: "image", alt: "alt text" });
    expect(sections[4]).toEqual({ type: "p", text: "Fans loved the characters immediately." });
  });

  it("falls back to the section heading when the anchor is missing", () => {
    const { sections, results } = insertImages(article, [spec({ sectionHeading: "History of the show" })]);
    expect(sections[2]).toMatchObject({ type: "image" });
    expect(results[0]).toMatchObject({ placed: true, method: "heading" });
  });

  it("keeps the original text untouched when splitting (no words lost)", () => {
    const { sections } = insertImages(article, [spec({ anchorText: "sticker line" })]);
    const text = sections.filter((s) => s.type === "p").map((s) => (s as { text: string }).text).join(" ");
    expect(text).toContain("began as a sticker line before becoming a series.");
  });

  it("appends at the end when nothing matches, and reports it", () => {
    const { sections, results } = insertImages(article, [spec({})]);
    expect(sections[sections.length - 1]).toMatchObject({ type: "image" });
    expect(results[0]).toMatchObject({ placed: true, method: "fallback" });
  });
});
