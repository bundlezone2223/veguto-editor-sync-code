import { expect, it } from "vitest";
import { decodeBase64Bytes } from "./file-download";

it("preserves binary file bytes, including nulls and non-UTF8 bytes", () => {
  expect([...decodeBase64Bytes("AP9/gA==\n")]).toEqual([0, 255, 127, 128]);
});