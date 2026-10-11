import Link from "next/link";
import { Flash } from "@/components/flash";
import { PageIntro } from "@/components/page-intro";
import { isStaff } from "@/lib/auth/roles";
import { getCurrentRoles, requireUser } from "@/lib/auth/session";
import { signOutAction } from "@/app/auth/actions";

// Session-dependent: must never be prerendered or cached.
export const dynamic = "force-dynamic";

export const metadata = { title: "Your account", robots: { index: false, follow: false } };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const user = await requireUser("/account");
  const roles = await getCurrentRoles();
  return (
    <main id="main-content">
      <div className="content-wrap">
        <PageIntro eyebrow="Account" title="Your account" lede={user.email ?? undefined} />
        <Flash searchParams={params} />
        <nav aria-label="Account sections">
          <ul className="plain-list">
            {(roles.includes("author") || roles.includes("publisher")) && <li><Link href="/sell">Your books</Link></li>}
            {!roles.includes("author") && !roles.includes("publisher") && <li><Link href="/join">List your book as an author or publisher</Link></li>}
            {roles.includes("reviewer") && <li><Link href="/review">Books assigned to you for review</Link></li>}
            {isStaff(roles) && <li><Link href="/admin">Admin</Link></li>}
          </ul>
        </nav>
        <form action={signOutAction}><button className="button" type="submit">Sign out</button></form>
      </div>
    </main>
  );
}
