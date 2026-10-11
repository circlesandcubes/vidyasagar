import type { Edition, PurchaseChannel, PurchaseChannelRecord } from "@/lib/catalogue/types";

/**
 * Purchase options for Phase 1: external retailers only.
 *
 * Direct checkout (priced, server-calculated) and bulk enquiries arrive with the
 * commerce and institutional-sales phases. Until then those channels are never
 * returned, even if a row exists, so the site cannot offer something that
 * does not work yet.
 */
export type ExternalChannel = Extract<PurchaseChannel, "amazon" | "flipkart">;

export interface PurchaseOption {
  channel: ExternalChannel;
  label: string;
  /** Internal redirect (/go/…) that records the click, then forwards to the approved destination. */
  href: string;
  destination: string;
  /** Always sponsored: Vidyasagar may earn a commission on these links. */
  rel: string;
  editionId: string;
}

// Mirrors the destination-URL check constraint in the database.
const RETAILER_URL: Record<ExternalChannel, RegExp> = {
  amazon: /^https:\/\/([a-z0-9-]+\.)*(amazon\.(in|com)|amzn\.(to|in)|a\.co)(\/|$)/i,
  flipkart: /^https:\/\/([a-z0-9-]+\.)*(flipkart\.com|fkrt\.(it|cc))(\/|$)/i,
};

const LABELS: Record<ExternalChannel, string> = {
  amazon: "Buy on Amazon",
  flipkart: "Buy on Flipkart",
};

const CHANNEL_ORDER: ExternalChannel[] = ["amazon", "flipkart"];

export function isAllowedRetailerUrl(channel: ExternalChannel, url: string | null): url is string {
  if (!url) return false;
  return RETAILER_URL[channel].test(url);
}

function toOption(editionId: string, record: PurchaseChannelRecord): PurchaseOption | null {
  if (!record.is_enabled) return null;
  if (record.channel !== "amazon" && record.channel !== "flipkart") return null;
  if (!isAllowedRetailerUrl(record.channel, record.destination_url)) return null;
  return {
    channel: record.channel,
    label: LABELS[record.channel],
    href: `/go/${editionId}/${record.channel}?s=book_page`,
    destination: record.destination_url,
    rel: "sponsored nofollow noopener noreferrer",
    editionId,
  };
}

export function purchaseOptionsForEdition(edition: Edition): PurchaseOption[] {
  return edition.channels
    .map((record) => toOption(edition.id, record))
    .filter((option): option is PurchaseOption => option !== null)
    .sort((a, b) => CHANNEL_ORDER.indexOf(a.channel) - CHANNEL_ORDER.indexOf(b.channel));
}

export function purchaseOptionsForBook(editions: Edition[]): PurchaseOption[] {
  return editions.flatMap(purchaseOptionsForEdition);
}

export function hasExternalPurchaseOption(editions: Edition[], channel?: ExternalChannel): boolean {
  return purchaseOptionsForBook(editions).some((option) => !channel || option.channel === channel);
}
