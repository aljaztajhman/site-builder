import { DISPOSABLE_EMAIL_DOMAINS } from "./disposable-domains.ts";

/**
 * Email addresses for accounts. One free tier per person: the key folds the variants one inbox
 * receives (case, "+tags", and for Gmail the dots and googlemail.com) into one value.
 */

// No characters that could add headers or fields anywhere we put the address (mailto, mail headers).
const EMAIL = /^[^\s@?&<>"',;:()[\]\\]+@[^\s@?&<>"',;:()[\]\\]+\.[^\s@?&<>"',;:()[\]\\]{2,}$/;
const GMAIL = new Set(["gmail.com", "googlemail.com"]);

export interface NormalisedEmail {
  /** Where mail goes: the address as typed, trimmed, lower case. */
  email: string;
  /** The account key: lower case, "+tag" removed, Gmail dots removed, googlemail.com → gmail.com. */
  key: string;
  domain: string;
}

/** Null for anything that isn't a plausible single address. */
export function normaliseEmail(input: unknown): NormalisedEmail | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return null;
  const at = email.lastIndexOf("@");
  let local = email.slice(0, at);
  let domain = email.slice(at + 1).replace(/\.$/, "");
  if (!local || !domain || domain.startsWith(".") || domain.includes("..")) return null;
  local = local.split("+")[0]!;
  if (GMAIL.has(domain)) {
    domain = "gmail.com";
    local = local.replace(/\./g, "");
  }
  if (!local) return null;
  return { email, key: `${local}@${domain}`, domain };
}

/** True for a known throwaway-inbox domain or any subdomain of one (list: disposable-domains.ts). */
export function isDisposableEmailDomain(domain: string): boolean {
  const parts = domain.toLowerCase().replace(/\.$/, "").split(".");
  for (let i = 0; i < parts.length - 1; i++) if (DISPOSABLE_EMAIL_DOMAINS.has(parts.slice(i).join("."))) return true;
  return false;
}
