import Link from "next/link";
import { TextField } from "@/components/auth-form";
import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { createPageMetadata } from "@/lib/book-metadata";
import { loginAction } from "@/app/auth/actions";

export const metadata = { ...createPageMetadata({ title: "Sign in", description: "Sign in to Vidyasagar.", path: "/login" }), robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "";
  return (
    <main id="main-content">
      <div className="content-wrap narrow">
        <PageIntro eyebrow="Account" title="Sign in" />
        <Flash searchParams={params} />
        <form action={loginAction} className="form-stack">
          <input type="hidden" name="next" value={next} />
          <TextField name="email" label="Email" type="email" autoComplete="email" />
          <TextField name="password" label="Password" type="password" autoComplete="current-password" />
          <button className="button" type="submit">Sign in</button>
        </form>
        <p className="small"><Link href="/forgot-password">Forgot your password?</Link></p>
        <p className="small">New here? <Link href="/register">Create an account</Link></p>
      </div>
    </main>
  );
}
