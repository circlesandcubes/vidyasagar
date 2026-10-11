import { TextField } from "@/components/auth-form";
import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { createPageMetadata } from "@/lib/book-metadata";
import { resetPasswordAction } from "@/app/auth/actions";

export const metadata = { ...createPageMetadata({ title: "Choose a new password", description: "Choose a new Vidyasagar password.", path: "/reset-password" }), robots: { index: false, follow: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return (
    <main id="main-content">
      <div className="content-wrap narrow">
        <PageIntro eyebrow="Account" title="Choose a new password" />
        <Flash searchParams={params} />
        <form action={resetPasswordAction} className="form-stack">
          <TextField name="password" label="New password" type="password" autoComplete="new-password" minLength={10} maxLength={128} />
          <button className="button" type="submit">Update password</button>
        </form>
      </div>
    </main>
  );
}
