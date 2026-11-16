import { describe, expect, it } from "vitest";
import type { Section } from "./article-content";
import { planImageLayouts } from "./image-layout";

const img = (src: string): Section => ({ type: "image", src, alt: "", caption: "" });
const p = (n: number): Section => ({ type: "p", text: "ن".repeat(n) });
const ratios: Record<string, number> = { tall: 1.5, tall2: 1.5, tall3: 1.4, wide: 0.5 };
const plan = (s: Section[]) => planImageLayouts(s, (src) => ratios[src]);

describe("image layout planner", () => {
  it("floats a tall image only when enough text follows it", () => {
    expect(plan([img("tall"), p(1200)])[0]).toEqual({ kind: "float", side: "start" });
    expect(plan([img("tall"), p(100), { type: "h2", text: "x" }])[0]).toEqual({ kind: "center" });
  });
  it("alternates sides between floated images", () => {
    const l = plan([img("tall"), p(1200), img("tall2"), p(1200)]);
    expect(l[0]).toEqual({ kind: "float", side: "start" });
    expect(l[2]).toEqual({ kind: "float", side: "end" });
  });
  it("puts consecutive tall images side by side instead of stacking floats", () => {
    const l = plan([img("tall"), img("tall2"), img("tall3"), p(2000)]);
    expect(l.slice(0, 3).map((x) => x?.kind)).toEqual(["gallery", "gallery", "gallery"]);
  });
  it("keeps wide images full width", () => {
    expect(plan([img("wide"), p(2000)])[0]).toEqual({ kind: "full" });
  });
});
