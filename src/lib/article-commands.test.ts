import { describe, expect, it } from "vitest";
import { applyCommands, parseCommands } from "./article-commands";
import type { Section } from "./article-content";

const meta = { title: "T", slug: "t", excerpt: "", categories: [], tags: [], hero: "" };
const sections: Section[] = [
  { type: "h2", text: "Intro" },
  { type: "p", text: "Ladybug fights Hawk Moth." },
  { type: "h2", text: "Cast" },
  { type: "image", src: "a.png", alt: "poster" },
];
const run = (ops: unknown[]) => applyCommands({ meta, sections }, parseCommands(JSON.stringify({ version: 1, ops })), { "https://x/y.jpg": "data:image/jpeg;base64,AA" });

describe("article commands", () => {
  it("sets meta", () => expect(run([{ op: "set_meta", title: "New", tags: ["a"] }]).article.meta).toMatchObject({ title: "New", tags: ["a"], slug: "t" }));
  it("inserts after a heading", () => expect(run([{ op: "insert", target: { heading: "cast" }, sections: [{ type: "p", text: "X" }] }]).article.sections[3]).toEqual({ type: "p", text: "X" }));
  it("inserts at end", () => expect(run([{ op: "insert", target: "end", sections: [{ type: "p", text: "Z" }] }]).article.sections).toHaveLength(5));
  it("replaces by anchor", () => expect(run([{ op: "replace", target: { anchor_text: "hawk moth" }, sections: [{ type: "p", text: "R" }] }]).article.sections[1]).toEqual({ type: "p", text: "R" }));
  it("deletes count", () => expect(run([{ op: "delete", target: { index: 0 }, count: 2 }]).article.sections[0]).toEqual({ type: "h2", text: "Cast" }));
  it("moves a section", () => expect(run([{ op: "move", target: { index: 3 }, to: { heading: "Intro" } }]).article.sections[1]!.type).toBe("image"));
  it("finds and replaces", () => expect(run([{ op: "find_replace", find: "fights", replace: "beats" }]).article.sections[1]).toEqual({ type: "p", text: "Ladybug beats Hawk Moth." }));
  it("bolds terms once", () => {
    const r = run([{ op: "bold_terms", terms: ["Ladybug"] }, { op: "bold_terms", terms: ["Ladybug"] }]);
    expect(r.article.sections[1]).toEqual({ type: "p", text: "**Ladybug** fights Hawk Moth." });
  });
  it("adds image with downloaded data", () => expect(run([{ op: "add_image", target: { heading: "Intro" }, url: "https://x/y.jpg", alt: "a" }]).article.sections[1]).toEqual({ type: "image", src: "data:image/jpeg;base64,AA", alt: "a" }));
  it("updates and removes image", () => {
    expect(run([{ op: "update_image", target: { anchor_text: "poster" }, caption: "C" }]).article.sections[3]).toMatchObject({ caption: "C", src: "a.png" });
    expect(run([{ op: "remove_image", target: { index: 3 } }]).article.sections).toHaveLength(3);
  });
  it("rejects bad input without changes", () => {
    expect(() => parseCommands('{"ops":[{"op":"nope"}]}')).toThrow(/الأمر 1/);
    expect(() => parseCommands('{"ops":[{"op":"insert","target":"end","sections":[{"type":"zzz"}]}]}')).toThrow();
    expect(() => run([{ op: "set_meta", title: "N" }, { op: "delete", target: { heading: "missing" } }])).toThrow(/الأمر 2/);
    expect(sections).toHaveLength(4);
  });
});

describe("replace_text_preserve_images", () => {
  const img = (src: string): Section => ({ type: "image", src, alt: "" });
  const base: Section[] = [{ type: "p", text: "أ" }, img("1"), { type: "h2", text: "ب" }, { type: "p", text: "ج" }, img("2"), img("3")];
  const apply = (src: string) => applyCommands({ meta, sections: base }, parseCommands(src));
  it("keeps each image after the same paragraph and reads the article after the marker", () => {
    const r = apply('{"version":1,"ops":[{"op":"replace_text_preserve_images"}]}\n===ARTICLE===\n# New Title\n\nA\n\n## B\n\nC');
    expect(r.article.sections).toEqual([{ type: "p", text: "A" }, img("1"), { type: "h2", text: "B" }, { type: "p", text: "C" }, img("2"), img("3")]);
    expect(r.article.meta.title).toBe("New Title");
  });
  it("spreads images proportionally when the block count changes", () => {
    const r = apply(JSON.stringify({ ops: [{ op: "replace_text_preserve_images", text: "A\n\nB\n\nC\n\nD\n\nE\n\nF" }] }));
    expect(r.article.sections.map((x) => x.type === "image" ? x.src : "t").join("")).toBe("tt1tttt23");
  });
  it("rejects a missing article text", () => expect(() => parseCommands('{"ops":[{"op":"replace_text_preserve_images"}]}')).toThrow(/ARTICLE/));
});
