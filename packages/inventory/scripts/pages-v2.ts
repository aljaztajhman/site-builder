/**
 * Contact-sheet pages for the composition language's inventory kinds (docs/plans/studio-phase1-design.md §5): drawings
 * (motifs and ornaments in the Drawing format), compositions (filled presets), motion presets (three frames),
 * practical-fact icons, wordmarks (20 real Slovene names), dividers (the edge between two sections), section
 * textures, type treatments (real headings at sizes 2/5/8) and fact objects (the three fixtures' facts at sizes 2/5/8).
 * Each page is a small site spec the real component library renders, so a sheet equals what a site renders.
 * `pagesFor` here is the sheet's entry point: these kinds first, then the older kinds in pages.ts.
 */
import { readFileSync } from "node:fs";
import { drawingData } from "@sb/components";
import {
  ComposedProps,
  EDGES,
  FACT_OBJECTS,
  MOTION_META,
  TYPE_TREATMENTS,
  TYPE_TREATMENT_LIMITS,
  WORDMARK_STYLES,
  wordmarkLayout,
  type WordmarkStyle,
  direction,
  fillPreset,
  parsePresetId,
  type PresetSources,
  type Section,
  type SiteSpec,
} from "@sb/spec";
import { assetName, compositionPreset, type Asset } from "../src/index.ts";
import { BASE_GOLDEN, SHEET_PALETTES, TONES, golden, imageIds, inDirection, pagesFor as pagesForV1, repairSpec, slugOf, withHome, type SheetPage } from "./pages.ts";

type Props = Record<string, unknown>;
type Tone = (typeof TONES)[number];

/** 20 Slovene business names, the longest about 40 characters, with č š ž in them (wordmark sheets). */
export const WORDMARK_NAMES = [
  "Pekarna Kvas",
  "Gostilna Zlata žlica",
  "Avtoservis Mrak",
  "Frizerstvo Lana",
  "Kmetija Grabnar",
  "Fizioterapija Pregib",
  "Instalacije Rebernik",
  "Čevljarstvo Žnidaršič",
  "Cvetličarna Marjetica",
  "Slaščičarna Čebelica",
  "Vulkanizerstvo Škofja Loka",
  "Šivalnica Zdenka Černe",
  "Kavarna Ob Savinji",
  "Optika Pogled Maribor",
  "Mesarija Štrukelj",
  "Urarstvo Žabkar",
  "Sirarna Pod Triglavom",
  "Mizarstvo Šuštar in sinovi",
  "Računovodski servis Nina Kovač s.p.",
  "Zobna ordinacija Ažman Šuštar Žigon",
] as const;

/** The fixtures a composition preset is filled from on its sheet (the three the preset tests fill from). */
export const PRESET_FIXTURES = ["pekarna-kvas", "avtoservis-mrak", "instalacije-rebernik"] as const;

type PresetFixture = Omit<PresetSources, "copy"> & { copy: Record<string, PresetSources["copy"]> };
let presetFixtures: Record<string, PresetFixture> | undefined;

/**
 * A fixture's preset sources for an intent: its golden's business, images and colours, its recorded brief and the copy
 * of its golden section of that intent (test/fixtures/preset-sources.json, shared with the preset tests).
 */
export function presetFixtureSources(fixture: string, intent: string): PresetSources | undefined {
  presetFixtures ??= JSON.parse(readFileSync(new URL("../test/fixtures/preset-sources.json", import.meta.url), "utf8")) as Record<string, PresetFixture>;
  const f = presetFixtures[fixture];
  if (!f) return undefined;
  const { copy, ...rest } = f;
  return { ...rest, ...(copy[intent] ? { copy: copy[intent] } : {}) };
}

/**
 * A composition asset's filled presets: `fillPreset` from each of the three fixtures (a fill that fails, say a hero that
 * needs a photo for a client without one, is left out). An asset that isn't a registered preset has none, and its row
 * shows a note. Tests and makers can replace `current`.
 */
