import { PageIntro } from "@/components/page-intro";
import { formatAgeRange } from "@/lib/catalogue/ages";
import { getPublishedBooks } from "@/lib/catalogue/data";

export const metadata = { title: "Printable catalogue" };
export const revalidate = 600;

export default async function CataloguePrintPage() {
  const books = await getPublishedBooks();
  return (
    <main id="main-content">
      <div className="content-wrap catalogue-print">
        <PageIntro eyebrow="Institutions" title="Catalogue" lede="Use your browser's Print command to save this as a PDF. Prices are provided in quotations." />
        {books.length === 0 ? <p className="empty-state">No books are published yet.</p> : (
          <table className="data-table">
            <caption className="visually-hidden">Published books</caption>
            <thead><tr><th scope="col">Title</th><th scope="col">Authors</th><th scope="col">Publisher</th><th scope="col">ISBN-13</th><th scope="col">Ages</th></tr></thead>
            <tbody>
              {books.map((b) => {
                const primary = b.editions.find((e) => e.is_primary) ?? b.editions[0];
                return (
                  <tr key={b.id}>
                    <th scope="row">{b.title}</th>
                    <td>{b.contributors.filter((c) => c.role === "author").map((c) => c.author.name).join(", ")}</td>
                    <td>{primary?.publisher?.name ?? ""}</td><td>{primary?.isbn13 ?? ""}</td>
                    <td>{formatAgeRange(b.age_min_months, b.age_max_months) ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
