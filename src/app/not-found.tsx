import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="not-found">
      <div>
        <p className="eyebrow">Not in this orbit</p>
        <h1>We couldn’t find that book.</h1>
        <Link className="text-link" href="/books">Back to the catalogue <span aria-hidden="true">↗</span></Link>
      </div>
    </main>
  );
}
