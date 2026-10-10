/**
 * The pages a contact sheet photographs, one per asset (and palette): fonts as specimens, palettes as swatches with
 * their contrast numbers, and everything that renders through the components (sections, motifs, treatments, masks,
 * fact objects, header and footer families) as a small site spec rendered by @sb/render, the same code that publishes.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ComposedProps,
  DIRECTIONS,
  FAMILIES,
  FONTS,
  FONT_PAIRS,
  SUBMOTIF_BASE,
  SUBTYPE_MOTIF,
  direction,
  enforceDesign,
  migrateSpec,
  sectionDef,
  skeletonOfChrome,
  subtypesOf,
  validateSite,
  type BusinessSubtype,
  type Colors,
  type Direction,
  type FontFace,
  type Section,
  type SiteSpec,
  type SubMotif,
} from "@sb/spec";
import { SLOVENE_GLYPHS, assetName, paletteContrast, paletteOf, shippedColors, type Asset } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../..");
const goldenDir = path.join(repoRoot, "tools/eval/golden");
export const fixturesDir = path.join(repoRoot, "tools/eval/fixtures");

export interface Golden {
  id: string;
  spec: SiteSpec;
}

let goldens: Golden[] | undefined;
export function loadGoldens(): Golden[] {
  return (goldens ??= readdirSync(goldenDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ id: f.replace(/\.json$/, ""), spec: migrateSpec(JSON.parse(readFileSync(path.join(goldenDir, f), "utf8"))) as SiteSpec })));
}
const golden = (id: string): Golden => loadGoldens().find((g) => g.id === id)!;

/** The golden whose photos the section, treatment and chrome pages use (the most photos: eight). */
export const BASE_GOLDEN = "kmetija-grabnar";
/** The two palettes every component page is shown in: a cool white one and a warm one with a tinted surface. */
export const SHEET_PALETTES = ["clean-swiss", "warm-craft"] as const;
const TONES = ["default", "alt", "inverse"] as const;

/** One page to photograph: either a rendered site (spec) or a standalone HTML document. */
export type SheetPage =
  | { asset: string; variant: string; label: string; kind: "site"; spec: SiteSpec; fixture: string; showChrome: boolean }
  | { asset: string; variant: string; label: string; kind: "html"; html: string };

type Props = Record<string, unknown>;

