import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="not-found">
      <div>
        <h1>Page not found</h1>
        <p>We couldn&apos;t find what you were looking for.</p>
        <p>
          <Link className="button" href="/books">
            Browse books
          </Link>
        </p>
      </div>
    </main>
  );
}
