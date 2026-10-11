import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner mx-auto">
        <Link className="wordmark" href="/" aria-label={`${SITE_NAME} home`}>
          vidyasagar<span aria-hidden="true">.</span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link href="/books">Books</Link>
        </nav>
      </div>
    </header>
  );
}