const cut = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, s.lastIndexOf(" ", max - 1))}`);

/** Image ids of a spec's assets, in order. */
const imageIds = (spec: SiteSpec): string[] => spec.assets.images.map((i) => i.id);

/** Replaces any image reference in props that `into` doesn't have with one it has (round robin). */
function remapImages(value: unknown, have: string[], counter = { i: 0 }): unknown {
  if (typeof value === "string") return /^img_/.test(value) && !have.includes(value) ? have[counter.i++ % have.length] : value;
  if (Array.isArray(value)) return value.map((v) => remapImages(v, have, counter));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remapImages(v, have, counter)]));
  return value;
}

/** Sample props for sections no golden has. Slovene, and every fact a placeholder-free sample of the base golden's kind. */
function handSample(type: string, images: string[]): Props | undefined {
  const desk = (col: number, span: number, row: number, more: object = {}) => ({ col, span, row, ...more });
  switch (type) {
    case "hero-image":
      return { headline: "Domača hrana iz naše kuhinje", intro: "Kmetija na robu gozda: sobe, domači kruh in pot do razgledne točke.", image: images[0], primary: { label: "Pokličite", target: { action: "call" } } };
    case "announcement":
      return { title: "Zaprto od 24. 12. do 2. 1.", text: "Med prazniki ne sprejemamo gostov. Termine za januar lahko rezervirate že zdaj.", link: { label: "Pokličite", target: { action: "call" } } };
    case "contact-form":
      return { title: "Pišite nam", intro: "Odgovorimo v enem delovnem dnevu.", askPhone: true };
    case "composed":
      return ComposedProps.parse({
        intent: "story",
        width: "wide",
        rows: 3,
        elements: [
          { id: "e_title", kind: "heading", text: "Kruh, ki vzhaja čez noč", level: 2, size: 6, weight: 800, measure: "m", desk: desk(1, 7, 1), phone: { order: 0, span: "full" } },
          { id: "e_fact", kind: "fact", value: "041 555 730", label: "Pokličite", treatment: "plate", size: 4, desk: desk(1, 6, 2), phone: { order: 1, span: "full" } },
          { id: "e_call", kind: "action", action: "call", label: "Pokliči", style: "primary", desk: desk(1, 3, 3, { alignY: "start" }), phone: { order: 2, span: "full" } },
          { id: "e_photo", kind: "image", image: images[0], ratio: "4:5", mask: "arch", desk: desk(8, 5, 1, { rowSpan: 3 }), phone: { order: 3, span: "full" } },
        ],
      }) as Props;
  }
  return undefined;
}

/** A section of `type:variant` with sample props: from a golden that has the type (the base golden first), else hand-made. */
export function sampleSection(base: SiteSpec, key: string, id: string, tone?: string): Section | null {
  const [type, variant] = key.split(":") as [string, string];
  const sources = [base, ...loadGoldens().map((g) => g.spec)];
  let props: Props | undefined;
  // The same type:variant first (some props belong to one variant), then any variant of the type.
  const ordered = [...sources.map((s) => ({ s, exact: true })), ...sources.map((s) => ({ s, exact: false }))];
  for (const { s, exact } of ordered) {
    const found = s.pages.flatMap((p) => p.sections).find((x) => x.type === type && (!exact || x.variant === variant));
    if (found) {
      props = structuredClone(found.props) as Props;
      // A hero borrowed from another trade's golden says what the base golden's own hero says.
      const own = s !== base && type.startsWith("hero") ? (base.pages.find((p) => p.kind === "home")?.sections[0]?.props as Props | undefined) : undefined;
      if (own) for (const [k, max] of [["headline", 60], ["intro", 200]] as const) if (typeof own[k] === "string") props[k] = cut(own[k], max);
      break;
    }
  }
  props ??= handSample(type, imageIds(base));
  if (!props) return null;
  props = remapImages(props, imageIds(base)) as Props;
  // Borrowed props must hold on the base's facts: no booking link without a booking address, the phone as the
  // signature hero's fact where the variant can't show the address.
  if (!(base.business as { bookingUrl?: string }).bookingUrl) props = JSON.parse(JSON.stringify(props).replace(/"action":"booking"/g, '"action":"call"')) as Props;
  // Links to pages of another golden become a call.
  const pageIds = new Set(base.pages.map((p) => p.id));
  props = JSON.parse(JSON.stringify(props), (k, v: unknown) => (k === "target" && v && typeof v === "object" && "page" in v && !pageIds.has((v as { page: string }).page) ? { action: "call" } : v)) as Props;
  if (type === "hero-signature" && props.fact === "address" && !["label", "card", "bend"].includes(variant)) props.fact = "phone";
  if (type === "hero-signature" && props.fact === "phone" && !props.factLabel) props.factLabel = "Pokličite nas";
  if (typeof props.wordmark === "string") props.wordmark = base.business.name.split(/\s+/).sort((a, b) => b.length - a.length)[0];
  // Three copies of a composed sample on one page: each its own photo and a smaller heading (the per-page limits).
  if (type === "composed" && id !== "s_g_default") {
    const n = TONES.indexOf(tone as (typeof TONES)[number]);
    props = JSON.parse(JSON.stringify(props).replace(/"image":"img_\d+"/g, `"image":"${imageIds(base)[(n * 2) % imageIds(base).length]}"`).replace(/"size":6/g, '"size":4')) as Props;
  }
  if (type === "hero-signature" && (variant === "drawing" || variant === "receipt")) delete props.image;
  if (type === "hero-signature" && variant !== "drawing" && variant !== "receipt" && !props.image) props.image = imageIds(base)[0];
  const def = sectionDef(type);
  const need = (def.variantNeeds as Record<string, string> | undefined)?.[variant];
  if (need && props[need] === undefined && need === "figure") props.figure = { value: "1998", label: "Leto odprtja" };
  return { id, type, variant, ...(tone && tone !== "default" ? { tone } : {}), props } as Section;
}

/** The base spec in a palette direction: its colours, its first font pair, its imagery (or `imagery`). */
function inDirection(spec: SiteSpec, dir: Direction, colors: Colors = dir.palette.fallback, imagery?: string): SiteSpec {
  const out = structuredClone(spec);
  const fontPair = FAMILIES[dir.id]?.fontPairs[0] ?? dir.fontPairs[0]!;
  out.design = enforceDesign({ ...out.design, direction: dir.id, fontPair, colors: { ...colors }, imagery: (imagery ?? dir.imagery) as SiteSpec["design"]["imagery"], skeleton: undefined, genome: undefined }, dir);
  delete out.design.skeleton;
  delete out.design.genome;
  delete out.business.subtype;
  return out;
}

/**
 * Borrowed sample props that break a variant's rules are repaired the way an editor would: a prop the variant doesn't
 * show is left out, a required item description gets a short placeholder line. What still fails is reported on the sheet.
 */
export function repairSpec(spec: SiteSpec): SiteSpec {
  for (let round = 0; round < 3; round++) {
    const v = validateSite(spec);
    if (v.ok) break;
    let changed = false;
    for (const issue of v.issues) {
      const keys = issue.path.split("/").filter(Boolean);
      const last = keys.pop()!;
      let parent: unknown = spec;
      for (const k of keys) parent = (parent as Record<string, unknown> | undefined)?.[k];
      if (!parent || typeof parent !== "object") continue;
      const obj = parent as Record<string, unknown>;
      if (/only shown by/.test(issue.message) && last in obj) {
        delete obj[last];
        changed = true;
      } else if (/is required/.test(issue.message) && last === "description") {
        obj[last] = "Opis po dogovoru.";
        changed = true;
      }
    }
    if (!changed) break;
  }
  return spec;
}

function withHome(spec: SiteSpec, sections: Section[], slug: string): SiteSpec {
  spec.slug = slug;
  const home = spec.pages.find((p) => p.kind === "home")!;
  home.sections = sections;
  return spec;
}

/** A section shown three times, on the default, alternate and inverse grounds. */
function threeGrounds(base: SiteSpec, key: string): Section[] {
  return TONES.map((t) => sampleSection(base, key, `s_g_${t}`, t)).filter((s): s is Section => s !== null);
}

const slugOf = (id: string, variant: string): string => `${id.replace(/[/:]/g, "-")}-${variant}`.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

/** Pages for every component-rendered asset kind, per palette. */
export function sitePages(asset: Asset): SheetPage[] {
  const base = golden(BASE_GOLDEN).spec;
  const name = assetName(asset.id);
  const page = (variant: string, label: string, spec: SiteSpec, showChrome = false, fixture = BASE_GOLDEN): SheetPage => ({
    asset: asset.id,
    variant,
    label,
    kind: "site",
    spec: repairSpec(withHome(spec, spec.pages.find((p) => p.kind === "home")!.sections, slugOf(asset.id, variant))),
    fixture,
    showChrome,
  });
  const palettes = SHEET_PALETTES.map((id) => direction(id));
  switch (asset.kind) {
    case "section":
      return palettes.map((dir, i) => page(String.fromCharCode(97 + i), dir.id, withHome(inDirection(base, dir), threeGrounds(base, name), "x")));
    case "treatment": {
      const isSite = asset.note?.includes("site imagery");
      return palettes.map((dir, i) => {
        const spec = inDirection(base, dir, dir.palette.fallback, isSite ? name : undefined);
        const sections = isSite
          ? [sampleSection(base, "hero-split:image-right", "s_g_default"), sampleSection(base, "image-text:image-left", "s_g_alt", "alt"), sampleSection(base, "gallery:grid", "s_g_inverse", "inverse")]
          : composedGrounds(base, (img) => [{ kind: "image", image: img, ratio: "4:3", treatment: name }]);
        return page(String.fromCharCode(97 + i), dir.id, withHome(spec, sections.filter((s): s is Section => s !== null), "x"));
      });
    }
    case "mask":
      return palettes.map((dir, i) => page(String.fromCharCode(97 + i), dir.id, withHome(inDirection(base, dir), composedGrounds(base, (img) => [{ kind: "image", image: img, ratio: "1:1", mask: name }]), "x")));
    case "factObject":
      return palettes.map((dir, i) =>
        page(String.fromCharCode(97 + i), dir.id, withHome(inDirection(base, dir), composedGrounds(base, () => [{ kind: "fact", value: "041 555 730", label: "Pokličite nas", treatment: name, size: 5 }]), "x")),
      );
    case "header":
    case "footer":
      return palettes.map((dir, i) => {
        const spec = inDirection(base, dir);
        const skeleton = { ...skeletonOfChrome({ header: { variant: "bar" }, footer: { variant: "columns" } }), ...(asset.kind === "header" ? { header: name } : { footer: name }) } as NonNullable<SiteSpec["design"]["skeleton"]>;
        spec.design.skeleton = skeleton;
        // The overlay family sits only over a full-bleed photo hero on a site without a logo.
        const hero = name === "overlay" ? "hero-signature:photo" : "hero-split:image-right";
        if (name === "overlay") delete spec.assets.logo;
        const sections = [sampleSection(base, hero, "s_hero"), sampleSection(base, "services-list:rows", "s_more", "alt")].filter((s): s is Section => s !== null);
        return page(String.fromCharCode(97 + i), dir.id, withHome(spec, sections, "x"), true);
      });
    case "motif":
    case "submotif":
      return motifPages(asset, name, page);
    default:
      return [];
  }
}

/** Three composed sections, one per ground, each holding the given elements beside a heading. */
function composedGrounds(base: SiteSpec, elements: (image: string) => Props[]): Section[] {
  const imgs = imageIds(base);
  return TONES.map((tone, t) => {
    const els = elements(imgs[t % imgs.length]!);
    const props = ComposedProps.parse({
      intent: "story",
      width: "contained",
      rows: 1,
      elements: [
        { id: "e_h", kind: "heading", text: `Podlaga: ${tone}`, level: 2, size: 4, desk: { col: 1, span: 4, row: 1 }, phone: { order: 0, span: "full" } },
        ...els.map((e, i) => ({ id: `e_${i}`, ...e, desk: { col: 5 + i * 4, span: 4, row: 1 }, phone: { order: i + 1, span: "full" } })),
      ],
    });
    return { id: `s_g_${tone}`, type: "composed", variant: "free", ...(tone !== "default" ? { tone } : {}), props } as Section;
  });
}

/** A template's homepage outline as sections, with props from the trade's golden (else any golden). */
function outlineSections(dir: Direction, base: SiteSpec): Section[] {
  const out: Section[] = [];
  for (const [i, line] of (dir.template?.homepage ?? []).entries()) {
    const m = /^([a-z-]+):([a-z-]+)(?: tone ([a-z]+))?/.exec(line);
    if (!m) continue;
    const key = i === 0 ? (FAMILIES[dir.id]?.heroes[0] ?? `${m[1]}:${m[2]}`) : `${m[1]}:${m[2]}`;
    const s = sampleSection(base, key, `s_o${i}`, m[3]);
    if (s) out.push(s);
  }
  return out;
}

/** A motif on its template's homepage (the trade's golden when it uses the template, else the outline), in two family palettes. */
function motifPages(asset: Asset, name: string, page: (variant: string, label: string, spec: SiteSpec, showChrome?: boolean, fixture?: string) => SheetPage): SheetPage[] {
  const sub = asset.kind === "submotif" ? (name as SubMotif) : undefined;
  const motif = sub ? SUBMOTIF_BASE[sub] : name;
  const dir = DIRECTIONS.find((d) => d.template?.motif === motif)!;
  const trade = dir.template!.firstFor[0]!;
  const g = loadGoldens().find((x) => x.spec.business.type === trade)!;
  const subtype = sub ? (Object.entries(SUBTYPE_MOTIF).find(([, v]) => v === sub)![0] as BusinessSubtype) : subtypesOf(trade).find((s) => !SUBTYPE_MOTIF[s]);
  const family = FAMILIES[dir.id]!;
  return family.palettes.slice(0, 2).map((p, i) => {
    const spec = inDirection(g.spec, dir, p.colors);
    if (g.spec.design.direction !== dir.id) withHome(spec, outlineSections(dir, g.spec), "x");
    if (subtype) spec.business.subtype = subtype;
    return page(String.fromCharCode(97 + i), `${dir.id}-${p.id}`, spec, true, g.id);
  });
}

// ---------------------------------------------------------------- standalone pages: fonts, pairings, palettes

const SAMPLE = "Čevljar Đuro in šivilja Žana: ćaća, kuščar, žličnik, đuveč.";
const PARAGRAPH =
  "Družinska delavnica v Škofji Loki. Popravila čevljev, torb in pasov; šivanje usnja po meri. Ob sobotah dopoldne odprto, ostale dni po dogovoru. Pokličite, preden se oglasite, da vas počaka kava.";

const fontFace = (f: FontFace): string =>
  `@font-face{font-family:"${f.family}";src:url("/_fonts/${f.file}.woff2") format("woff2");font-weight:${f.weights[0]} ${f.weights[1]};font-display:block}`;

const doc = (title: string, css: string, body: string): string =>
  `<!doctype html><html lang="sl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>*{box-sizing:border-box}body{margin:0;padding:24px 16px;background:#fff;color:#16181c;font:16px/1.5 system-ui,sans-serif}${css}</style></head><body>${body}</body></html>`;

