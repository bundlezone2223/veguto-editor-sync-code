import { canLower } from "@/components/VersionPicker";

describe("version counter lower limit", () => {
  it("cannot go below the newest current version", () => {
    expect(canLower([1, 4, 4], 2, "1.4.4")).toBe(false);
    expect(canLower([1, 4, 5], 2, "1.4.4")).toBe(true);
  });
  it("can lower a smaller number when a bigger one is already higher", () => {
    expect(canLower([2, 4, 0], 1, "1.4.4")).toBe(true);
  });
});