export function presetsFromFixtures(asset: Asset): { fixture: string; props: ComposedProps }[] {
  const preset = compositionPreset(asset.id);
  const intent = preset && parsePresetId(preset.id)?.intent;
  if (!preset || !intent) return [];
  return PRESET_FIXTURES.flatMap((fixture) => {
    const src = presetFixtureSources(fixture, intent);
    const r = src && fillPreset(preset, src);
    return r && r.ok ? [{ fixture, props: r.props }] : [];
  });
}

/** Where the composition sheet gets its pages (default: the presets filled from the fixtures). */
export const PRESET_SOURCE: { current: (asset: Asset) => { fixture: string; props: ComposedProps }[] } = { current: presetsFromFixtures };

const TONE_LABEL: Record<Tone, string> = { default: "paper", alt: "alt", inverse: "inverse" };
const LETTER = (i: number): string => String.fromCharCode(97 + i);

/** An element placed on the 12-column grid. */
const el = (id: string, props: Props, col: number, span: number, row: number, order: number, phone: "full" | "half" | "inset" = "full"): Props => ({
  id: `e_${id}`,
  ...props,
  desk: { col, span, row },
  phone: { order, span: phone },
});

const heading = (text: string, row = 1, col = 1, span = 4): Props => el("h", { kind: "heading", text, level: 2, size: 3 }, col, span, row, 0);

function section(tone: Tone, props: Props & { elements: Props[] }, id = `s_g_${tone}`): Section {
  const rows = Math.max(1, ...props.elements.map((e) => ((e.desk as { row: number }).row ?? 1) + (((e.desk as { rowSpan?: number }).rowSpan ?? 1) - 1)));
  const parsed = ComposedProps.parse({ intent: "story", width: "contained", rows, ...props });
  return { id, type: "composed", variant: "free", ...(tone !== "default" ? { tone } : {}), props: parsed } as Section;
}

/** One composed section per ground (paper, ink, band), each with a heading naming the ground and the given elements. */
const grounds = (build: (tone: Tone, i: number) => Props[]): Section[] => TONES.map((tone, i) => section(tone, { elements: [heading(`Podlaga: ${TONE_LABEL[tone]}`), ...build(tone, i)] }));

type Page = (variant: string, label: string, spec: SiteSpec, o?: { motion?: string; fixture?: string; showChrome?: boolean }) => SheetPage;

function pageMaker(asset: Asset): { base: SiteSpec; page: Page } {
  const base = golden(BASE_GOLDEN).spec;
  const page: Page = (variant, label, spec, o = {}) => {
    const home = spec.pages.find((p) => p.kind === "home")!;
    return {
      asset: asset.id,
      variant,
      label,
      kind: "site",
      spec: repairSpec(withHome(spec, home.sections, slugOf(asset.id, variant))),
      fixture: o.fixture ?? BASE_GOLDEN,
      showChrome: o.showChrome ?? false,
      ...(o.motion ? { motion: o.motion } : {}),
    };
  };
  return { base, page };
}

const palettes = () => SHEET_PALETTES.map((id) => direction(id));

/**
 * A drawing (motif or ornament) as the section's drawing layer (the one place the renderer draws a drawing id today:
 * the decor element doesn't yet), on the three grounds (scale 1 in the first palette, 3 in the second).
 */
export function drawingPages(asset: Asset): SheetPage[] {
  const { base, page } = pageMaker(asset);
  // One drawing layer per section: the first palette shows scale 1, the second scale 3 (cropped, the largest use).
  const layers = (scale: number) => [{ kind: "drawing", drawing: asset.id, scale, anchor: "center" }];
  return palettes().map((dir, i) =>
    page(
      LETTER(i),
      dir.id,
      withHome(
        inDirection(base, dir),
        TONES.map((tone) => section(tone, { minHeight: "m", background: layers(i === 0 ? 1 : 3), elements: [heading(`Podlaga: ${TONE_LABEL[tone]}`, 1, 4, 5)] })),
        "x",
      ),
    ),
  );
}