export function fontPage(asset: Asset): SheetPage {
  const face = Object.values(FONTS).find((f) => f.file === assetName(asset.id))!;
  const [lo, hi] = face.weights;
  const mid = Math.round((lo + hi) / 200) * 100;
  const css = `${fontFace(face)}.f{font-family:"${face.family}",${face.fallback}}.meta{font:13px/1.4 system-ui;color:#555;margin:0 0 16px}.big{font-size:clamp(40px,9vw,96px);line-height:1;margin:0 0 12px;letter-spacing:-.01em}.row{font-size:clamp(20px,4vw,34px);margin:0 0 10px;overflow-wrap:anywhere}.glyphs{font-size:clamp(28px,6vw,56px);letter-spacing:.06em;margin:16px 0;overflow-wrap:anywhere}.p{max-width:38em;font-size:18px}`;
  const body = `<p class="meta">${asset.id} · ${face.family} · wght ${lo}–${hi} · ${(asset.bytes / 1024).toFixed(1)} KB · ${asset.license}</p>
<p class="f big" style="font-weight:${hi >= 800 ? 800 : hi}">Šola žlic</p>
<p class="f row" style="font-weight:${lo}">${lo} ${SAMPLE}</p>
<p class="f row" style="font-weight:${mid}">${mid} ${SAMPLE}</p>
<p class="f row" style="font-weight:${hi}">${hi} ${SAMPLE}</p>
<p class="f glyphs" style="font-weight:${mid}">${[...SLOVENE_GLYPHS].join(" ")} € „“ – … 0123456789</p>
<p class="f p" style="font-weight:400">${PARAGRAPH}</p>`;
  return { asset: asset.id, variant: "a", label: face.family, kind: "html", html: doc(face.family, css, body) };
}

