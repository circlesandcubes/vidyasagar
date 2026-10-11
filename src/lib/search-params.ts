import type { SearchParams } from "@/lib/catalogue/filters";

/** True when the URL carries any filter, search or page parameter. */
export function hasQueryParams(params: SearchParams): boolean {
  return Object.values(params).some((value) => (Array.isArray(value) ? value.length > 0 : Boolean(value)));
}
