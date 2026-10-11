import { z } from "zod";

const email = z.string().trim().toLowerCase().email().max(254);
// Length is the control that matters (NIST 800-63B); no composition rules.
const password = z.string().min(10, "Use at least 10 characters.").max(128);

export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export const registerSchema = z.object({
  email,
  password,
  displayName: z.string().trim().max(120).optional().transform((v) => v || undefined),
});
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ password });

export function formDataToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) out[key] = value;
  }
  return out;
}
