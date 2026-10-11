// Notices are passed between redirects as short codes, never free text, so a
// crafted URL cannot display attacker-chosen wording on our pages.
export const MESSAGES: Record<string, { tone: "info" | "error"; text: string }> = {
  not_configured: { tone: "error", text: "Accounts are not configured on this deployment yet." },
  invalid_credentials: { tone: "error", text: "Email or password is incorrect." },
  invalid_input: { tone: "error", text: "Please check the highlighted details and try again." },
  check_email: { tone: "info", text: "If that address can be used, we have sent an email with the next step." },
  password_updated: { tone: "info", text: "Your password has been updated." },
  forbidden: { tone: "error", text: "You do not have access to that page." },
  signed_out: { tone: "info", text: "You have been signed out." },
  link_expired: { tone: "error", text: "That link is invalid or has expired. Please request a new one." },
  saved: { tone: "info", text: "Saved." },
  submitted: { tone: "info", text: "Submitted for editorial review." },
  applied: { tone: "info", text: "Application received. We will review it and email you." },
  already_applied: { tone: "info", text: "You already have an application waiting for review." },
  failed: { tone: "error", text: "That did not work. Nothing was changed. Please try again." },
  rate_limited: { tone: "error", text: "Too many attempts. Please wait a few minutes and try again." },
  rights_required: { tone: "error", text: "Confirm that you hold the rights to list this book before submitting." },
  description_required: { tone: "error", text: "Add a description before submitting." },
  author_credit_required: { tone: "error", text: "An author credit is needed before approval. Add one under Credits." },
  edition_required: { tone: "error", text: "Add at least one edition before approval." },
  note_required: { tone: "error", text: "A note is required for this decision." },
  locked: { tone: "error", text: "This listing is with the editors and cannot be edited right now." },
  not_allowed: { tone: "error", text: "That status change is not allowed from the listing's current state." },
  duplicate: { tone: "error", text: "That value is already in use." },
  permission_denied: { tone: "error", text: "You do not have permission to do that." },
  decided: { tone: "info", text: "Decision recorded." },
  reported: { tone: "info", text: "Thank you. Your report has been received." },
};

export function messageFor(code: string | string[] | undefined) {
  const key = Array.isArray(code) ? code[0] : code;
  return key && Object.hasOwn(MESSAGES, key) ? MESSAGES[key] : null;
}
Object.assign(MESSAGES, {
  paid: { tone: "info", text: "Thank you. Your payment was received." },
  payment_pending: { tone: "info", text: "We are confirming your payment. This page will update once the bank confirms it; you do not need to pay again." },
  order_cancelled: { tone: "info", text: "Order cancelled." },
  order_unavailable: { tone: "error", text: "That order cannot be changed." },
});
Object.assign(MESSAGES, {
  commerce_not_ready: { tone: "error", text: "Online sales cannot be turned on until every required check on this page passes." },
  refund_failed: { tone: "error", text: "The refund could not be completed. Nothing was changed, or it was recorded as requested for follow-up." },
  gateway_unavailable: { tone: "error", text: "The payment gateway is not configured, so it cannot refund. Confirm a manual refund instead." },
});
