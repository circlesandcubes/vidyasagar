import Link from "next/link";
import { AFFILIATE_DISCLOSURE, PARENT_BRAND, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner mx-auto">
        <div className="footer-brand">
          <Link className="footer-wordmark" href="/">
            {SITE_NAME}
          </Link>
          <p>{SITE_TAGLINE}</p>
        </div>

        <nav className="footer-column" aria-label="Explore">
          <h2>Explore</h2>
          <Link href="/books">All books</Link>
          <Link href="/skills">By skill</Link>
          <Link href="/ages">By age</Link>
          <Link href="/collections">Collections</Link>
          <Link href="/authors">Authors</Link>
          <Link href="/publishers">Publishers</Link>
        </nav>

        <nav className="footer-column" aria-label="Trust">
          <h2>Trust</h2>
          <Link href="/verified-knowledge">Verified Knowledge</Link>
          <Link href="/verified-knowledge/how-it-works">How review works</Link>
          <Link href="/content-standards">Content standards</Link>
          <Link href="/report-error">Report an error</Link>
          <Link href="/join">List your book</Link>
        </nav>

        <nav className="footer-column" aria-label="Policies">
          <h2>Policies</h2>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms of sale</Link>
          <Link href="/shipping">Delivery</Link>
          <Link href="/returns">Returns</Link>
        </nav>

        <div className="footer-column">
          <h2>Circles &amp; Cubes</h2>
          <p>
            Vidyasagar is part of{" "}
            <a href={PARENT_BRAND.url} rel="noopener">
              {PARENT_BRAND.name}
            </a>
            .
          </p>
        </div>
      </div>
      <p className="footer-disclosure mx-auto">{AFFILIATE_DISCLOSURE}</p>
    </footer>
  );
}
