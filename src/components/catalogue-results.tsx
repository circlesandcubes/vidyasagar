import Link from "next/link";
import { BookGrid } from "@/components/book-card";
import { getAgeGroups, getPublishedBooks, getSkillTree } from "@/lib/catalogue/data";
import {
  SORT_OPTIONS,
  applyFilters,
  buildFacets,
  filtersToQuery,
  paginate,
  parseFilters,
  sortBooks,
} from "@/lib/catalogue/filters";
import type { CatalogueFilters, FacetOption, SearchParams } from "@/lib/catalogue/filters";

function FacetSelect({
  name,
  label,
  options,
  value,
}: {
  name: string;
  label: string;
  options: FacetOption[];
  value: string | undefined;
}) {
  // A filter is only offered when at least one book can match it.
  if (options.length === 0) return null;
  const id = `filter-${name}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={name} defaultValue={value ?? ""}>
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {"– ".repeat(option.depth ?? 0)}
            {option.label} ({option.count})
          </option>
        ))}
      </select>
    </div>
  );
}

function Pagination({ basePath, filters, page, pageCount }: { basePath: string; filters: CatalogueFilters; page: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  const href = (target: number) => `${basePath}${filtersToQuery({ ...filters, page: target })}`;
  return (
    <nav className="pagination" aria-label="Pagination">
      {page > 1 ? <Link href={href(page - 1)} rel="prev">← Previous</Link> : <span aria-hidden="true" />}
      <span>
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? <Link href={href(page + 1)} rel="next">Next →</Link> : <span aria-hidden="true" />}
    </nav>
  );
}

export async function CatalogueResults({
  params,
  basePath,
  emptyMessage,
}: {
  params: SearchParams;
  basePath: string;
  emptyMessage: string;
}) {
  const [books, ageGroups, skillTree] = await Promise.all([getPublishedBooks(), getAgeGroups(), getSkillTree()]);
  const ctx = { ageGroups, skillTree };
  const filters = parseFilters(params);
  const facets = buildFacets(books, ctx);
  const matches = sortBooks(applyFilters(books, filters, ctx), filters);
  const { items, page, pageCount, total } = paginate(matches, filters.page);
  const filtered = Object.entries(filters).some(([key, value]) => key !== "sort" && key !== "page" && value);

  return (
    <>
      <form className="filters" method="get" action={basePath} role="search" aria-label="Search and filter books">
        <div className="field field-wide">
          <label htmlFor="filter-q">Search</label>
          <input id="filter-q" name="q" type="search" defaultValue={filters.q ?? ""} placeholder="Title, author or topic" />
        </div>
        <details className="filter-more" open={filtered && !filters.q ? true : undefined}>
          <summary>Filters</summary>
          <div className="filter-grid">
            <FacetSelect name="age" label="Age" options={facets.ages} value={filters.age} />
            <FacetSelect name="skill" label="Skill" options={facets.skills} value={filters.skill} />
            <FacetSelect name="author" label="Author" options={facets.authors} value={filters.author} />
            <FacetSelect name="publisher" label="Publisher" options={facets.publishers} value={filters.publisher} />
            <FacetSelect name="format" label="Format" options={facets.formats} value={filters.format} />
            <FacetSelect name="language" label="Language" options={facets.languages} value={filters.language} />
            <FacetSelect name="verification" label="Review" options={facets.verification} value={filters.verification} />
            <FacetSelect name="channel" label="Buy from" options={facets.channels} value={filters.channel} />
            <FacetSelect name="availability" label="Availability" options={facets.availability} value={filters.availability} />
          </div>
        </details>
        <div className="field">
          <label htmlFor="filter-sort">Sort by</label>
          <select id="filter-sort" name="sort" defaultValue={filters.sort}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-actions">
          <button className="button" type="submit">
            Apply
          </button>
          {filtered && (
            <Link className="link-button" href={basePath}>
              Clear all
            </Link>
          )}
        </div>
      </form>

      <p className="result-count" role="status">
        {total === 0 ? "No books found" : `${total} ${total === 1 ? "book" : "books"}`}
        {filtered ? " matching your filters" : ""}
      </p>
      <BookGrid books={items} empty={filtered ? "No books match these filters. Try removing one." : emptyMessage} />
      <Pagination basePath={basePath} filters={filters} page={page} pageCount={pageCount} />
    </>
  );
}
