import { describe, it, expect } from "vitest";
import { detectArticleDir } from "./article-direction";
describe("detectArticleDir", () => {
  it("Arabic body with English title is rtl", () => expect(detectArticleDir(["Miraculous: Tales", "هذا مقال عربي طويل عن المسلسل والشخصيات"])).toBe("rtl"));
  it("English article is ltr", () => expect(detectArticleDir(["Miraculous", "This is an English article about the show"])).toBe("ltr"));
  it("empty defaults to rtl", () => expect(detectArticleDir([])).toBe("rtl"));
});
