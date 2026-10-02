/**
 * Transactional email (sign-in links, contact-form messages to site owners). Resend when RESEND_API_KEY is set (sender EMAIL_FROM, a verified subdomain);
 * in development without a key the message, magic link included, is printed to the server console.
 * A deployed environment (NODE_ENV=production) without a key sends nothing and says so: printing
 * sign-in links into production logs would hand accounts to anyone who can read them.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Where the recipient's reply goes (Resend's `reply_to`): one plain address, validated by the caller. */
  replyTo?: string;
  /** Resend drops a second send with the same key within 24 h. */
  idempotencyKey?: string;
}

export interface Mailer {
  kind: "resend" | "console" | "memory" | "disabled";
  send(m: MailMessage): Promise<void>;
}

/** Sending is not configured (deployed without RESEND_API_KEY). */
export class MailUnavailableError extends Error {
  constructor() {
    super("Email is not configured: set RESEND_API_KEY and EMAIL_FROM");
    this.name = "MailUnavailableError";
  }
}

export const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Resend's send-email API (POST /emails, Bearer key). Never logs the key or the message body. */
export function resendMailer(opts: { apiKey: string; from: string; fetch?: typeof fetch; timeoutMs?: number }): Mailer {
  const doFetch = opts.fetch ?? fetch;
  return {
    kind: "resend",
    async send(m) {
      const res = await doFetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${opts.apiKey}`,
          "content-type": "application/json",
          ...(m.idempotencyKey ? { "idempotency-key": m.idempotencyKey } : {}),
        },
        body: JSON.stringify({ from: opts.from, to: [m.to], subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}), ...(m.replyTo ? { reply_to: m.replyTo } : {}) }),
        // A hung connection must not hold a visitor's form submit (or a sign-in) open.
        signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Resend refused the message: HTTP ${res.status} ${detail.slice(0, 200)}`);
      }
    },
  };
}

/** Development: prints the message (and so the magic link) to the server console. */
export function consoleMailer(log: (line: string) => void = console.log): Mailer {
  return {
    kind: "console",
    async send(m) {
      log(`[mail] no RESEND_API_KEY, not sent. To: ${m.to}${m.replyTo ? ` (Reply-To: ${m.replyTo})` : ""}\nSubject: ${m.subject}\n${m.text}`);
    },
  };
}

/** Tests: keeps every message. */
export function memoryMailer(): Mailer & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    kind: "memory",
    sent,
    async send(m) {
      sent.push(m);
    },
  };
}

const disabled = (): Mailer => ({
  kind: "disabled",
  async send() {
    throw new MailUnavailableError();
  },
});

/**
 * Never throws: a half-configured environment (a key without EMAIL_FROM) sends nothing rather than
 * stopping the server; the startup log names what is missing (apps/web/src/env-check.ts).
 */
export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer {
  const key = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (key && from) return resendMailer({ apiKey: key, from });
  if (key || env.NODE_ENV === "production") return disabled();
  return consoleMailer();
}
