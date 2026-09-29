import { z } from "zod";
import {
  Chrome,
  SECTION_DEFS,
  SPEC_VERSION,
  PageRef,
  text,
  toModelJsonSchema,
  type Business,
  type Design,
  type HoursEntry,
  type Page,
  type SiteSpec,
} from "@sb/spec";
import type { Brief } from "./brief.ts";

/** Sections the model may use: everything except the system-only ones (legal text, 404). */
function modelSectionUnion() {
  const schemas = SECTION_DEFS.filter((d) => !d.systemOnly).map((d) => d.schema);
  return z.discriminatedUnion("type", schemas as unknown as [z.ZodObject, ...z.ZodObject[]]);
}

export function contentOutputSchema() {
  const ModelPage = z.strictObject({
    id: PageRef,
    kind: z.enum(["home", "standard"]),
    slug: z.string().regex(/^$|^[a-z0-9]+(-[a-z0-9]+)*$/).max(40),
    nav: z.strictObject({ label: text(24), show: z.boolean() }),
    seo: z.strictObject({ title: text(60), description: text(160) }),
    sections: z.array(modelSectionUnion()).min(1).max(14),
  });
  return z.strictObject({ chrome: Chrome, pages: z.array(ModelPage).min(1).max(8) });
}

export type ContentOutput = { chrome: SiteSpec["chrome"]; pages: Page[] };

export const contentJsonSchema = () => toModelJsonSchema(contentOutputSchema());

/** Business facts from the verified brief. Every missing fact becomes a required placeholder. */
export function businessFromBrief(brief: Brief): Business {
  const f = brief.facts;
  const hours = f.hours?.length
    ? {
        entries: f.hours.map((h): HoursEntry => (h.closed || !h.open || !h.close ? { from: h.from, to: h.to, closed: true } : { from: h.from, to: h.to, open: h.open, close: h.close })),
        ...(f.hoursNote ? { note: f.hoursNote } : {}),
      }
    : undefined;
  return {
    name: brief.name,
    type: brief.businessType,
    phone: f.phone && /^\+\d{8,15}$/.test(f.phone) ? f.phone : { $placeholder: "phone" },
    email: f.email ?? { $placeholder: "email" },
    address: f.address && /^\d{4}$/.test(f.address.postalCode) ? { ...f.address } : { $placeholder: "address" },
    // Businesses that work on site (builders) may have no hours; all others get a placeholder.
    hours: hours ?? (brief.businessType === "builder" ? undefined : { $placeholder: "hours" }),
    ...(f.bookingUrl ? { bookingUrl: f.bookingUrl } : {}),
    ...(f.social.length ? { social: f.social } : {}),
    ...(f.serviceArea.length ? { serviceArea: f.serviceArea } : {}),
    provider: {
      legalName: f.legalName ?? { $placeholder: "legalName" },
      registrationNumber: f.registrationNumber && /^\d{7}(\d{3})?$/.test(f.registrationNumber) ? f.registrationNumber : { $placeholder: "registrationNumber" },
      taxNumber: f.taxNumber && /^(SI)?\d{8}$/.test(f.taxNumber.replace(/\s/g, "")) ? f.taxNumber.replace(/\s/g, "") : { $placeholder: "taxNumber" },
      ...(f.vatPayer !== null ? { vatPayer: f.vatPayer } : {}),
    },
  };
}

function seoTitle(prefix: string, name: string): string {
  const t = `${prefix} | ${name}`;
  return t.length <= 60 ? t : prefix.slice(0, 60);
}

/** Privacy, accessibility and 404 pages. Generated in code, never by the model. */
export function systemPages(name: string): Page[] {
  return [
    {
      id: "p_zasebnost",
      kind: "privacy",
      slug: "zasebnost",
      nav: { label: "Zasebnost", show: false },
      seo: { title: seoTitle("Varstvo osebnih podatkov", name), description: `Kako ${name} obdeluje osebne podatke obiskovalcev spletne strani.`.slice(0, 160) },
      sections: [{ id: "s_legal_privacy", type: "legal", variant: "default", props: { kind: "privacy" } } as Page["sections"][number]],
    },
    {
      id: "p_dostopnost",
      kind: "accessibility",
      slug: "dostopnost",
      nav: { label: "Dostopnost", show: false },
      seo: { title: seoTitle("Izjava o dostopnosti", name), description: `Izjava o dostopnosti spletne strani ${name}.`.slice(0, 160) },
      sections: [{ id: "s_legal_accessibility", type: "legal", variant: "default", props: { kind: "accessibility" } } as Page["sections"][number]],
    },
    {
      id: "p_404",
      kind: "not-found",
      slug: "404",
      nav: { label: "Ni najdeno", show: false },
      seo: { title: seoTitle("Strani ni mogoče najti", name), description: "Iskane strani ni. Vrnite se na domačo stran." },
      sections: [
        {
          id: "s_not_found",
          type: "not-found",
          variant: "default",
          props: { title: "Te strani ni mogoče najti", body: "Morda je bila premaknjena ali pa je naslov napačen. Na domači strani najdete vse ostalo." },
        } as Page["sections"][number],
      ],
    },
  ];
}

export function assembleSpec(input: {
  slug: string;
  brief: Brief;
  design: Design;
  assets: SiteSpec["assets"];
  content: ContentOutput;
}): SiteSpec {
  const modelPages = input.content.pages.filter((p) => p.kind === "home" || p.kind === "standard");
  // Home first, keep the model's order for the rest.
  modelPages.sort((a, b) => (a.kind === "home" ? -1 : b.kind === "home" ? 1 : 0));
  return {
    specVersion: SPEC_VERSION,
    slug: input.slug,
    locales: { default: "sl", enabled: ["sl"] },
    business: businessFromBrief(input.brief),
    design: input.design,
    assets: input.assets,
    chrome: input.content.chrome,
    pages: [...modelPages, ...systemPages(input.brief.name)],
  };
}
