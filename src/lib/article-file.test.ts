import { describe, expect, it } from "vitest";
import { readArticleFile } from "./article-file";

describe("TS article files", () => {
  it("imports static TS article text and embedded pictures", async () => {
    const article = await readArticleFile({ name: "article.ts", text: async () => 'export const article = { title: "مقال جاهز", content: [{type:"p",text:"نص المقال"},{type:"image",src:"data:image/png;base64,AQID",alt:"صورة"}] };' });
    expect(article.title).toBe("مقال جاهز");
    expect(article.sections).toEqual([{ type: "p", text: "نص المقال" }, { type: "image", src: "data:image/png;base64,AQID", alt: "صورة" }]);
  });
  it("rejects ZIP instead of treating it as TS", async () => {
    await expect(readArticleFile({ name: "article.zip", text: async () => "" })).rejects.toThrow("TS");
  });
  it("never executes code in an imported TS file", async () => {
    await expect(readArticleFile({ name: "article.ts", text: async () => 'export const article = { title: (() => "unsafe")(), content: [] };' })).rejects.toThrow();
  });
});