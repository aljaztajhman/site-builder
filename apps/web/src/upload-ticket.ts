import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * A preview without an account is two requests, so nothing large is read before the checks:
 * 1. POST /api/intake/ticket with the text fields only (description, form token, Turnstile token): the
 *    bot check, the limits (which reserve the job) and the junk check run, and the answer is this ticket.
 * 2. The form itself, posted to /api/sites?ticket=…: the ticket is checked and taken (once, by the same
 *    device) before any of the body is read, and the body is capped (config tiers.anonymous.uploads).
 * The ticket is signed (HMAC with the session secret), so nothing in it can be changed by the visitor.
 */
export interface UploadTicket {
  /** The ai_jobs row the ticket step reserved. */
  j: string;
  /** The site id the upload creates. */
  s: string;
  /** The device it was issued to. */
  d: string;
  /** Hash of the description that passed the junk check; the upload must carry the same text. */
  h: string;
  /** Expires (ms since epoch). */
  e: number;
  /** The classifier's answer, when it was asked. */
  c?: { businessType: string; confidence: number };
}

const mac = (secret: string, body: string) => createHmac("sha256", secret).update(`ticket:${body}`).digest("base64url");

export const descriptionHash = (description: string): string => createHash("sha256").update(description.trim()).digest("hex").slice(0, 32);

export function signTicket(secret: string, t: UploadTicket): string {
  const body = Buffer.from(JSON.stringify(t)).toString("base64url");
  return `${body}.${mac(secret, body)}`;
}

/** The ticket if it is ours, unaltered and not expired; null otherwise. */
export function readTicket(secret: string, value: unknown, now = Date.now()): UploadTicket | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  const expected = mac(secret, body);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as UploadTicket;
    if (typeof t.j !== "string" || typeof t.s !== "string" || typeof t.d !== "string" || typeof t.h !== "string" || typeof t.e !== "number") return null;
    return t.e > now ? t : null;
  } catch {
    return null;
  }
}
