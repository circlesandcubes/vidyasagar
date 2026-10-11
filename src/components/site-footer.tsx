import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner mx-auto">
        <Link className="footer-wordmark" href="/">
          {SITE_NAME}
        </Link>
        <p>For the questions that follow you home.</p>
      </div>
    </footer>
  );
}
