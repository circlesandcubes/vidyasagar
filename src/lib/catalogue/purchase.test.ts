import { describe, expect, it } from "vitest";
import { makeChannel, makeEdition } from "@/lib/catalogue/fixtures";
import { isAllowedRetailerUrl, purchaseOptionsForBook, purchaseOptionsForEdition } from "@/lib/catalogue/purchase";

describe("external purchase options", () => {
  it("offers Amazon and Flipkart links with sponsored rel attributes", () => {
    const edition = makeEdition({
      channels: [
        makeChannel({ id: "f", channel: "flipkart", destination_url: "https://www.flipkart.com/example/p/itm" }),
        makeChannel({ id: "a", channel: "amazon" }),
      ],
    });
    const options = purchaseOptionsForEdition(edition);
    expect(options.map((o) => o.label)).toEqual(["Buy on Amazon", "Buy on Flipkart"]);
    for (const option of options) {
      expect(option.rel).toContain("sponsored");
      expect(option.rel).toContain("noopener");
    }
  });

  it("hides disabled channels", () => {
    const edition = makeEdition({ channels: [makeChannel({ is_enabled: false })] });
    expect(purchaseOptionsForEdition(edition)).toEqual([]);
  });

  it("does not guess URLs: an enabled channel without a URL is not shown", () => {
    const edition = makeEdition({ channels: [makeChannel({ destination_url: null })] });
    expect(purchaseOptionsForEdition(edition)).toEqual([]);
  });

  it("rejects look-alike and non-https destinations", () => {
    expect(isAllowedRetailerUrl("amazon", "https://www.amazon.in/dp/X")).toBe(true);
    expect(isAllowedRetailerUrl("amazon", "https://amzn.to/abc")).toBe(true);
    expect(isAllowedRetailerUrl("amazon", "https://amazon.evil.example/dp/X")).toBe(false);
    expect(isAllowedRetailerUrl("amazon", "https://notamazon.in/dp/X")).toBe(false);
    expect(isAllowedRetailerUrl("amazon", "http://www.amazon.in/dp/X")).toBe(false);
    expect(isAllowedRetailerUrl("amazon", "javascript:alert(1)")).toBe(false);
    expect(isAllowedRetailerUrl("flipkart", "https://www.amazon.in/dp/X")).toBe(false);
    expect(isAllowedRetailerUrl("flipkart", "https://dl.flipkart.com/s/abc")).toBe(true);
  });

  it("never exposes direct or bulk channels before those phases exist", () => {
    const edition = makeEdition({
      channels: [
        makeChannel({ id: "d", channel: "direct", fulfilment: "vidyasagar", destination_url: null }),
        makeChannel({ id: "b", channel: "bulk_enquiry", fulfilment: "vidyasagar", destination_url: null }),
      ],
    });
    expect(purchaseOptionsForBook([edition])).toEqual([]);
  });
});
