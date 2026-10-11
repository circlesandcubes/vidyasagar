import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

const ED = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const call = async (editionId: string, channel: string, query = "") => {
  const { GET } = await import("./route");
  return GET(new Request(`http://localhost/go/${editionId}/${channel}${query}`), { params: Promise.resolve({ editionId, channel }) });
};

describe("/go redirect", () => {
  beforeEach(() => {
    rpc.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  });
  it("redirects to the approved destination and passes the source label", async () => {
    rpc.mockResolvedValue({ data: "https://www.amazon.in/dp/X", error: null });
    const res = await call(ED, "amazon", "?s=book_page");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://www.amazon.in/dp/X");
    expect(rpc).toHaveBeenCalledWith("record_purchase_click", { p_edition_id: ED, p_channel: "amazon", p_source: "book_page" });
  });
  it("never redirects off-site when the database returns something unexpected", async () => {
    rpc.mockResolvedValue({ data: "https://evil.example/phish", error: null });
    const res = await call(ED, "amazon");
    expect(res.headers.get("location")).toBe("http://localhost/books");
  });
  it("falls back to the catalogue for unknown links, bad ids and unknown channels without a lookup", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect((await call(ED, "amazon")).headers.get("location")).toBe("http://localhost/books");
    expect((await call("not-a-uuid", "amazon")).headers.get("location")).toBe("http://localhost/books");
    expect((await call(ED, "evil")).headers.get("location")).toBe("http://localhost/books");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
