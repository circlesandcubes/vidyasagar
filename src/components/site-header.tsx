import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

const NAV_LINKS = [
  { href: "/books", label: "Books" },
  { href: "/skills", label: "Skills" },
  { href: "/ages", label: "Ages" },
  { href: "/authors", label: "Authors" },
  { href: "/verified-knowledge", label: "Verified Knowledge" },
  { href: "/search", label: "Search" },
] as const;

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner mx-auto">
        <Link className="wordmark" href="/" aria-label={`${SITE_NAME} home`}>
          vidyasagar<span aria-hidden="true">.</span>
        </Link>

        <nav className="main-nav desktop-nav" aria-label="Main navigation">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

        {/* No client JavaScript: <details> gives a keyboard-accessible mobile menu. */}
        <details className="mobile-nav">
          <summary>
            <span>Menu</span>
          </summary>
          <nav aria-label="Mobile navigation">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
