import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contactStrip, formatDate, formatPhone, legal, notFound, structureDefs } from "@sb/spec";
import { ContactStrip } from "../src/groups/structure/ContactStrip.tsx";
import { Legal } from "../src/groups/structure/Legal.tsx";
import { NotFound } from "../src/groups/structure/NotFound.tsx";
import { structureRenderers } from "../src/groups/structure/index.ts";
import { uiStrings } from "../src/i18n.ts";
import { FULL_BUSINESS, SPARSE_BUSINESS, html, testCtx, testSpec } from "./helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const sparseCtx = () => testCtx(testSpec({ business: SPARSE_BUSINESS }));
const enCtx = () => ({ ...testCtx(), locale: "en" as const, t: uiStrings("en") });

describe("structure registry", () => {
  it("has a renderer for every structure section", () => {
    for (const d of structureDefs) expect(structureRenderers).toHaveProperty(d.type);
  });
  it("marks legal and not-found as system-only", () => {
    expect(legal.systemOnly).toBe(true);
    expect(notFound.systemOnly).toBe(true);
    expect(contactStrip.systemOnly).toBeUndefined();
  });
});

describe("legal", () => {
  const privacy = legal.schema.parse({ id: "s_privacy", type: "legal", variant: "default", props: { kind: "privacy" } });
  const a11y = legal.schema.parse({ id: "s_a11y", type: "legal", variant: "default", props: { kind: "accessibility" } });

  it("describes the contact form's data only when the site has a form", () => {
    expect(html(<Legal section={privacy} ctx={testCtx()} index={0} />)).not.toContain("kontaktni obrazec");
    const spec = testSpec();
    const withForm = testSpec({
      pages: [{ ...spec.pages[0]!, sections: [...spec.pages[0]!.sections, { id: "s_form", type: "contact-form", variant: "stacked", props: { title: "Pišite nam", askPhone: false } }] }, ...spec.pages.slice(1)],
    });
    const out = html(<Legal section={privacy} ctx={testCtx(withForm)} index={0} />);
    expect(out).toContain("Ko nas pokličete, nam pišete ali izpolnite obrazec");
    expect(out).toContain("zgoščeno obliko vašega naslova IP");
    const en = html(<Legal section={privacy} ctx={{ ...testCtx(withForm), locale: "en", t: uiStrings("en") }} index={0} />);
    expect(en).toContain("use the contact form");
  });

  it("renders the privacy policy from the business facts with a review notice", () => {
    const out = html(<Legal section={privacy} ctx={testCtx()} index={0} />);
    expect(out).toMatch(/<h1 id="s_privacy-title"[^>]*>Varstvo osebnih podatkov<\/h1>/);
    expect(count(out, /<h1/g)).toBe(1);
    expect(out).toContain('role="note"');
    expect(out).toContain("To ni pravni nasvet.");
    expect(out).toContain("Frizerski salon Lipa, Ana Novak s.p.");
    expect(out).toContain("Trubarjeva cesta 12, 1000 Ljubljana");
    expect(out).toContain("1234567000");
    expect(out).toContain('href="mailto:info@salon-lipa.si"');
    expect(out).toContain('href="tel:+38641123456"');
    expect(out).toContain('href="https://www.ip-rs.si/"');
    expect(out).toContain("Informacijskem pooblaščencu");
    expect(out).toContain("localStorage");
    expect(out).toContain("To ni piškotek");
    expect(out).not.toContain('class="ph"');
  });

  it("renders the accessibility statement with WCAG 2.2 AA, ZDSMA, the inspectorate and today's date", () => {
    const out = html(<Legal section={a11y} ctx={testCtx()} index={0} />);
    expect(out).toMatch(/<h1 id="s_a11y-title"[^>]*>Izjava o dostopnosti<\/h1>/);
    expect(out).toContain("WCAG 2.2 na ravni AA");
    expect(out).toContain("ZDSMA");
    expect(out).toContain("Inšpektorat Republike Slovenije");
    expect(out).toContain("inspektorat-za-informacijsko-druzbo");
    expect(out).toContain(formatDate(new Date()));
    // No placeholder the spec has no field for: with every fact present the statement is complete.
    expect(out).toContain("Znane omejitve");
    expect(out).toContain("Vsebine tretjih oseb, na primer vdelani zemljevidi, morda niso v celoti dostopne.");
    expect(out).not.toContain('class="ph"');
    expect(html(<Legal section={a11y} ctx={enCtx()} index={0} />)).not.toContain('class="ph"');
  });

  it("renders missing facts as placeholders and drops broken links", () => {
    for (const s of [privacy, a11y]) {
      const out = html(<Legal section={s} ctx={sparseCtx()} index={0} />);
      expect(out).toContain('data-ph="legalName"');
      expect(out).toContain('data-ph="email"');
      expect(out).toContain('data-ph="phone"');
      expect(out).not.toContain("tel:");
      expect(out).not.toContain("mailto:");
    }
    const p = html(<Legal section={privacy} ctx={sparseCtx()} index={0} />);
    expect(p).toContain('data-ph="address"');
    expect(p).toContain('data-ph="registrationNumber"');
  });

  it("renders English text for the en locale", () => {
    const p = html(<Legal section={privacy} ctx={enCtx()} index={0} />);
    expect(p).toContain(">Privacy policy</h1>");
    expect(p).toContain("This is not legal advice.");
    expect(p).toContain("Information Commissioner");
    const a = html(<Legal section={a11y} ctx={enCtx()} index={0} />);
    expect(a).toContain(">Accessibility statement</h1>");
    expect(a).toContain("WCAG) 2.2 at level AA");
    expect(a).not.toContain("Varstvo");
  });

  it("accepts no model-written props", () => {
    expect(() => legal.schema.parse({ ...privacy, props: { kind: "privacy", title: "x" } })).toThrow();
    expect(() => legal.schema.parse({ ...privacy, props: { kind: "terms" } })).toThrow();
  });
});

