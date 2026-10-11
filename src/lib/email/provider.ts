export type OutgoingEmail = { to: string; from: string; subject: string; text: string; html?: string };

/** Provider-neutral: any transport that can send one message. */
export interface EmailProvider {
  readonly name: string;
  send(message: OutgoingEmail): Promise<void>;
}

export type EmailConfig = { provider: "resend"; apiKey: string; from: string };

export function emailConfig(env: NodeJS.ProcessEnv = process.env): EmailConfig | null {
  const from = env.EMAIL_FROM;
  if (!from) return null;
  if ((env.EMAIL_PROVIDER ?? "resend") === "resend" && env.RESEND_API_KEY) {
    return { provider: "resend", apiKey: env.RESEND_API_KEY, from };
  }
  return null;
}

export function createResendProvider(apiKey: string, fetchImpl: typeof fetch = fetch): EmailProvider {
  return {
    name: "resend",
    async send(message) {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: message.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      });
      if (!response.ok) throw new Error(`Email provider rejected the message (HTTP ${response.status})`);
    },
  };
}

export function providerFromEnv(env: NodeJS.ProcessEnv = process.env): { provider: EmailProvider; from: string } | null {
  const config = emailConfig(env);
  return config ? { provider: createResendProvider(config.apiKey), from: config.from } : null;
}
