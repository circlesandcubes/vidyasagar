import Link from "next/link";
import { TextField } from "@/components/auth-form";
import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { createPageMetadata } from "@/lib/book-metadata";
import { registerAction } from "@/app/auth/actions";

export const metadata = { ...createPageMetadata({ title: "Create an account", description: "Create a Vidyasagar account.", path: "/register" }), robots: { index: false, follow: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return (
    <main id="main-content">
      <div className="content-wrap narrow">
        <PageIntro eyebrow="Account" title="Create an account" lede="Save books, manage orders and, if you write or publish children’s books, apply to list them." />
        <Flash searchParams={params} />
        <form action={registerAction} className="form-stack">
          <TextField name="displayName" label="Name (optional)" autoComplete="name" required={false} maxLength={120} />
          <TextField name="email" label="Email" type="email" autoComplete="email" />
          <TextField name="password" label="Password" type="password" autoComplete="new-password" minLength={10} maxLength={128} hint="At least 10 characters. A few random words work well." />
          <button className="button" type="submit">Create account</button>
        </form>
        <p className="small">Already registered? <Link href="/login">Sign in</Link></p>
      </div>
    </main>
  );
}
