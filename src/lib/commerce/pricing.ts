import { percentOfMinor } from "@/lib/money";

// ---------------------------------------------------------------------------
// Pure pricing engine. Everything is integer paise. No I/O.
//
// Precedence (documented for customers and staff):
//   1. A sale price, when set, replaces the list price for that edition.
//   2. Personalisation adds its per-copy charge. Discounts apply to it too.
//   3. The best single AUTOMATIC rule (largest saving) is found.
//   4. A COUPON rule is found, if a valid code was entered.
//        - If the coupon rule is "stackable": automatic + coupon both apply
//          (the coupon is calculated on what is left after the automatic one).
//        - Otherwise the customer gets whichever of the two saves more, never both.
//   5. The total discount can never exceed the eligible amount.
//   6. Discount is spread across eligible lines proportionally, with the
//      remainder allocated so line discounts sum exactly to the total.
// ---------------------------------------------------------------------------

export type CartLineInput = {
  editionId: string;
  bookId: string;
  title: string;
  quantity: number;
  listPriceMinor: number;
  salePriceMinor: number | null;
  personalisationUnitMinor: number;
};

export type DiscountRule = {
  id: string;
  name: string;
  kind: "percent" | "fixed";
  /** percent: basis points; fixed: paise */
  value: number;
  minSubtotalMinor: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  stackable: boolean;
  requiresCoupon: boolean;
  /** Empty = every book. */
  bookIds: readonly string[];
};

export type PricedLine = CartLineInput & {
  unitPriceMinor: number;
  grossMinor: number;
  discountMinor: number;
  totalMinor: number;
};

export type AppliedDiscount = { ruleId: string; label: string; amountMinor: number; source: "automatic" | "coupon" };

export type PricedCart = {
  lines: PricedLine[];
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  totalMinor: number;
  applied: AppliedDiscount[];
  /** The coupon code to send with the order; null when the coupon did not apply. */
  couponUsed: string | null;
  notices: string[];
};

export type ShippingConfig = { flatMinor: number; freeOverMinor: number | null };

export function shippingFor(afterDiscountMinor: number, config: ShippingConfig): number {
  return config.freeOverMinor !== null && afterDiscountMinor >= config.freeOverMinor ? 0 : config.flatMinor;
}

export function unitPrice(line: Pick<CartLineInput, "listPriceMinor" | "salePriceMinor">): number {
  return line.salePriceMinor ?? line.listPriceMinor;
}

export function ruleIsLive(rule: DiscountRule, now: Date): boolean {
  if (!rule.isActive) return false;
  if (rule.startsAt && new Date(rule.startsAt) > now) return false;
  if (rule.endsAt && new Date(rule.endsAt) < now) return false;
  return true;
}

/** Amount a rule could save on the given lines (before any other discount). */
function ruleSaving(rule: DiscountRule, lines: readonly { bookId: string; availableMinor: number }[], subtotal: number): number {
  if (subtotal < rule.minSubtotalMinor) return 0;
  const eligible = lines
    .filter((l) => rule.bookIds.length === 0 || rule.bookIds.includes(l.bookId))
    .reduce((sum, l) => sum + l.availableMinor, 0);
  if (eligible <= 0) return 0;
  const raw = rule.kind === "percent" ? percentOfMinor(eligible, rule.value) : rule.value;
  return Math.min(raw, eligible);
}

/** Largest-remainder allocation: parts sum exactly to `total`. */
export function allocate(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w * total) / sum);
  const floors = exact.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (const { index } of order) {
    if (remainder <= 0) break;
    if (weights[index] > 0) {
      floors[index] += 1;
      remainder -= 1;
    }
  }
  return floors;
}