/** A composition preset: each of its filled ComposedProps on the three grounds, in two palettes. */
export function compositionPages(asset: Asset, presets: { fixture: string; props: ComposedProps }[]): SheetPage[] {
  const out: SheetPage[] = [];
  for (const [j, preset] of presets.entries()) {
    const { page } = pageMaker(asset);
    const base = golden(preset.fixture).spec;
    palettes().forEach((dir, i) => {
      for (const tone of TONES) {
        const spec = withHome(inDirection(base, dir), [{ id: "s_g_default", type: "composed", variant: "free", ...(tone !== "default" ? { tone } : {}), props: structuredClone(preset.props) } as Section], "x");
        out.push(page(`${LETTER(i)}${j + 1}-${TONE_LABEL[tone]}`, `${preset.fixture} · ${dir.id} · ${TONE_LABEL[tone]}`, spec, { fixture: preset.fixture }));
      }
    });
  }
  return out;
}

/** An icon (`icon/<style>/<fact>`) on the three grounds at the size iconFacts shows it, in a row of the fact beside a few. */
export function iconPages(asset: Asset): SheetPage[] {
  const { base, page } = pageMaker(asset);
  const [style, fact] = assetName(asset.id).split("/") as [string, string];
  const icons = ["line", "solid", "cut"].includes(style) ? { icons: style } : {};
  return palettes().map((dir, i) => {
    const spec = inDirection(base, dir);
    (spec.business as { amenities?: string[] }).amenities = [fact ?? style];
    return page(LETTER(i), dir.id, withHome(spec, grounds(() => [el("i", { kind: "iconFacts", items: [{ fact: fact ?? style, note: "Za goste" }], ...icons }, 5, 6, 1, 1)]), "x"));
  });
}

/** A wordmark style: one page per name (20; a page holds one wordmark), the names alternating between the two palettes and the three grounds. */
export function wordmarkPages(asset: Asset): SheetPage[] {
  const { base, page } = pageMaker(asset);
  const style = assetName(asset.id);
  const dirs = palettes();
  // A style the renderer doesn't know draws as plain: say so on the sheet and in the log instead of showing a look the site wouldn't get.
  const known = (WORDMARK_STYLES as readonly string[]).includes(style);
  if (!known) console.warn(`wordmark sheet: style "${style}" (${asset.id}) is not in WORDMARK_STYLES (packages/spec/src/composition/vocab.ts); it renders as plain until it is added`);
  return WORDMARK_NAMES.map((name, n) => {
    const dir = dirs[n % dirs.length]!;
    const spec = inDirection(base, dir);
    spec.business.name = name;
    spec.design.wordmark = { style };
    // A name the style cannot carry (too long, one word …) is drawn as another style: say which, so the sheet shows what the site would get.
    const drawn = known ? wordmarkLayout(name, style as WordmarkStyle).style : "plain";
    const fallback = known && drawn !== style ? `falls back to ${drawn} · ` : "";
    return page(`n${String(n + 1).padStart(2, "0")}`, `${known ? "" : `NOT IN WORDMARK_STYLES, drawn as plain · `}${fallback}${name} · ${dir.id}`, withHome(spec, [grounds(() => [el("w", { kind: "wordmark", size: 5 }, 5, 8, 1, 1)])[n % TONES.length]!], "x"));
  });
}

