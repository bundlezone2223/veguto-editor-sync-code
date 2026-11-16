import { describe, expect, it } from "vitest";
import { editableText, inlineBoldHtml, parseInlineBold } from "./inline-bold";

describe("inline important words", () => {
  it("makes double-star words bold within the surrounding paragraph", () => {
    expect(parseInlineBold("قبل **مثال** بعد")).toEqual([{ text: "قبل " }, { text: "مثال", marker: "**" }, { text: " بعد" }]);
  });
  it("makes single-star words bold too", () => {
    expect(parseInlineBold("قبل *مثال* بعد")).toEqual([{ text: "قبل " }, { text: "مثال", marker: "*" }, { text: " بعد" }]);
  });
  it("preserves both star formats after editing and saving", () => {
    const element = document.createElement("div");
    element.innerHTML = inlineBoldHtml("قبل **مثال** و *مهم* بعد");
    expect(editableText(element)).toBe("قبل **مثال** و *مهم* بعد");
  });
  it("treats pasted markup as text, not executable HTML", () => {
    const element = document.createElement("div");
    element.innerHTML = inlineBoldHtml('**<img src=x onerror="alert(1)">**');
    expect(element.querySelector("img")).toBeNull();
    expect(editableText(element)).toBe('**<img src=x onerror="alert(1)">**');
  });
});