export function priceCart(input: {
  lines: readonly CartLineInput[];
  automaticRules: readonly DiscountRule[];
  coupon: { code: string; rule: DiscountRule; valid: boolean } | null;
  shipping: ShippingConfig;
  now?: Date;
}): PricedCart {
  const now = input.now ?? new Date();
  const notices: string[] = [];

  const base = input.lines.map((l) => {
    const unit = unitPrice(l) + l.personalisationUnitMinor;
    return { ...l, unitPriceMinor: unitPrice(l), grossMinor: unit * l.quantity, discountMinor: 0, totalMinor: unit * l.quantity };
  });
  const subtotal = base.reduce((s, l) => s + l.grossMinor, 0);

  // 3. best automatic rule
  const available = base.map((l) => ({ bookId: l.bookId, availableMinor: l.grossMinor }));
  let bestAuto: { rule: DiscountRule; saving: number } | null = null;
  for (const rule of input.automaticRules) {
    if (rule.requiresCoupon || !ruleIsLive(rule, now)) continue;
    const saving = ruleSaving(rule, available, subtotal);
    if (saving > (bestAuto?.saving ?? 0)) bestAuto = { rule, saving };
  }

  // 4. coupon
  let couponSaving = 0;
  let couponRule: DiscountRule | null = null;
  let couponUsed: string | null = null;
  if (input.coupon) {
    if (!input.coupon.valid || !ruleIsLive(input.coupon.rule, now)) {
      notices.push(`Coupon ${input.coupon.code} is not valid.`);
    } else if (subtotal < input.coupon.rule.minSubtotalMinor) {
      notices.push(`Coupon ${input.coupon.code} needs a larger order.`);
    } else {
      couponRule = input.coupon.rule;
    }
  }

  const applied: AppliedDiscount[] = [];
  const perLine = base.map(() => 0);
  const spread = (rule: DiscountRule, amount: number, remaining: number[]) => {
    const weights = base.map((l, i) => (rule.bookIds.length === 0 || rule.bookIds.includes(l.bookId) ? remaining[i] : 0));
    const parts = allocate(amount, weights);
    parts.forEach((p, i) => {
      perLine[i] += p;
      remaining[i] -= p;
    });
  };
  const remaining = base.map((l) => l.grossMinor);

  if (couponRule) {
    if (couponRule.stackable && bestAuto) {
      spread(bestAuto.rule, bestAuto.saving, remaining);
      applied.push({ ruleId: bestAuto.rule.id, label: bestAuto.rule.name, amountMinor: bestAuto.saving, source: "automatic" });
      const after = ruleSaving(couponRule, remaining.map((r, i) => ({ bookId: base[i].bookId, availableMinor: r })), subtotal);
      couponSaving = after;
      if (after > 0) {
        spread(couponRule, after, remaining);
        applied.push({ ruleId: couponRule.id, label: couponRule.name, amountMinor: after, source: "coupon" });
        couponUsed = input.coupon!.code;
      } else notices.push(`Coupon ${input.coupon!.code} did not apply to the items in your cart.`);
    } else {
      couponSaving = ruleSaving(couponRule, available, subtotal);
      if (couponSaving > 0 && couponSaving >= (bestAuto?.saving ?? 0)) {
        spread(couponRule, couponSaving, remaining);
        applied.push({ ruleId: couponRule.id, label: couponRule.name, amountMinor: couponSaving, source: "coupon" });
        couponUsed = input.coupon!.code;
      } else if (bestAuto) {
        spread(bestAuto.rule, bestAuto.saving, remaining);
        applied.push({ ruleId: bestAuto.rule.id, label: bestAuto.rule.name, amountMinor: bestAuto.saving, source: "automatic" });
        notices.push(`The offer “${bestAuto.rule.name}” saves more than coupon ${input.coupon!.code}, so the coupon was not used.`);
      } else {
        notices.push(`Coupon ${input.coupon!.code} did not apply to the items in your cart.`);
      }
    }
  } else if (bestAuto) {
    spread(bestAuto.rule, bestAuto.saving, remaining);
    applied.push({ ruleId: bestAuto.rule.id, label: bestAuto.rule.name, amountMinor: bestAuto.saving, source: "automatic" });
  }

  const lines: PricedLine[] = base.map((l, i) => ({ ...l, discountMinor: perLine[i], totalMinor: l.grossMinor - perLine[i] }));
  const discount = lines.reduce((s, l) => s + l.discountMinor, 0);
  const shippingMinor = lines.length === 0 ? 0 : shippingFor(subtotal - discount, input.shipping);
  return {
    lines,
    subtotalMinor: subtotal,
    discountMinor: discount,
    shippingMinor,
    totalMinor: subtotal - discount + shippingMinor,
    applied,
    couponUsed,
    notices,
  };
}
