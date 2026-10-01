import { isPlaceholder, setAt, walkStrings, type SiteSpec } from "@sb/spec";
import { fold, numberTokens, numbersIn } from "./brief.ts";

export interface FactViolation {
  path: string;
  kind: "phone" | "email" | "address" | "hours" | "price" | "name" | "number" | "url";
  value: string;
}

const digitsOf = (s: string) => s.replace(/\D/g, "");

/** Legal-form tokens that may be added to a name without being "invented". */
const LEGAL_FORMS = new Set(["d.o.o.", "d.o.o", "s.p.", "s.p", "d.d.", "d.d", "k.d.", "doo", "sp"]);

/** Street-type words the client may abbreviate or leave out ("Ljubljanska c. 8"). */
const STREET_KINDS = new Set(["cesta", "ulica", "trg", "pot", "nabrezje", "naselje"]);

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
  const folded = fold(corpus);
  const tokens = numberTokens(corpus);
  const nums = numbersIn(corpus);
  const b = spec.business;

  // The business name is shown everywhere; every word of it (legal forms aside) must be the client's.
  const nameWords = fold(b.name)
    .split(/[\s,]+/)
    .map((w) => w.replace(/["'„“”«»]/g, ""))
    .filter((w) => w.length >= 3 && !LEGAL_FORMS.has(w));
  if (nameWords.some((w) => !folded.includes(w))) out.push({ path: "/business/name", kind: "name", value: b.name });

  if (!isPlaceholder(b.phone)) {
    const national = digitsOf(b.phone).replace(/^386/, "");
    if (!tokens.has(national)) out.push({ path: "/business/phone", kind: "phone", value: b.phone });
  }
  if (!isPlaceholder(b.email) && !text.includes(b.email.toLowerCase())) out.push({ path: "/business/email", kind: "email", value: b.email });
  if (!isPlaceholder(b.address)) {
    if (!nums.has(b.address.postalCode) || !folded.includes(fold(b.address.city))) {
      out.push({ path: "/business/address", kind: "address", value: `${b.address.postalCode} ${b.address.city}` });
    }
    const streetNum = /\d+\w?$/.exec(b.address.street)?.[0];
    const streetName = b.address.street.replace(/\s*\d+\w?$/, "").toLowerCase();
    // Every word of the street name, not only the first ("Cesta svobode" when the client wrote "Celjska cesta").
    const streetWords = fold(streetName).split(/\s+/).filter((w) => w.length >= 3 && !STREET_KINDS.has(w));
    if ((streetNum && !nums.has(streetNum.replace(/\D/g, ""))) || streetWords.some((w) => !folded.includes(w))) {
      out.push({ path: "/business/address/street", kind: "address", value: b.address.street });
    }
  }
  if (b.hours && !isPlaceholder(b.hours)) {
    b.hours.entries.forEach((e, i) => {
      for (const t of [e.open, e.close]) {
        if (t && !nums.has(String(Number(t.split(":")[0])))) out.push({ path: `/business/hours/entries/${i}`, kind: "hours", value: t });
      }
    });
    for (const m of b.hours.note?.matchAll(/\d+(?:[.,]\d+)?/g) ?? []) {
      if (!nums.has(String(Number(m[0].replace(",", ".")))) && !nums.has(m[0])) out.push({ path: "/business/hours/note", kind: "hours", value: m[0] });
    }
  }
  // The legal name fills a required ZEPT field: an invented one must not clear the publish gate.
  if (!isPlaceholder(b.provider.legalName)) {
    const legalWords = fold(b.provider.legalName).split(/[\s,]+/).filter((w) => w.length >= 3 && !LEGAL_FORMS.has(w));
    if (legalWords.some((w) => !folded.includes(w))) out.push({ path: "/business/provider/legalName", kind: "name", value: b.provider.legalName });
  }
  for (const k of ["registrationNumber", "taxNumber"] as const) {
    const v = b.provider[k];
    if (!isPlaceholder(v) && !tokens.has(digitsOf(v))) out.push({ path: `/business/provider/${k}`, kind: "number", value: v });
  }
  if (b.bookingUrl && !text.includes(b.bookingUrl.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, ""))) {
    out.push({ path: "/business/bookingUrl", kind: "url", value: b.bookingUrl });
  }
  (b.social ?? []).forEach((so, i) => {
    if (!text.includes(so.url.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))) out.push({ path: `/business/social/${i}`, kind: "url", value: so.url });
  });

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
      const d = digitsOf(m[0]).replace(/^(00)?386/, "").replace(/^0/, "");
      if (d.length >= 7 && !tokens.has(d)) out.push({ path: `/pages${p}`, kind: "phone", value: m[0] });
    }
    for (const m of s.matchAll(/\d+(?:[.,]\d+)?/g)) {
      const n = String(Number(m[0].replace(",", ".")));
      if (!nums.has(n) && !nums.has(m[0])) out.push({ path: `/pages${p}`, kind: "number", value: m[0] });
    }
  });
  // Translations overlay any string of the spec when rendered; check each locale as it is shown.
  for (const [locale, map] of Object.entries(spec.translations ?? {})) {
    const shown = structuredClone({ ...spec, translations: undefined });
    for (const [ptr, value] of Object.entries(map ?? {})) {
      try {
        setAt(shown, ptr, value);
      } catch {
        // A pointer that doesn't resolve is a validation issue, reported there.
      }
    }
    const base = new Set(out.map((f) => `${f.path}|${f.value}`));
    for (const f of checkFacts(shown, corpus)) if (!base.has(`${f.path}|${f.value}`)) out.push({ ...f, path: `/translations/${locale}${f.path}` });
  }
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
