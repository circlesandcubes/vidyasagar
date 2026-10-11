// TypeScript mirror of public.book_transition_allowed(). The database is the
// authority; this exists so the UI only offers moves the database will accept.
// src/db/lifecycle-parity.test.ts proves the two agree for every pair.
export const BOOK_STATUSES = [
  "draft", "submitted", "editorial_review", "changes_requested", "approved",
  "published", "rejected", "withdrawn", "archived",
] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

const OWNER: [BookStatus, BookStatus][] = [
  ["draft", "submitted"], ["changes_requested", "submitted"],
  ["draft", "withdrawn"], ["submitted", "withdrawn"], ["changes_requested", "withdrawn"], ["approved", "withdrawn"],
  ["withdrawn", "draft"],
];
const STAFF_ONLY: [BookStatus, BookStatus][] = [
  ["submitted", "editorial_review"],
  ["editorial_review", "changes_requested"], ["editorial_review", "approved"], ["editorial_review", "rejected"],
  ["approved", "published"], ["approved", "changes_requested"],
  ["published", "archived"], ["published", "withdrawn"],
  ["archived", "published"], ["rejected", "draft"],
];

export function transitionAllowed(from: BookStatus, to: BookStatus, staff: boolean): boolean {
  if (from === to) return true;
  const pairs = staff ? [...OWNER, ...STAFF_ONLY] : OWNER;
  return pairs.some(([a, b]) => a === from && b === to);
}

export function nextStatusesForStaff(from: BookStatus): BookStatus[] {
  return BOOK_STATUSES.filter((to) => to !== from && transitionAllowed(from, to, true));
}

export const NOTE_REQUIRED: readonly BookStatus[] = ["changes_requested", "rejected"];
