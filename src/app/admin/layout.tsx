import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/roles";

// Session-dependent: must never be prerendered or cached.
export const dynamic = "force-dynamic";

export const metadata = { title: { default: "Admin", template: "%s | Admin" }, robots: { index: false, follow: false } };

const ADMIN_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/applications", label: "Seller applications" },
  { href: "/admin/books", label: "Books and reviews" },
  { href: "/admin/reports", label: "Error reports" },
  { href: "/admin/personalisation", label: "Personalisation" },
  { href: "/admin/reviews", label: "Customer reviews" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { roles } = await requireRole(["admin", "curator"], "/admin");
  return (
    <main id="main-content">
      <div className="content-wrap">
        <div className="admin-layout">
          <nav className="admin-nav" aria-label="Admin">
            <ul>
              {ADMIN_NAV.map((item) => <li key={item.href}><Link href={item.href}>{item.label}</Link></li>)}
            </ul>
            <p className="small muted">{isStaff(roles) && roles.includes("admin") ? "Administrator" : "Curator"}</p>
          </nav>
          <div>{children}</div>
        </div>
      </div>
    </main>
  );
}
