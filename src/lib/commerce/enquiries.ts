import "server-only";

import { requireService, sendEmail } from "@/lib/commerce/server";

export type EnquiryInput = {
  userId: string | null;
  organisation: string; organisationType: string; contactName: string; email: string;
  phone?: string; city?: string; state?: string; quantity?: number; neededBy?: string; message: string;
  items: { book_id?: string; title?: string; quantity: number }[];
};

export async function createBulkEnquiry(input: EnquiryInput): Promise<{ reference: string } | null> {
  const service = requireService();
  const { data, error } = await service.rpc("submit_bulk_enquiry", {
    p_user_id: input.userId, p_organisation: input.organisation, p_type: input.organisationType, p_contact: input.contactName,
    p_email: input.email, p_phone: input.phone ?? null, p_city: input.city ?? null, p_state: input.state ?? null,
    p_quantity: input.quantity ?? null, p_needed_by: input.neededBy ?? null, p_message: input.message, p_items: input.items,
  });
  const row = (data as { enquiry_id: string; reference: string }[] | null)?.[0];
  if (error || !row) return null;
  await sendEmail(`bulk-enquiry:${row.reference}`, input.email, { kind: "bulk_enquiry_received", reference: row.reference });
  return { reference: row.reference };
}
