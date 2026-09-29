import { isPlaceholder, walkStrings, type SiteSpec } from "@sb/spec";
import { numbersIn } from "./brief.ts";

export interface FactViolation {
  path: string;
  kind: "phone" | "email" | "address" | "hours" | "price" | "name" | "number" | "url";
  value: string;
}

const digitsOf = (s: string) => s.replace(/\D/g, "");

/** Keys whose strings are structural, not visible copy. */
const NON_COPY_KEYS = new Set(["id", "type", "variant", "tone", "page", "section", "action", "kind", "slug", "image", "network", "src", "file", "$placeholder"]);

/**
 * Checks that every phone number, email, address, opening hour, price, person's name and number
 * shown on the site comes from the client's input (brief text plus chat messages) or is a marked
 * placeholder. `corpus` is everything the client wrote.
 */
export function checkFacts(spec: SiteSpec, corpus: string): FactViolation[] {
  const out: FactViolation[] = [];
  const text = corpus.toLowerCase();
  const textDigits = digitsOf(corpus);
  const nums = numbersIn(corpus);
  const b = spec.business;

  if (!isPlaceholder(b.phone)) {
    const national = digitsOf(b.phone).replace(/^386/, "");
    if (!textDigits.includes(national) && !textDigits.includes(`0${national}`)) out.push({ path: "/business/phone", kind: "phone", value: b.phone });
  }
  if (!isPlaceholder(b.email) && !text.includes(b.email.toLowerCase())) out.push({ path: "/business/email", kind: "email", value: b.email });
  if (!isPlaceholder(b.address)) {
    if (!text.includes(b.address.postalCode) && !text.includes(b.address.city.toLowerCase())) {
      out.push({ path: "/business/address", kind: "address", value: `${b.address.postalCode} ${b.address.city}` });
    }
    const streetNum = /\d+\w?$/.exec(b.address.street)?.[0];
    const streetName = b.address.street.replace(/\s*\d+\w?$/, "").toLowerCase();
    if ((streetNum && !nums.has(streetNum.replace(/\D/g, ""))) || !text.includes(streetName.split(" ")[0] ?? streetName)) {
      out.push({ path: "/business/address/street", kind: "address", value: b.address.street });
    }
  }
  if (b.hours && !isPlaceholder(b.hours)) {
    b.hours.entries.forEach((e, i) => {
      for (const t of [e.open, e.close]) {
        if (t && !nums.has(String(Number(t.split(":")[0])))) out.push({ path: `/business/hours/entries/${i}`, kind: "hours", value: t });
      }
    });
  }
  for (const k of ["registrationNumber", "taxNumber"] as const) {
    const v = b.provider[k];
    if (!isPlaceholder(v) && !textDigits.includes(digitsOf(v))) out.push({ path: `/business/provider/${k}`, kind: "number", value: v });
  }
  if (b.bookingUrl && !text.includes(b.bookingUrl.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, ""))) {
    out.push({ path: "/business/bookingUrl", kind: "url", value: b.bookingUrl });
  }

  // Structured facts inside sections: prices and people's names.
  const visit = (v: unknown, p: string, key: string) => {
    if (Array.isArray(v)) return v.forEach((x, i) => visit(x, `${p}/${i}`, key));
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (key === "price" && typeof o.amount === "number" && !nums.has(String(o.amount))) out.push({ path: p, kind: "price", value: String(o.amount) });
    for (const [k, x] of Object.entries(o)) visit(x, `${p}/${k}`, k);
  };
  visit(spec.pages, "/pages", "");
  spec.pages.forEach((page, pi) =>
    page.sections.forEach((s, si) => {
      if (s.type !== "team" && s.type !== "about") return;
      const props = s.props as Record<string, unknown>;
      const names: { path: string; name: unknown }[] =
        s.type === "team"
          ? ((props.members as { name: unknown }[] | undefined) ?? []).map((m, mi) => ({ path: `/pages/${pi}/sections/${si}/props/members/${mi}/name`, name: m.name }))
          : [{ path: `/pages/${pi}/sections/${si}/props/ownerName`, name: props.ownerName }];
      for (const n of names) {
        if (typeof n.name === "string" && !n.name.toLowerCase().split(/\s+/).every((w) => text.includes(w))) out.push({ path: n.path, kind: "name", value: n.name });
      }
    }),
  );

  // Free copy: phone numbers, emails, prices, times and any other number must come from the client.
  walkStrings(spec.pages, (s, p, key) => {
    if (NON_COPY_KEYS.has(key)) return;
    if (/^https?:\/\//.test(s)) return;
    for (const m of s.matchAll(/[\w.+-]+@[\w-]+\.[\w.]+/g)) if (!text.includes(m[0].toLowerCase())) out.push({ path: `/pages${p}`, kind: "email", value: m[0] });
    for (const m of s.matchAll(/(\+?\d[\d\s/-]{6,}\d)/g)) {
      const d = digitsOf(m[0]);
      if (d.length >= 7 && !textDigits.includes(d.replace(/^386/, "")) && !textDigits.includes(d)) out.push({ path: `/pages${p}`, kind: "phone", value: m[0] });
    }
    for (const m of s.matchAll(/\d+(?:[.,]\d+)?/g)) {
      const n = String(Number(m[0].replace(",", ".")));
      if (!nums.has(n) && !nums.has(m[0])) out.push({ path: `/pages${p}`, kind: "number", value: m[0] });
    }
  });
  return dedupe(out);
}

function dedupe(v: FactViolation[]): FactViolation[] {
  const seen = new Set<string>();
  return v.filter((x) => {
    const k = `${x.path}|${x.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
