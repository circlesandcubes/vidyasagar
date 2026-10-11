import { buildCatalogueCsv } from "@/lib/catalogue/csv";
import { getPublishedBooks } from "@/lib/catalogue/data";

export const revalidate = 600;

export async function GET() {
  const books = await getPublishedBooks();
  return new Response(buildCatalogueCsv(books), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="vidyasagar-catalogue.csv"' },
  });
}
