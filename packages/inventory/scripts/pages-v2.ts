/**
 * Contact-sheet pages for the composition language's inventory kinds (docs/plans/studio-phase1-design.md §5): drawings
 * (motifs and ornaments in the Drawing format), compositions (filled presets), motion presets (three frames),
 * practical-fact icons, wordmarks (20 real Slovene names), dividers (the edge between two sections) and section
 * textures. Each page is a small site spec the real component library renders, so a sheet equals what a site renders.
 * `pagesFor` here is the sheet's entry point: these kinds first, then the older kinds in pages.ts.
 */
import { readFileSync } from "node:fs";
import { drawingData } from "@sb/components";
import {
  ComposedProps,
  EDGES,
  MOTION_META,
  WORDMARK_STYLES,
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
    return page(`n${String(n + 1).padStart(2, "0")}`, `${known ? "" : `NOT IN WORDMARK_STYLES, drawn as plain · `}${name} · ${dir.id}`, withHome(spec, [grounds(() => [el("w", { kind: "wordmark", size: 5 }, 5, 8, 1, 1)])[n % TONES.length]!], "x"));
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
function motionElements(targets: readonly string[], images: string[]): Props[] {
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
  if (has("fact")) left.push(["f", { kind: "fact", value: "041 555 730", label: "Pokličite", treatment: "plate", size: 4 }]);
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
  const meta = (MOTION_META as Record<string, { targets: readonly string[] } | undefined>)[name];
  const targets = meta?.targets ?? ["heading", "text", "image"];
  return palettes().map((dir, i) => {
    const opener = section("default", { elements: [el("h", { kind: "heading", text: "Domača pekarna", level: 2, size: 4 }, 1, 8, 1, 0)] }, "s_open");
    const subject = section("default", { motion: name, elements: motionElements(targets, imageIds(base)) }, "s_motion");
    return page(LETTER(i), dir.id, withHome(inDirection(base, dir), [opener, subject], "x"), { motion: name });
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
    default:
      return pagesForV1(asset);
  }
}
