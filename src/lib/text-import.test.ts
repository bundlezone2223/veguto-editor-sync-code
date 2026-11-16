import { describe, expect, it } from "vitest";
import { parseArticleText } from "./text-import";

describe("plain text article import", () => {
  it("keeps important words inline instead of creating separate sections", () => {
    expect(parseArticleText("قبل **مثال** و *مثال* بعد")).toEqual([
      { type: "p", text: "قبل **مثال** و *مثال* بعد" },
    ]);
  });
  it("converts every supported format", () => {
    const text = "## Main\n\n### Sub\n\nFirst line\nsecond line\n\n**Important point**\n\nNext para\n\n• One\n• Two\n\n1. A\n2. B\n\n> Quote text\n— Source";
    expect(parseArticleText(text)).toEqual([
      { type: "h2", text: "Main" },
      { type: "h3", text: "Sub" },
      { type: "p", text: "First line\nsecond line" },
      { type: "p", text: "**Important point**" },
      { type: "p", text: "Next para" },
      { type: "list", items: ["One", "Two"] },
      { type: "list", items: ["A", "B"], ordered: true },
      { type: "quote", text: "Quote text", cite: "Source" },
    ]);
  });
  it("keeps list items together even with blank lines missing", () => {
    expect(parseArticleText("• a\n• b\nText")).toEqual([{ type: "list", items: ["a", "b"] }, { type: "p", text: "Text" }]);
  });
  it("joins bullets separated by blank lines into one list, ends it at a paragraph", () => {
    expect(parseArticleText("• a\n\n• b\n\nParagraph")).toEqual([
      { type: "list", items: ["a", "b"] },
      { type: "p", text: "Paragraph" },
    ]);
  });
  it("starts a new list when the bullet type changes", () => {
    expect(parseArticleText("• a\n\n1. b")).toEqual([
      { type: "list", items: ["a"] },
      { type: "list", items: ["b"], ordered: true },
    ]);
  });
});
