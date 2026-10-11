/**
 * Only same-site relative paths are allowed as post-login destinations, so a
 * crafted ?next= cannot send a user to another origin.
 */
export function safeNextPath(value: string | null | undefined, fallback = "/account"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(value)) return fallback;
  return value.length > 300 ? fallback : value;
}
