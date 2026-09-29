import type { Recording } from "@sb/engine";
import { loadConfig, type ModelStageName } from "@sb/config";
import type { SiteSpec } from "@sb/spec";
import type { Fixture } from "./fixtures/schema.ts";

/**
 * Hand-built ("synthetic") model responses for one fixture, derived from its golden spec. Used by
 * unit tests and offline demos to drive the real pipeline with the replay transport. They are
 * marked origin "synthetic"; `pnpm eval --record` replaces them with real recordings.
 */
export function syntheticRecordings(fixture: Fixture, golden: SiteSpec, edits: { reply: string; patches: unknown[] }[] = []): Recording[] {
  const config = loadConfig();
  const f = fixture.brief.facts;
  const d = golden.design;
  const contentPages = golden.pages.filter((p) => p.kind === "home" || p.kind === "standard");
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
          serviceArea: [],
          people: (f.people ?? []).map((p) => ({ name: p.name, role: p.role ?? null })),
        },
        pages: contentPages.map((p) => ({ kind: p.kind, slug: p.slug, navLabel: p.nav.label, purpose: p.seo.description })),
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
  out.push({ stage: "content", body: { chrome: golden.chrome, pages: contentPages } });
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
