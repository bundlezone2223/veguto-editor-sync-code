import { describe, expect, it } from "vitest";
import { parseMetadataJson } from "./metadata-import";

describe("metadata JSON import", () => {
  it("reads card metadata and a remote thumbnail URL", () => {
    expect(parseMetadataJson(JSON.stringify({
      title: "Miraculous Ladybug",
      description: "A short card summary.",
      thumbnail: "https://example.com/cover.jpg",
      categories: ["Anime & Manga", "Community"],
      tags: ["ladybug", "paris"],
    }))).toEqual({
      title: "Miraculous Ladybug",
      excerpt: "A short card summary.",
      thumbnailUrl: "https://example.com/cover.jpg",
      categories: ["Anime & Manga", "Community"],
      tags: ["ladybug", "paris"],
    });
  });

  it("supports legacy aliases and normalizes comma-separated metadata", () => {
    expect(parseMetadataJson(JSON.stringify({ title: "Draft", excerpt: "Summary", hero: "", category: "Guides", tags: "one, two" }))).toMatchObject({
      excerpt: "Summary", thumbnailUrl: "", categories: ["Guides"], tags: ["one", "two"],
    });
  });

  it("rejects invalid JSON, missing titles, and non-http image URLs", () => {
    expect(() => parseMetadataJson("no json")).toThrow("JSON");
    expect(() => parseMetadataJson('{"thumbnail":"https://example.com/x.jpg"}')).toThrow();
    expect(() => parseMetadataJson('{"title":"Draft","thumbnail":"javascript:alert(1)"}')).toThrow("http:// أو https://");
  });
});