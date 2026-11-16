import { describe, expect, it } from "vitest";
import { parseArticleTs } from "./article-import";

describe("TS article import", () => {
  it("imports exported article fields and all editor section types", async () => {
    const result = await parseArticleTs('import type { Section } from "./types"; export const article = { id: "Abc12345678", title: `English article`, description: `Card text`, thumbnail: "", category: "Guides", tags: ["wiki"], content: [{type:"h2",text:"Heading"},{type:"h3",text:"Subheading"},{type:"p",text:`Arabic العربية\nEnglish`},{type:"emphasis",text:"Important"},{type:"list",items:["One"],ordered:true},{type:"quote",text:"Quote",cite:"Source"},{type:"image",src:"https://example.com/image.jpg",alt:"Image"},{type:"callout",title:"Note",text:"Details"}] as Section[] }; export default article;');
    expect(result).toMatchObject({ title: "English article", articleId: "Abc12345678", categories: ["Guides"], tags: ["wiki"], excerpt: "Card text" });
    expect(result.sections.map((section) => section.type)).toEqual(["h2", "h3", "p", "emphasis", "list", "quote", "image", "callout"]);
    expect(result.sections[2]).toEqual({ type: "p", text: "Arabic العربية\nEnglish" });
  });
  it("rejects executable expressions without running them", async () => {
    await expect(parseArticleTs('export const article = { title: (() => "Injected")(), content: [] };')).rejects.toThrow();
    await expect(parseArticleTs('export default { title: `${fetch("https://example.com")}`, content: [] };')).rejects.toThrow();
  });
  it("rejects invalid sections and incomplete syntax", async () => {
    await expect(parseArticleTs('export default { title: "Test", content: [{type:"list",items:"wrong"}] };')).rejects.toThrow();
    await expect(parseArticleTs('export const article = { title: "Test", content: [')).rejects.toThrow();
  });
  it("accepts JSON article data and rejects unsafe images", async () => {
    expect((await parseArticleTs('{"title":"Draft","sections":[],"tags":[]}')).sections).toEqual([]);
    await expect(parseArticleTs('{"title":"Draft","thumbnail":"javascript:alert(1)","sections":[]}')).rejects.toThrow();
  });
});