/** The edge between two sections: every junction of paper, ink, band, paper, the later section carrying `top.edge`. */
export function dividerPages(asset: Asset): SheetPage[] {
  const { base, page } = pageMaker(asset);
  const name = assetName(asset.id);
  const top = ((): { edge: string; drawing?: string } | undefined => {
    if ((EDGES as readonly string[]).includes(name)) return name === "drawing" ? undefined : { edge: name };
    const drawing = [`ornament/${name}`, `motif/${name}`].find((id) => drawingData(id));
    return drawing ? { edge: "drawing", drawing } : undefined;
  })();
  if (!top) return [];
  const order: Tone[] = ["default", "alt", "inverse", "default"];
  return palettes().map((dir, i) => {
    const sections = order.map((tone, k) =>
      section(
        tone,
        {
          elements: [
            el("h", { kind: "heading", text: k === 0 ? TONE_LABEL[tone] : `${TONE_LABEL[order[k - 1]!]} → ${TONE_LABEL[tone]}`, level: 2, size: 3 }, 1, 6, 1, 0),
            el("t", { kind: "text", paragraphs: ["Delamo po dogovoru, počasi in natančno."] }, 1, 6, 2, 1),
          ],
          ...(k > 0 ? { top } : {}),
        },
        `s_g_${k}`,
      ),
    );
    return page(LETTER(i), dir.id, withHome(inDirection(base, dir), sections, "x"));
  });
}

/**
 * A section texture (`surface.texture`) behind a heading and a paragraph on the three grounds, in two palettes: the
 * texture as a site paints it, under the text it must stay quiet behind.
 */
export function texturePages(asset: Asset): SheetPage[] {
  const { base, page } = pageMaker(asset);
  const surface = { texture: assetName(asset.id) };
  return palettes().map((dir, i) =>
    page(
      LETTER(i),
      dir.id,
      withHome(
        inDirection(base, dir),
        TONES.map((tone) =>
          section(tone, {
            surface,
            minHeight: "s",
            elements: [
              el("h", { kind: "heading", text: `Kruh, ki vzhaja čez noč · ${TONE_LABEL[tone]}`, level: 2, size: 5 }, 1, 8, 1, 0),
              el("t", { kind: "text", paragraphs: ["Vsako jutro zamesimo, počakamo in spečemo. Testo počiva vso noč, zato je skorja hrustljava in sredica mehka."] }, 1, 7, 2, 1),
            ],
          }),
        ),
        "x",
      ),
    ),
  );
}

/** Sample elements for the kinds a motion preset animates. */
function motionElements(targets: readonly string[], images: string[], countable = false): Props[] {
  const out: Props[] = [];
  let row = 0;
  const has = (k: string) => targets.includes(k);
  const add = (id: string, props: Props, col: number, span: number, rowSpan?: number) => {
    const e = el(id, props, col, span, row, out.length);
    if (rowSpan) (e.desk as Record<string, number>).rowSpan = rowSpan;
    out.push(e);
  };
  const left: [string, Props][] = [];
  if (has("heading")) left.push(["h", { kind: "heading", text: "Kruh, ki vzhaja čez noč", level: 2, size: 5 }]);
  if (has("text")) left.push(["t", { kind: "text", paragraphs: ["Vsako jutro zamesimo, počakamo in spečemo."] }]);
  if (has("list")) left.push(["l", { kind: "list", items: ["Beli kruh", "Kvasni kruh", "Pecivo"] }]);
  if (has("fact")) left.push(["f", countable ? { kind: "fact", value: "12", label: "vrst kruha", treatment: "numeral", size: 5 } : { kind: "fact", value: "041 555 730", label: "Pokličite", treatment: "plate", size: 4 }]);
  const withImage = has("image");
  for (const [id, props] of left) {
    row++;
    add(id, props, 1, withImage ? 7 : 8);
  }
  if (withImage) {
    const rows = Math.max(1, left.length);
    row = 1;
    add("i", { kind: "image", image: images[0], ratio: "4:3", mask: "none" }, left.length ? 8 : 1, left.length ? 5 : 8, rows);
    row = rows;
  }
  if (has("photos")) {
    row++;
    add("p", { kind: "photos", images: images.slice(0, 2), arrangement: "offset-pair" }, 1, 8);
  }
  if (!out.length) {
    row = 1;
    add("h", { kind: "heading", text: "Kruh, ki vzhaja čez noč", level: 2, size: 5 }, 1, 7);
  }
  return out;
}

