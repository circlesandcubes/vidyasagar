import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/redirect";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/sell/books?x=1")).toBe("/sell/books?x=1");
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "/a\nb", ""])(
    "rejects %j",
    (value) => {
      expect(safeNextPath(value)).toBe("/account");
    },
  );
  it("uses the fallback for null and over-long values", () => {
    expect(safeNextPath(null, "/x")).toBe("/x");
    expect(safeNextPath("/" + "a".repeat(400))).toBe("/account");
  });
});
