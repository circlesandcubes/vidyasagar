-- Listing lifecycle: Draft -> Submitted -> Editorial Review -> Changes Requested
-- -> Approved -> Published, plus Rejected, Withdrawn and Archived.
--
-- Enum values added here cannot be referenced in the same transaction, so this
-- lives in its own migration. Only 'published' rows are ever publicly readable
-- (see the existing "Published books are readable by everyone" policy).

alter type public.book_status add value if not exists 'submitted';
alter type public.book_status add value if not exists 'editorial_review';
alter type public.book_status add value if not exists 'changes_requested';
alter type public.book_status add value if not exists 'approved';
alter type public.book_status add value if not exists 'rejected';
alter type public.book_status add value if not exists 'withdrawn';
alter type public.book_status add value if not exists 'archived';