export function pairingPage(asset: Asset): SheetPage {
  const p = FONT_PAIRS.find((x) => x.id === assetName(asset.id))!;
  const faces = [p.heading, p.body].filter((f, i, a) => a.findIndex((x) => x.file === f.file) === i);
  const css = `${faces.map(fontFace).join("")}.h{font-family:"${p.heading.family}",${p.heading.fallback};font-weight:700;font-size:clamp(34px,7vw,72px);line-height:1.05;margin:0 0 16px;letter-spacing:-.015em}.h2{font-family:"${p.heading.family}",${p.heading.fallback};font-weight:600;font-size:clamp(24px,4vw,40px);margin:28px 0 8px}.b{font-family:"${p.body.family}",${p.body.fallback};font-size:18px;max-width:36em;margin:0 0 12px}.meta{font:13px/1.4 system-ui;color:#555;margin:0 0 16px}`;
  const body = `<p class="meta">${asset.id} · ${p.label} · ${(asset.bytes / 1024).toFixed(1)} KB</p>
<h1 class="h">Popravila čevljev in torb v Škofji Loki</h1>
<p class="b">${PARAGRAPH}</p>
<h2 class="h2">Cenik: šivanje, lepljenje, ćup</h2>
<p class="b">Žepi, zadrge in ročaji. ${[...SLOVENE_GLYPHS].join(" ")} — 12,50 €.</p>`;
  return { asset: asset.id, variant: "a", label: p.label, kind: "html", html: doc(p.label, css, body) };
}

