// Shared PGlite helper: runs the real migrations in an in-process Postgres.
//
// Supabase specifics are stubbed only as far as the migrations need them:
//   * roles anon / authenticated / service_role (service_role bypasses RLS)
//   * an `auth.users` table and `auth.uid()` reading `request.jwt.claim.sub`
// PGlite does NOT emulate PostgREST, GoTrue or Storage, so this proves SQL
// constraints, triggers, grants and RLS only — not the HTTP layer.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
export const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const AUTH_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
`;

export async function newDb(upToIndex = migrationFiles.length): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(AUTH_STUB);
  for (const file of migrationFiles.slice(0, upToIndex)) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  // Supabase's service_role holds every privilege by default.
  await db.exec(`
    grant all on all tables in schema public to service_role;
    grant all on all sequences in schema public to service_role;
    grant execute on all functions in schema public to service_role;
  `);
  return db;
}

export async function createUser(db: PGlite, email: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [email],
  );
  return result.rows[0].id;
}

async function withRole<T>(db: PGlite, role: string, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

export const asAnon = <T>(db: PGlite, fn: () => Promise<T>) => withRole(db, "anon", null, fn);
export const asUser = <T>(db: PGlite, userId: string, fn: () => Promise<T>) =>
  withRole(db, "authenticated", userId, fn);
export const asService = <T>(db: PGlite, fn: () => Promise<T>) => withRole(db, "service_role", null, fn);

/** Resolves to the error message if the statement fails, otherwise null. */
export async function failure(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function grantRole(db: PGlite, userId: string, role: string) {
  await db.query("insert into public.user_roles (user_id, role) values ($1, $2) on conflict do nothing", [
    userId,
    role,
  ]);
}
