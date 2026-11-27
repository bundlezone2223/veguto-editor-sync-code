import { describe, expect, it } from "vitest";
import { lineDiff } from "./line-diff";

describe("lineDiff", () => {
  it("marks changed lines as removed then added and keeps the rest", () => {
    expect(lineDiff("a\nb\nc", "a\nB\nc")).toEqual([
      { type: " ", text: "a" }, { type: "-", text: "b" }, { type: "+", text: "B" }, { type: " ", text: "c" },
    ]);
  });
  it("shows only additions for appended lines", () => {
    expect(lineDiff("a", "a\nb").filter((l) => l.type !== " ")).toEqual([{ type: "+", text: "b" }]);
  });
});
