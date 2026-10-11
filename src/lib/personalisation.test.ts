import { describe, expect, it } from "vitest";
import { snapshotPersonalisation, validatePersonalisation, type PersonalisationField, type PersonalisationTemplate } from "@/lib/personalisation";

const field = (over: Partial<PersonalisationField> = {}): PersonalisationField => ({
  key: "child_name", label: "Name", help_text: null, field_type: "text", is_required: true,
  min_length: 0, max_length: 12, choices: null, display_order: 0, ...over,
});

describe("personalisation validation", () => {
  it("accepts names in any script and tidies whitespace", () => {
    expect(validatePersonalisation([field()], { child_name: "  Aarav   Kumar " })).toEqual({ ok: true, values: { child_name: "Aarav Kumar" } });
    expect(validatePersonalisation([field()], { child_name: "आरव" }).ok).toBe(true);
    expect(validatePersonalisation([field()], { child_name: "D’Souza-Rao" }).ok).toBe(true);
  });
  it("rejects markup, control characters, emoji and over-long values", () => {
    for (const bad of ["<b>Hi</b>", "Name\u0000", "A&B", "Sam 🚀", "x".repeat(13), "\"quote\""]) {
      expect(validatePersonalisation([field()], { child_name: bad }).ok, bad).toBe(false);
    }
  });
  it("enforces required and optional fields", () => {
    expect(validatePersonalisation([field()], { child_name: "   " }).ok).toBe(false);
    expect(validatePersonalisation([field({ is_required: false })], { child_name: "" })).toEqual({ ok: true, values: {} });
  });
  it("only accepts listed choices", () => {
    const f = field({ key: "colour", label: "Colour", field_type: "choice", choices: ["Red", "Blue"] });
    expect(validatePersonalisation([f], { colour: "Red" }).ok).toBe(true);
    expect(validatePersonalisation([f], { colour: "Green" }).ok).toBe(false);
  });
  it("ignores keys the template does not define", () => {
    const result = validatePersonalisation([field()], { child_name: "Mia", admin: "true", price: "0" });
    expect(result).toEqual({ ok: true, values: { child_name: "Mia" } });
  });
  it("allows basic punctuation only in multi-line fields", () => {
    const f = field({ key: "msg", label: "Message", field_type: "textarea", max_length: 80 });
    expect(validatePersonalisation([f], { msg: "Happy birthday, Mia!\nLove, Nani" }).ok).toBe(true);
    expect(validatePersonalisation([field()], { child_name: "Hi!" }).ok).toBe(false);
  });
});

describe("personalisation snapshot", () => {
  const template: PersonalisationTemplate = {
    id: "t1", slug: "name", name: "Name on cover", description: null, preview_note: null,
    price_adjustment_minor: 15000, lead_time_days: 5,
    fields: [field({ key: "b", label: "B", display_order: 2 }), field({ key: "a", label: "A", display_order: 1 })],
  };
  it("copies definitions and orders fields", () => {
    const snap = snapshotPersonalisation(template, { a: "One", b: "Two" });
    expect(snap.fields.map((f) => f.key)).toEqual(["a", "b"]);
    expect(snap.price_adjustment_minor).toBe(15000);
  });
  it("is independent of later template edits", () => {
    const snap = snapshotPersonalisation(template, { a: "One", b: "Two" });
    template.fields[0].label = "Changed";
    template.price_adjustment_minor = 99999;
    expect(snap.fields.find((f) => f.key === "b")?.label).toBe("B");
    expect(snap.price_adjustment_minor).toBe(15000);
  });
});
