import { describe, expect, it } from "vitest";
import { formDataToObject, loginSchema, registerSchema } from "@/lib/validation/auth";

describe("auth validation", () => {
  it("normalises emails and enforces password length", () => {
    expect(registerSchema.parse({ email: "  A@Example.COM ", password: "long-enough-1" }).email).toBe("a@example.com");
    expect(registerSchema.safeParse({ email: "a@example.com", password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "not-an-email", password: "long-enough-1" }).success).toBe(false);
  });
  it("does not impose a maximum on login attempts below the hash limit", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x".repeat(129) }).success).toBe(false);
  });
  it("drops framework fields and files from form data", () => {
    const fd = new FormData();
    fd.set("a", "1");
    fd.set("$ACTION_ID_x", "y");
    fd.set("f", new File(["x"], "x.txt"));
    expect(formDataToObject(fd)).toEqual({ a: "1" });
  });
});
