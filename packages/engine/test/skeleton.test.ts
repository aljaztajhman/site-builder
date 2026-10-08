import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DIRECTIONS, Design, canCentre, centredOn, FOOTER_FAMILIES, HEADER_FAMILIES, PHONE_ACTIONS, direction as directionById, hexToHsl, migrateSpec, validateSite, type SiteSpec, type Skeleton } from "@sb/spec";
import { loadConfig } from "@sb/config";
import {
  ModelClient,
  applySkeleton,
  designWithVariety,
  generateContent,
  goalOf,
  heroEyebrow,
  holdPrimary,
  holdRhythm,
  isAddressEyebrow,
  pickCentred,
  pickSkeleton,
  preferPhotoHero,
  siteSeed,
  skeletonLine,
  type ModelRequest,
  type ModelTransport,
} from "../src/index.ts";

/** The variety engine, Step 4 (config variety.skeleton): the skeleton picked in code; no model call. */
const golden = (id: string) => migrateSpec(JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8"))) as SiteSpec;
const ids = Array.from({ length: 20 }, (_, i) => `site_${(0x1a2b3c + i * 7919).toString(16)}`);
const input = (spec: SiteSpec, seed: number, neighbours: Skeleton[] = []) => ({
  seed,
  dir: directionById(spec.design.direction),
  design: spec.design,
  hero: spec.pages[0]!.sections[0],
  business: spec.business,
  hasLogo: spec.assets.logo !== undefined,
  neighbours,
});

describe("pickSkeleton", () => {
  it("is the same for one seed, a valid skeleton, and differs across sites", () => {
    const spec = golden("avtoservis-mrak");
    expect(pickSkeleton(input(spec, 7))).toEqual(pickSkeleton(input(spec, 7)));
    const picks = ids.map((id) => pickSkeleton(input(spec, siteSeed(id))));
    for (const p of picks) expect(Design.parse({ ...spec.design, skeleton: p }).skeleton).toEqual(p);
    expect(new Set(picks.map((p) => p.header)).size).toBeGreaterThan(3);
    // A new header and footer family comes first; today's only when the neighbours have taken the rest.
    expect(new Set(picks.map((p) => p.footer))).toEqual(new Set(["wordmark", "visit"]));
    expect(picks.every((p) => ["centred", "phone", "overlay", "word", "compact"].includes(p.header))).toBe(true);
    for (const axis of ["footerTone", "width", "cards", "buttons", "dividers", "photoRatio"] as const) expect(new Set(picks.map((p) => p[axis])).size, axis).toBeGreaterThan(1);
  });

  it("puts the call where the business's goal needs it", () => {
    expect(goalOf("car-repair", false)).toBe("call");
    expect(goalOf("restaurant", false)).toBe("visit");
    expect(goalOf("hairdresser", true)).toBe("book");
    expect(goalOf("hairdresser", false)).toBe("call");
    const car = ids.map((id) => pickSkeleton(input(golden("avtoservis-mrak"), siteSeed(id))).actions);
    expect(new Set(car)).toEqual(new Set(["bar", "header"]));
    const bakery = ids.map((id) => pickSkeleton(input(golden("pekarna-kvas"), siteSeed(id))).actions);
    expect(new Set(bakery)).toEqual(new Set(["float", "bar"]));
  });

  it("overlay only over a photo hero without a logo; the phone family only with a phone; visit only with an address", () => {
    const farm = golden("kmetija-grabnar");
    const bakery = golden("pekarna-kvas");
    expect(ids.some((id) => pickSkeleton(input(farm, siteSeed(id))).header === "overlay")).toBe(true);
    expect(ids.some((id) => pickSkeleton(input(bakery, siteSeed(id))).header === "overlay")).toBe(false);
    const sparse = structuredClone(farm);
    sparse.business = { ...sparse.business, phone: { $placeholder: "phone" }, address: { $placeholder: "address" } };
    for (const id of ids) {
      const s = pickSkeleton(input(sparse, siteSeed(id)));
      expect(s.header).not.toBe("phone");
      expect(s.footer).not.toBe("visit");
      expect(s.actions).toBe("bar");
    }
  });

  it("20 sites of one trade: no two share header, phone actions and footer", () => {
    const spec = golden("avtoservis-mrak");
    const taken: Skeleton[] = [];
    for (const id of ids) taken.push(pickSkeleton(input(spec, siteSeed(id), taken)));
    const frames = taken.map((s) => `${s.header}|${s.actions}|${s.footer}`);
    expect(new Set(frames).size).toBe(20);
  });

  it("dividers: the motif only on a trade template", () => {
    const plain = ids.map((id) => pickSkeleton(input(golden("avtoservis-mrak"), siteSeed(id))).dividers);
    expect(plain).not.toContain("motif");
    const farm = ids.map((id) => pickSkeleton(input(golden("kmetija-grabnar"), siteSeed(id))).dividers);
    expect(farm).toContain("motif");
  });
});

describe("rules held in code", () => {
  it("holdPrimary moves the primary into the direction's hue and saturation ranges; templates keep theirs", () => {
    const dir = DIRECTIONS.find((d) => d.palette.primaryHue !== null && !d.template)!;
    const spec = golden("avtoservis-mrak");
    const off = { ...spec.design, direction: dir.id, colors: { ...spec.design.colors, primary: "#1d4ed8" } };
    const held = holdPrimary(off, dir);
    const { h, s } = hexToHsl(held.colors.primary);
    const [lo, hi] = dir.palette.primaryHue!;
    expect(h).toBeGreaterThanOrEqual(lo - 1);
    expect(h).toBeLessThanOrEqual(hi + 1);
    expect(s).toBeGreaterThanOrEqual(dir.palette.primarySaturation[0] - 0.01);
    expect(s).toBeLessThanOrEqual(dir.palette.primarySaturation[1] + 0.01);
    const template = DIRECTIONS.find((d) => d.template)!;
    expect(holdPrimary(off, template)).toBe(off);
  });

  it("the design step holds the primary only with the switch on", () => {
    const dir = DIRECTIONS.find((d) => d.palette.primaryHue !== null && !d.template)!;
    const choice = { direction: dir.id, fontPair: dir.fontPairs[0]!, primary: "#1d4ed8", accent: null, radius: 4, baseFontSize: 17, scale: 1.25, headingWeight: 700, headingCase: "normal" as const, headingTracking: 0, density: "regular" as const, shadow: "none" as const, reason: "" };
    const off = designWithVariety(choice).design;
    const on = designWithVariety(choice, undefined, true).design;
    expect(off.colors.primary).not.toBe(on.colors.primary);
    const [lo, hi] = dir.palette.primaryHue!;
    expect(hexToHsl(on.colors.primary).h).toBeGreaterThanOrEqual(lo - 2);
    expect(hexToHsl(on.colors.primary).h).toBeLessThanOrEqual(hi + 2);
  });

  it("holdRhythm: alternate never puts two light sections on one ground; flat keeps one ground; inverse accents never two dark in a row", () => {
    const s = (id: string, tone?: "default" | "alt" | "inverse" | "band") => ({ id, type: "text", variant: "default", ...(tone ? { tone } : {}), props: {} }) as unknown as SiteSpec["pages"][number]["sections"][number];
    const page = [s("hero"), s("a"), s("b"), s("c", "alt"), s("d", "alt"), s("e", "inverse"), s("f", "inverse"), s("g", "inverse")];
    const tones = (x: typeof page) => x.map((y) => y.tone ?? "default");
    // The hero is on the page ground too: the section after it takes the other one.
    expect(tones(holdRhythm(page, "alternate"))).toEqual(["default", "alt", "default", "alt", "default", "inverse", "inverse", "inverse"]);
    expect(tones(holdRhythm(page, "flat"))).toEqual(["default", "default", "default", "default", "default", "default", "default", "inverse"]);
    expect(tones(holdRhythm(page, "inverse-accents"))).toEqual(["default", "default", "default", "alt", "alt", "inverse", "alt", "inverse"]);
  });

  it("the hero's eyebrow is never the street address or the town alone", () => {
    const address = { street: "Savska cesta 52", postalCode: "4000", city: "Kranj" };
    expect(isAddressEyebrow("Savska cesta 52, Kranj", address)).toBe(true);
    expect(isAddressEyebrow("Šutna 30, Kamnik", { street: "Šutna 30", postalCode: "1241", city: "Kamnik" })).toBe(true);
    expect(isAddressEyebrow("Kranj", address)).toBe(true);
    expect(isAddressEyebrow("Avtoservis v Kranju", address)).toBe(false);
    expect(heroEyebrow("Avtoservis v Kranju", address, false)).toBe("Avtoservis v Kranju");
    expect(heroEyebrow("Avtoservis v Kranju", address, true)).toBeUndefined();
    expect(heroEyebrow("Savska cesta 52", address, false)).toBeUndefined();
  });

  it("a photo hero for a hero-suitable picture, in the family's seed order", () => {
    const tablica = directionById("tablica");
    expect(preferPhotoHero(tablica, "hero-type:with-facts", true, 1)).toMatch(/^hero-(signature:photo|split:image-right)$/);
    expect(preferPhotoHero(tablica, "hero-type:with-facts", false, 1)).toBe("hero-type:with-facts");
    expect(preferPhotoHero(tablica, "hero-split:image-right", true, 1)).toBe("hero-split:image-right");
    expect(preferPhotoHero(directionById("bold-local"), "hero-type:large", true, 1)).toBe("hero-type:large");
  });
});

describe("applySkeleton", () => {
  it("every golden stays valid with its skeleton, and the address eyebrow goes", () => {
    for (const id of ["avtoservis-mrak", "pekarna-kvas", "kmetija-grabnar", "instalacije-rebernik", "zobozdravstvo-lebar"]) {
      const spec = golden(id);
      const r = applySkeleton(spec, { seed: siteSeed(id), dir: directionById(spec.design.direction), neighbours: [] });
      const v = validateSite(r.spec);
      expect(v.ok ? [] : v.issues, id).toEqual([]);
      expect(r.spec.design.skeleton).toEqual(r.skeleton);
      expect(HEADER_FAMILIES).toContain(r.skeleton.header);
      expect(PHONE_ACTIONS).toContain(r.skeleton.actions);
      expect(FOOTER_FAMILIES).toContain(r.skeleton.footer);
    }
    // pekarna's hero eyebrow is its street address.
    const bakery = golden("pekarna-kvas");
    const r = applySkeleton(bakery, { seed: 3, dir: directionById(bakery.design.direction), neighbours: [] });
    expect((r.spec.pages[0]!.sections[0]!.props as { eyebrow?: string }).eyebrow).toBeUndefined();
    expect(r.changes.join(" ")).toContain("Šutna 30");
    // The input is left as it was.
    expect((bakery.pages[0]!.sections[0]!.props as { eyebrow?: string }).eyebrow).toBe("Šutna 30, Kamnik");
  });

  it("templates keep their outline's tones", () => {
    const farm = golden("kmetija-grabnar");
    const r = applySkeleton(farm, { seed: 5, dir: directionById(farm.design.direction), neighbours: [] });
    expect(r.spec.pages.map((p) => p.sections.map((s) => s.tone))).toEqual(farm.pages.map((p) => p.sections.map((s) => s.tone)));
  });
});

describe("pickCentred (alignment per section)", () => {
  it("at most one centred section per page, never the first, only one that may be centred; per seed none; deterministic", () => {
    let withCentre = 0;
    let without = 0;
    for (const id of ["avtoservis-mrak", "pekarna-kvas", "kmetija-grabnar", "instalacije-rebernik", "zobozdravstvo-lebar"]) {
      const spec = golden(id);
      const dir = directionById(spec.design.direction);
      for (const [n, site] of ids.entries()) {
        const seed = siteSeed(`${site}-${id}`);
        const centred = pickCentred(spec.pages, { seed, dir });
        expect(pickCentred(spec.pages, { seed, dir })).toEqual(centred);
        if (centred.length) withCentre++;
        else without++;
        for (const p of spec.pages) {
          const on = p.sections.filter((s) => centred.includes(s.id));
          expect(on.length, `${id} ${n} ${p.id}`).toBeLessThanOrEqual(1);
          if (on[0]) {
            expect(canCentre(on[0], dir.template?.motif)).toBe(true);
            expect(p.sections[0]!.id).not.toBe(on[0].id);
            expect(["home", "standard"]).toContain(p.kind);
          }
        }
        // applySkeleton writes them into the skeleton, the renderer centres exactly them, and the spec stays valid.
        const r = applySkeleton(spec, { seed, dir, neighbours: [] });
        expect(r.skeleton.centred ?? []).toEqual(centred);
        expect(r.spec.pages.flatMap((p) => [...centredOn(r.skeleton, p.sections)])).toEqual(centred);
        const v = validateSite(r.spec);
        expect(v.ok ? [] : v.issues, id).toEqual([]);
      }
    }
    // Both choices occur across sites: a centred section is allowed, not required.
    expect(withCentre).toBeGreaterThan(10);
    expect(without).toBeGreaterThan(10);
  });
});

describe("the content prompt", () => {
  it("hears the skeleton's rules only with the switch on", async () => {
    const spec = golden("avtoservis-mrak");
    const requests: ModelRequest[] = [];
    const transport: ModelTransport = {
      async send(req, stage) {
        requests.push(req);
        return { text: "{}", stopReason: "end_turn", model: stage.model, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
      },
    };
    const client = new ModelClient({ config: loadConfig(), transport, spentToday: async () => 0, onCall: async () => undefined });
    const brief = { name: spec.business.name, businessType: spec.business.type, tone: "friendly", summary: "", highlights: [], pages: [{ kind: "home", slug: "", navLabel: "Domov", purpose: "" }], facts: { phone: null, address: null, hours: null, bookingUrl: null, social: [], serviceArea: [] }, imageIdeas: [] } as never;
    const base = { slug: "x", brief, design: spec.design, assets: spec.assets, scope: "home" as const, heroImageIds: [], structuredOutput: false, retries: 0, corpus: "" };
    const text = (r: ModelRequest) => JSON.stringify(r.messages);
    await generateContent(client, base).catch(() => undefined);
    await generateContent(client, { ...base, skeleton: true }).catch(() => undefined);
    expect(requests).toHaveLength(2);
    expect(text(requests[0]!)).not.toContain("Hero eyebrow: optional");
    expect(text(requests[1]!)).toContain(JSON.stringify(skeletonLine()).slice(1, -1));
  });
});
