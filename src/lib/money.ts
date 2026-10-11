// All money is an integer number of minor units (paise). Never floats.
export type Currency = "INR";

/** Parses "149", "149.5", "149.50" into paise. Returns null for anything else. */
export function parseRupeesToMinor(input: string): number | null {
  const match = /^\s*(\d{1,9})(?:\.(\d{1,2}))?\s*$/.exec(input);
  if (!match) return null;
  const rupees = Number(match[1]);
  const paise = Number((match[2] ?? "").padEnd(2, "0") || "0");
  const total = rupees * 100 + paise;
  return Number.isSafeInteger(total) ? total : null;
}

export function formatMinor(minor: number, currency: Currency = "INR"): string {
  if (!Number.isInteger(minor)) throw new Error("Money must be an integer number of minor units");
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
}

/** Basis points (1/100 of a percent) of an amount, rounded half up. */
export function percentOfMinor(amountMinor: number, basisPoints: number): number {
  return Math.floor((amountMinor * basisPoints + 5000) / 10000);
}
