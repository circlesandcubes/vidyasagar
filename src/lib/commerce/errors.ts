/**
 * Database exceptions are for engineers. This maps the handful that customers
 * can legitimately hit to plain wording; everything else becomes a generic
 * message so internal detail never reaches the page.
 */
export function friendlyOrderError(message: string | undefined): string {
  const m = message ?? "";
  const rules: [RegExp, string][] = [
    [/Prices changed|Personalisation price changed/i, "Some prices changed while you were shopping. Please review your cart and try again."],
    [/Not enough stock/i, "Sorry, there is not enough stock for one of the items. Please reduce the quantity."],
    [/no longer available|no active price/i, "One of the items is no longer available."],
    [/coupon.*(not valid|fully redeemed)|already used/i, "That coupon cannot be used on this order."],
    [/Shipping/i, "We could not confirm the shipping charge. Please review your cart."],
    [/delivery address/i, "Please choose a complete delivery address in India."],
    [/Personalisation is not available/i, "Personalisation is no longer available for one of the items."],
    [/not enabled/i, "Online ordering is not open yet."],
  ];
  for (const [pattern, text] of rules) if (pattern.test(m)) return text;
  return "We could not place your order. Nothing was charged. Please try again.";
}
