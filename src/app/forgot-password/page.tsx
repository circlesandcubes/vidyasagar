import { TextField } from "@/components/auth-form";
import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { createPageMetadata } from "@/lib/book-metadata";
import { forgotPasswordAction } from "@/app/auth/actions";

export const metadata = { ...createPageMetadata({ title: "Reset password", description: "Reset your Vidyasagar password.", path: "/forgot-password" }), robots: { index: false, follow: false } };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return (
    <main id="main-content">
      <div className="content-wrap narrow">
        <PageIntro eyebrow="Account" title="Reset your password" />
        <Flash searchParams={params} />
        <form action={forgotPasswordAction} className="form-stack">
          <TextField name="email" label="Email" type="email" autoComplete="email" />
          <button className="button" type="submit">Send reset link</button>
        </form>
      </div>
    </main>
  );
}
