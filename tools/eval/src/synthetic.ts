import type { Recording } from "@sb/engine";
import { loadConfig, type ModelStageName } from "@sb/config";
import { SECTION_DEFS, type SiteSpec } from "@sb/spec";
import type { Fixture } from "./fixtures/schema.ts";

/**
 * Hand-built ("synthetic") model responses for one fixture, derived from its golden spec. Used by
 * unit tests and offline demos to drive the real pipeline with the replay transport. They are
 * marked origin "synthetic"; `pnpm eval --record` replaces them with real recordings. `scope` "home": the
 * content answer is the golden homepage alone, as a free preview gets it (the brief still plans every page).
 */
export function syntheticRecordings(fixture: Fixture, golden: SiteSpec, edits: { reply: string; patches: unknown[] }[] = [], scope: "home" | "full" = "full"): Recording[] {
  const config = loadConfig();
  const f = fixture.brief.facts;
  const d = golden.design;
  const plannedPages = golden.pages.filter((p) => p.kind === "home" || p.kind === "standard");
  // The model never writes the owner's collections (a golden may show one, e.g. instalacije-rebernik's services): its
  // answer leaves their sections out, as the content schema does.
  const generated = plannedPages.map((p) => ({ ...p, sections: p.sections.filter((s) => !SECTION_DEFS.find((d) => d.type === s.type)?.ownerOnly) }));
  const contentPages = scope === "home" ? generated.filter((p) => p.kind === "home") : generated;
  const out: { stage: ModelStageName; body: unknown }[] = [
    { stage: "classify", body: { businessType: fixture.brief.businessType, confidence: 0.95 } },
    {
      stage: "brief",
      body: {
        businessType: fixture.brief.businessType,
        name: f.name,
        town: f.address?.city ?? null,
        summary: fixture.brief.description.slice(0, 380),
        audience: "lokalni obiskovalci",
        tone: "friendly",
        offerings: (f.prices ?? []).map((p) => ({ group: null, name: p.item.slice(0, 80), description: null, price: { amount: p.amount, from: p.from ?? false, unit: null } })),
        highlights: [],
        facts: {
          phone: f.phone ?? null,
          email: f.email ?? null,
          address: f.address ?? null,
          hours: f.hours?.map((h) => ({ from: h.from, to: h.to, open: h.open ?? null, close: h.close ?? null, closed: h.closed ?? false })) ?? null,
          hoursNote: null,
          bookingUrl: f.bookingUrl ?? null,
          social: [],
          legalName: f.legal?.legalName ?? null,
          registrationNumber: f.legal?.registrationNumber ?? null,
          taxNumber: f.legal?.taxNumber ?? null,
          vatPayer: null,
          // The golden's service area (the fixture's facts don't list one), so a site that names it has no placeholder there.
          serviceArea: Array.isArray(golden.business.serviceArea) ? golden.business.serviceArea : [],
          people: (f.people ?? []).map((p) => ({ name: p.name, role: p.role ?? null })),
        },
        pages: plannedPages.map((p) => ({ kind: p.kind, slug: p.slug, navLabel: p.nav.label, purpose: p.seo.description })),
        missing: fixture.brief.missing,
      },
    },
    {
      stage: "design",
      body: {
        direction: d.direction,
        fontPair: d.fontPair,
        primary: d.colors.primary,
        accent: d.colors.accent,
        radius: d.radius,
        baseFontSize: d.baseFontSize,
        scale: d.scale,
        headingWeight: d.headingWeight,
        headingCase: d.headingCase,
        headingTracking: d.headingTracking,
        density: d.density,
        shadow: d.shadow,
        reason: "synthetic",
      },
    },
  ];
  if (fixture.photos.length) {
    out.push({
      stage: "altText",
      body: { images: golden.assets.images.map((img, index) => ({ index, alt: img.alt, focalX: img.focal?.x ?? 0.5, focalY: img.focal?.y ?? 0.5, heroSuitable: index === 0 })) },
    });
  }
  out.push({ stage: "content", body: { chrome: golden.chrome, pages: scope === "home" ? withoutLinksOutside(contentPages) : contentPages } });
  out.push({ stage: "critique", body: { issues: [], patches: [] } });
  for (const e of edits) out.push({ stage: "edit", body: e });

  return out.map((r, seq) => ({
    seq,
    stage: r.stage,
    model: "synthetic",
    hash: "synthetic",
    origin: "synthetic" as const,
    response: {
      text: JSON.stringify(r.body),
      stopReason: "end_turn",
      model: config.models[r.stage].model,
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  }));
}

/**
 * A homepage-only answer can't link to the pages it leaves out (the golden's menu page, its services page): links
 * whose target is another page are dropped, as the content step would write them for a homepage preview.
 */
function withoutLinksOutside(pages: SiteSpec["pages"]): SiteSpec["pages"] {
  const ids = new Set(pages.map((p) => p.id));
  const outside = (v: unknown): boolean => {
    const page = (v as { target?: { page?: unknown } } | null)?.target?.page;
    return typeof page === "string" && !ids.has(page);
  };
  const clean = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.filter((x) => !outside(x)).map(clean);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([, x]) => !outside(x)).map(([k, x]) => [k, clean(x)]));
    return v;
  };
  return clean(structuredClone(pages)) as SiteSpec["pages"];
}
