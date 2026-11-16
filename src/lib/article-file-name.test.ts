import { describe, expect, it } from "vitest";
import { articleFileName } from "./article-file-name";

describe("article download filename", () => {
  it("uses the article title and removes filesystem-reserved characters", () => {
    expect(articleFileName("My / Great: Article?", "Abc12345678")).toBe("My-Great-Article.ts");
  });

  it("keeps Arabic article titles as the downloaded filename", () => {
    expect(articleFileName("ميراكلس الدعسوقة")).toBe("ميراكلس-الدعسوقة.ts");
  });

  it("uses the permanent article ID when the title has no safe filename characters", () => {
    expect(articleFileName("...///???", "Abc12345678")).toBe("Abc12345678.ts");
  });
});