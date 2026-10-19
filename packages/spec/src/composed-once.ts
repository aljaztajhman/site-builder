import type { Business } from "./business.ts";
import type { Element } from "./composition/schema.ts";
import { isPlaceholder } from "./common.ts";

/**
 * A composed fact element that shows the phone counts as the page showing it (the page facts and the composed contact
 * row read it). The Review 50 repairs of composed sections lived here too; they went with the design studio (2026-10-19).
 */

const digits = (s: string) => s.replace(/\D/g, "");

/**
 * Whether a composed fact element shows the business phone: a number of six digits or more that is linked to a call,
 * or whose last eight digits are the phone's (the client writes "070 555 418" for +38670555418).
 */
export function factShowsPhone(el: Element, business: Pick<Business, "phone">): boolean {
  if (el.kind !== "fact") return false;
  const d = digits(el.value);
  if (d.length < 6) return false;
  if (el.link && "action" in el.link && el.link.action === "call") return true;
  const phone = business.phone;
  return !!phone && !isPlaceholder(phone) && digits(phone).slice(-8) === d.slice(-8);
}