describe("not-found", () => {
  const section = notFound.schema.parse({
    id: "s_404",
    type: "not-found",
    variant: "default",
    props: { title: "Te strani ni", body: "Morda je bila premaknjena. Začnite na domači strani." },
  });

  it("renders an h1, the text and a button to the homepage", () => {
    const out = html(<NotFound section={section} ctx={testCtx()} index={0} />);
    expect(out).toMatch(/<h1 id="s_404-title"[^>]*>Te strani ni<\/h1>/);
    expect(out).toContain("Morda je bila premaknjena.");
    expect(out).toMatch(/<a class="btn btn--primary" href="index.html">Na domačo stran<\/a>/);
  });

  it("enforces the length limits", () => {
    expect(() => notFound.schema.parse({ ...section, props: { ...section.props, title: "x".repeat(61) } })).toThrow();
    expect(() => notFound.schema.parse({ ...section, props: { ...section.props, body: "x".repeat(201) } })).toThrow();
  });
});

describe("contact-strip", () => {
  const section = contactStrip.schema.parse({ id: "s_quick", type: "contact-strip", variant: "bar", props: {} });

  for (const variant of contactStrip.variants) {
    it(`renders ${variant} with click-to-call, directions and weekly hours`, () => {
      const out = html(<ContactStrip section={{ ...section, variant }} ctx={testCtx()} index={1} />);
      expect(out).toContain(`s-contact-strip--${variant}`);
      expect(out).toContain('aria-labelledby="s_quick-title"');
      expect(out).toMatch(/<h2 id="s_quick-title" class="visually-hidden">Kontakt<\/h2>/);
      expect(count(out, /<h3/g)).toBe(3);
      expect(out).toContain(`href="tel:+38641123456" class="contact-strip__action contact-strip__phone">${formatPhone("+38641123456")}</a>`);
      expect(out).toContain("Trubarjeva cesta 12, 1000 Ljubljana");
      expect(out).toContain("https://www.google.com/maps/search/?api=1&amp;query=");
      expect(out).toContain(">Navodila za pot</a>");
      expect(out).toContain("<dt>Pon–pet</dt><dd>8.00–19.00</dd>");
      expect(out).toContain("<dd>zaprto</dd>");
      const labels = [...out.matchAll(/<h3 class="contact-strip__label fact-label">(<svg [^>]*>)[\s\S]*?<\/svg>([^<]+)<\/h3>/g)];
      expect(labels.map((m) => m[2])).toEqual(["Telefon", "Naslov", "Delovni čas"]);
      for (const m of labels) expect(m[1]).toContain('aria-hidden="true"');
      // Only the labels carry icons: not the directions link, not the phone number.
      expect(count(out, /<svg /g)).toBe(3);
    });
  }

  it("shows a visible title when given", () => {
    const out = html(<ContactStrip section={{ ...section, props: { title: "Obiščite nas" } }} ctx={testCtx()} index={1} />);
    expect(out).toMatch(/<h2 id="s_quick-title" class="section-title contact-strip__title">Obiščite nas<\/h2>/);
  });

  it("renders placeholders and no links when facts are missing", () => {
    const out = html(<ContactStrip section={section} ctx={sparseCtx()} index={1} />);
    expect(out).toContain('data-ph="phone"');
    expect(out).toContain('data-ph="address"');
    expect(out).toContain('data-ph="hours"');
    expect(out).not.toContain("tel:");
    expect(out).not.toContain("google.com/maps");
  });

  it("hides the hours cell when the business has no hours at all", () => {
    const { hours: _hours, ...noHours } = FULL_BUSINESS;
    const out = html(<ContactStrip section={section} ctx={testCtx(testSpec({ business: noHours }))} index={1} />);
    expect(out).not.toContain("Delovni čas");
    expect(count(out, /<h3/g)).toBe(2);
  });

  it("rejects facts written as props", () => {
    expect(() => contactStrip.schema.parse({ ...section, props: { phone: "+38641123456" } })).toThrow();
    expect(() => contactStrip.schema.parse({ ...section, props: { title: "x".repeat(61) } })).toThrow();
  });
});

describe("structure.css", () => {
  const css = readFileSync(path.join(here, "../styles/structure.css"), "utf8");
  it("contains no banned patterns", () => {
    expect(css).not.toMatch(/gradient\(|backdrop-filter|font-style:\s*italic|monospace|border-radius:\s*(9{3,}|50%)|text-align:\s*center/);
    for (const m of css.matchAll(/box-shadow:\s*([^;]+);/g)) expect(m[1]).toBe("var(--shadow)");
    for (const m of css.matchAll(/#[0-9a-f]{3,6}\b|rgb\(/gi)) expect.fail(`raw colour ${m[0]}`);
  });
});