const ROLES: (keyof Colors)[] = ["background", "surface", "text", "muted", "primary", "onPrimary", "accent", "border", "inverse", "onInverse", "band", "onBand"];

export function palettePage(asset: Asset): SheetPage {
  const p = paletteOf(asset.id)!;
  const c = p.colors;
  const shipped = shippedColors(c, p.direction);
  const stored = paletteContrast(c, p.direction);
  const after = paletteContrast(shipped, p.direction);
  const sw = ROLES.filter((r) => c[r])
    .map((r) => `<div class="sw"><div class="chip" style="background:${c[r]}"></div><b>${r}</b><code>${c[r]}</code>${shipped[r] && shipped[r] !== c[r] ? `<code class="chg">→ ${shipped[r]}</code>` : ""}</div>`)
    .join("");
  const rows = stored
    .map((s, i) => {
      const a = after[i]!;
      return `<tr class="${s.ok ? "" : "miss"}"><td><span class="pair" style="background:${c[s.bg]};color:${c[s.fg]}">Aa</span></td><td>${s.fg} / ${s.bg}</td><td>${s.ratio.toFixed(2)}</td><td>${a.ratio.toFixed(2)}</td><td>≥ ${s.min}</td><td>${s.ok ? "ok" : a.ok ? "repaired" : "MISS"}</td></tr>`;
    })
    .join("");
  const demo = `<div class="demo" style="background:${c.background};color:${c.text};border:1px solid ${c.border}"><b style="font-size:22px">Kruh z drožmi</b><p style="color:${c.muted};margin:6px 0 12px">Vsak dan od 7. ure.</p><span class="btn" style="background:${c.primary};color:${c.onPrimary}">Pokličite</span> <a style="color:${c.accent}">Pot do nas</a></div>
<div class="demo" style="background:${c.surface};color:${c.text}">Surface: <span style="color:${c.muted}">muted text</span></div>
<div class="demo" style="background:${c.inverse};color:${c.onInverse}">Inverse <a style="color:${c.accent}">accent link</a></div>
${c.band ? `<div class="demo" style="background:${c.band};color:${c.onBand}">Band: 041 555 730</div>` : ""}`;
  const css = `.meta{font:13px/1.4 system-ui;color:#555;margin:0 0 16px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:18px}.sw{font-size:13px;display:flex;flex-direction:column;gap:2px}.chip{height:56px;border:1px solid #0002;border-radius:4px}code{font-size:12px}.chg{color:#b00}.wrap{display:grid;gap:16px}@media(min-width:900px){.wrap{grid-template-columns:1fr 1fr}}table{border-collapse:collapse;font-size:13px;width:100%}td{padding:3px 6px;border-bottom:1px solid #eee}.miss td{background:#fde8e8;font-weight:600}.pair{display:inline-block;padding:0 6px;font-weight:700;border:1px solid #0001}.demo{padding:14px 16px;border-radius:4px;margin-bottom:8px}.btn{display:inline-block;padding:8px 14px;border-radius:3px;font-weight:600}`;
  const body = `<p class="meta">${asset.id} · ${asset.note ?? ""} · ground ${asset.tags.ground.join(", ")} · ${asset.tags.mood.join(", ")}</p><div class="grid">${sw}</div><div class="wrap"><div>${demo}</div><table><tr><td></td><td>pair</td><td>stored</td><td>as rendered</td><td>min</td><td></td></tr>${rows}</table></div>`;
  return { asset: asset.id, variant: "a", label: asset.id, kind: "html", html: doc(asset.id, css, body) };
}

export function pagesFor(asset: Asset): SheetPage[] {
  if (asset.kind === "font") return [fontPage(asset)];
  if (asset.kind === "pairing") return [pairingPage(asset)];
  if (asset.kind === "palette") return [palettePage(asset)];
  return sitePages(asset);
}