/** A motion preset: a section with it under an opener (never on the first section), photographed at 0, 50 and 100 %. */
export function motionPages(asset: Asset): SheetPage[] {
  const { base, page } = pageMaker(asset);
  const name = assetName(asset.id);
  const meta = (MOTION_META as Record<string, { targets: readonly string[]; minLevel: string } | undefined>)[name];
  const targets = meta?.targets ?? ["heading", "text", "image"];
  return palettes().map((dir, i) => {
    const opener = section("default", { elements: [el("h", { kind: "heading", text: "Domača pekarna", level: 2, size: 4 }, 1, 8, 1, 0)] }, "s_open");
    // A preset with no element targets moves the background layer: the section gets a photo layer under a scrim.
    const layer = targets.length === 0 ? { background: [{ kind: "photo", image: imageIds(base)[0], scrim: { role: "inverse", strength: 3 } }] } : {};
    const subject = section(targets.length === 0 ? "inverse" : "default", { motion: name, ...layer, elements: motionElements(targets, imageIds(base), name === "counter") }, "s_motion");
    const spec = withHome(inDirection(base, dir), [opener, subject], "x");
    if (meta?.minLevel === "lively") spec.design = { ...spec.design, motion: "lively" };
    return page(LETTER(i), dir.id, spec, { motion: name });
  });
}

/** The tones a type treatment or fact object page shows its three sizes on, then the band (where own grounds flip). */
const SIZE_TONES = ["default", "alt", "inverse", "band"] as const;

/**
 * Headings for the type treatment sheets: three per treatment, one per size, each a heading of the three fixtures'
 * goldens (tools/eval/golden: pekarna-kvas, avtoservis-mrak, instalacije-rebernik) or, for fascia-lettering and
 * masthead, a business name. drop-numeral needs a heading that starts with a number, which no golden heading does: its
 * three are written from the fixtures' own facts (od leta 2008, pirin kruh z drožmi 4,20 €, od leta 2011), nothing added.
 */
export const TYPE_TREATMENT_SAMPLES: Readonly<Record<string, readonly [string, string, string]>> = {
  circle: ["Potica za praznike", "Servis vseh znamk v Kranju", "Ogled je brezplačen"],
  vertical: ["Kontakt", "Pokličite", "Popravilo"],
  "oversized-first-word": ["Kruh z drožmi, ki vzhaja čez noč", "Servis vseh znamk v Kranju", "Vodovod, ogrevanje, toplotne črpalke in prenove kopalnic"],
  "ruled-total": ["Potica za praznike", "Storitve in cene", "Pisna ponudba"],
  "title-block": ["Vsak dan v pekarni", "Kaj naredimo v delavnici", "Od klica do pisne ponudbe"],
  masthead: ["Pekarna Kvas", "Storitve in cene", "Inštalacije Rebernik"],
  "typed-line": ["Pokličite ali pišite", "Najhitreje nas dobite po telefonu", "Dogovorite se za brezplačen ogled"],
  "rule-flanked": ["Kdaj smo odprti", "Kje smo", "Kje delamo"],
  "fascia-lettering": ["Pekarna Kvas", "Avtoservis Mrak", "Inštalacije Rebernik"],
  "marker-highlight": ["Kruh z drožmi, ki vzhaja čez noč", "Najprej predračun, potem popravilo", "Ogled je brezplačen"],
  "drop-numeral": ["4,20 € pirin kruh z drožmi", "2008 – družinski servis v Kranju", "2011 – samostojni podjetnik na Ptuju"],
  "corner-marks": ["Drožmi, ki jih gojimo sami", "Kaj servisiramo", "Sedež na Ptuju"],
};

