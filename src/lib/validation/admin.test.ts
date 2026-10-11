import { describe, expect, it } from "vitest";
import { channelSchema, creditSchema, parseSources, skillLinkSchema } from "@/lib/validation/admin";

describe("admin validation", () => {
  it("requires exactly one of existing person or new name", () => {
    const id = "7b3e8f0e-6d8c-4c3e-9a4b-1c2d3e4f5a6b";
    expect(creditSchema.safeParse({ authorId: id, role: "author" }).success).toBe(true);
    expect(creditSchema.safeParse({ newAuthorName: "A B", role: "author" }).success).toBe(true);
    expect(creditSchema.safeParse({ role: "author" }).success).toBe(false);
    expect(creditSchema.safeParse({ authorId: id, newAuthorName: "A", role: "author" }).success).toBe(false);
  });
  it("rejects look-alike retailer hosts", () => {
    expect(channelSchema.safeParse({ channel: "amazon", url: "https://www.amazon.in/dp/X" }).success).toBe(true);
    expect(channelSchema.safeParse({ channel: "amazon", url: "https://amazon.in.evil.example/x" }).success).toBe(false);
    expect(channelSchema.safeParse({ channel: "flipkart", url: "https://www.amazon.in/dp/X" }).success).toBe(false);
  });
  it("requires an explanation for skill links", () => {
    const skillId = "7b3e8f0e-6d8c-4c3e-9a4b-1c2d3e4f5a6b";
    expect(skillLinkSchema.safeParse({ skillId, relation: "practised", explanation: "short" }).success).toBe(false);
    expect(skillLinkSchema.parse({ skillId, relation: "practised", explanation: "Counts planets aloud.", isApproved: "on" }).isApproved).toBe(true);
  });
  it("parses only http(s) sources", () => {
    expect(parseSources("NASA | https://nasa.gov/x").items).toHaveLength(1);
    expect(parseSources("Bad | javascript:alert(1)").errors).toHaveLength(1);
    expect(parseSources("No url").errors).toHaveLength(1);
  });
});
