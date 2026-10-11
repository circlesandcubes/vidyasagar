export const APP_ROLES = ["customer", "author", "publisher", "curator", "reviewer", "admin"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(value: string): value is AppRole {
  return (APP_ROLES as readonly string[]).includes(value);
}

export function hasAnyRole(roles: readonly AppRole[], wanted: readonly AppRole[]): boolean {
  return wanted.some((role) => roles.includes(role));
}

/** Mirrors public.is_staff() in the database: admins and curators run the catalogue. */
export const STAFF_ROLES: readonly AppRole[] = ["admin", "curator"];
export const SELLER_ROLES: readonly AppRole[] = ["author", "publisher"];
export const isStaff = (roles: readonly AppRole[]) => hasAnyRole(roles, STAFF_ROLES);
export const isSeller = (roles: readonly AppRole[]) => hasAnyRole(roles, SELLER_ROLES);