/** The three sizes a treatment is shown at: 2, 5, 8, clamped to its G20 size limits (vertical: 4, 5, 5). */
export function treatmentSizes(name: string): [number, number, number] {
  const l = (TYPE_TREATMENT_LIMITS as Record<string, { minSize?: number; maxSize?: number }>)[name] ?? {};
  const clamp = (n: number) => Math.min(Math.max(n, l.minSize ?? 0), l.maxSize ?? 8);
  return [clamp(2), clamp(5), clamp(8)];
}

/** The desktop span of a treated heading: a circle or a vertical word is an object; display type takes 8 columns, 12 at size 8. */
const treatmentSpan = (name: string, size: number): number => (name === "circle" ? 5 : name === "vertical" ? 3 : size >= 8 ? 12 : 8);

/**
 * A type treatment: its three real headings at sizes 2, 5 and 8 on paper, alt and inverse, then the middle one again on
 * the band, beside a line of running text from the same golden pages (so the heading's scale reads against the body), in
 * two palettes. vertical is set in capitals at weight 800, as G20 asks.
 */
export function typeTreatmentPages(asset: Asset): SheetPage[] {
  const { base, page } = pageMaker(asset);
  const name = assetName(asset.id);
  const samples = TYPE_TREATMENT_SAMPLES[name];
  if (!samples || !(TYPE_TREATMENTS as readonly string[]).includes(name)) return [];
  const sizes = treatmentSizes(name);
  const body = "Naročilo sprejmemo po telefonu ali e-pošti.";
  const caps = name === "vertical" ? { case: "uppercase", weight: 800 } : {};
  return palettes().map((dir, i) => {
    const sections = SIZE_TONES.map((tone, k) => {
      const n = k < 3 ? k : 1;
      const size = sizes[n]!;
      const span = treatmentSpan(name, size);
      const text = span === 12 ? el("t", { kind: "text", paragraphs: [body] }, 1, 5, 2, 1) : el("t", { kind: "text", paragraphs: [body] }, span < 8 ? span + 2 : 9, 4, 1, 1);
      return section(tone as Tone, { elements: [el("h", { kind: "heading", text: samples[n], level: 2, size, treatment: name, ...caps }, 1, span, 1, 0), text] }, `s_g_${k}`);
    });
    return page(LETTER(i), dir.id, withHome(inDirection(base, dir), sections, "x"));
  });
}

/**
 * Facts for the fact object sheets, three per object (one per size), each a fact of the three fixtures (tools/eval/fixtures:
 * pekarna-kvas, avtoservis-mrak, instalacije-rebernik) as the client wrote it: a street number, a town, opening hours, a
 * price, a weight limit, a phone, a year, a person. Where a fixture has no such fact (Rebernik gives no hours or prices) another
 * fixture's is used; nothing is made up.
 */
export const FACT_OBJECT_SAMPLES: Readonly<Record<string, readonly [FactSample, FactSample, FactSample]>> = {
  "house-number": [
    { value: "30", label: "Šutna, Kamnik" },
    { value: "52", label: "Savska cesta, Kranj" },
    { value: "18", label: "Ormoška cesta, Ptuj" },
  ],
  signpost: [
    { value: "Kamnik", label: "Šutna 30" },
    { value: "Kranj", label: "Savska cesta 52" },
    { value: "Ptuj", label: "Ormoška cesta 18" },
  ],
  timetable: [
    { value: "6.30–18.00", label: "pon–pet", labelAt: "before" },
    { value: "7.00–16.00", label: "pon–pet", labelAt: "before" },
    { value: "6.30–12.00", label: "sobota", labelAt: "before" },
  ],
  receipt: [
    { value: "4,20 €", label: "pirin kruh z drožmi", labelAt: "before" },
    { value: "30 €", label: "diagnostika", labelAt: "before" },
    { value: "1,30 €", label: "rogljiček z maslom", labelAt: "before" },
  ],
  total: [
    { value: "od 18 €", label: "orehova potica (1 kg)" },
    { value: "59 €", label: "polnjenje klime" },
    { value: "40 €", label: "hramba gum na sezono" },
  ],
  dimension: [
    { value: "1 kg", label: "orehova potica" },
    { value: "3,5 t", label: "kombiji do" },
    { value: "3,5 t", label: "servisiramo kombije do" },
  ],
  "index-tab": [
    { value: "041 555 906", label: "Naročila", labelAt: "before" },
    { value: "041 555 730", label: "Pokličite", labelAt: "before" },
    { value: "041 555 118", label: "Pokličite", labelAt: "before" },
  ],
  calendar: [
    { value: "6.30–12.00", label: "sobota", labelAt: "before" },
    { value: "po dogovoru", label: "sobota", labelAt: "before" },
    { value: "7.00–10.00", label: "nedelja", labelAt: "before" },
  ],
  split: [
    { value: "4,20 €", label: "pirin kruh z drožmi", labelAt: "before" },
    { value: "2008", label: "od leta", labelAt: "before" },
    { value: "2011", label: "od leta", labelAt: "before" },
  ],
  "door-plate": [
    { value: "Jure Petek", label: "pek" },
    { value: "Rok Mrak", label: "vodja servisa" },
    { value: "Matej Rebernik", label: "inštalater z mojstrskim izpitom" },
  ],
  ruler: [
    { value: "2011", label: "od leta" },
    { value: "2008", label: "od leta" },
    { value: "3,5 t", label: "kombiji do" },
  ],
};
interface FactSample {
  value: string;
  label: string;
  labelAt?: "before";
}

/** The link the sheet puts on a fact object's smallest size (the whole object is the target, ≥ 44 px): directions for a place, else a call. */
const factLink = (name: string) => ({ action: name === "house-number" || name === "signpost" ? "directions" : "call" });

/**
 * A fact object: its three fixture facts at sizes 2, 5 and 8 on paper, alt and inverse (the size-2 one linked), then the
 * middle one again on the band, in two palettes.
 */
export function factObjectPages(asset: Asset): SheetPage[] {
  const { base, page } = pageMaker(asset);
  const name = assetName(asset.id);
  const samples = FACT_OBJECT_SAMPLES[name];
  if (!samples || !(FACT_OBJECTS as readonly string[]).includes(name)) return [];
  const sizes = [2, 5, 8] as const;
  return palettes().map((dir, i) => {
    const sections = SIZE_TONES.map((tone, k) => {
      const n = k < 3 ? k : 1;
      const f = samples[n]!;
      const span = sizes[n] === 8 ? 8 : 6;
      return {
        ...section(tone as Tone, {
          elements: [
            el("f", { kind: "fact", treatment: name, size: sizes[n], value: f.value, label: f.label, ...(f.labelAt ? { labelAt: f.labelAt } : {}), ...(k === 0 ? { link: factLink(name) } : {}) }, 1, span, 1, 0),
          ],
        }, `s_g_${k}`),
        ...(tone !== "default" ? { tone } : {}),
      } as Section;
    });
    return page(LETTER(i), dir.id, withHome(inDirection(base, dir), sections, "x"));
  });
}

/** The pages a contact sheet photographs for an asset: the composition-language kinds here, the rest in pages.ts. */
export function pagesFor(asset: Asset): SheetPage[] {
  switch (asset.kind) {
    case "motif":
    case "ornament":
      if (drawingData(asset.id)) return drawingPages(asset);
      return asset.kind === "ornament" ? [] : pagesForV1(asset);
    case "composition":
      return compositionPages(asset, PRESET_SOURCE.current(asset));
    case "motion":
      return motionPages(asset);
    case "icon":
      return iconPages(asset);
    case "wordmark":
      return wordmarkPages(asset);
    case "divider":
      return dividerPages(asset);
    case "texture":
      return texturePages(asset);
    case "typeTreatment":
      return typeTreatmentPages(asset);
    case "factObject": {
      const own = factObjectPages(asset);
      return own.length ? own : pagesForV1(asset);
    }
    default:
      return pagesForV1(asset);
  }
}
