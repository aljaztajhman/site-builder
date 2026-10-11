/**
 * Guards G1–G22 of composition language v2 (spec v20, docs/plans/studio-phase1-design.md §2 and §2.1), the rules that
 * read the v20 fields. guards.ts keeps G13, G18, G23, G24 and G25 (changes to the v19 rules) and calls this file.
 *
 * Every rule is a function of an Env that returns findings: an issue (what validateComposition reports), a fix (what
 * repairComposition does, logged as "<path>: <what>"), or both. Validation runs every rule on the section as it is;
 * repair runs them in order on a copy, each on the state the earlier fixes left. A dropped element or layer stays in its
 * array until the end of the repair (it is only marked in `env.gone`), so every path, logged or reported, keeps the
 * index the section had when it came in.
 *
 * The contrast model (G3, G9): see the comment block in test/composition-guards-v2.test.ts.
 */
import type { Issue } from "../validate.ts";
import type { Section } from "../sections/index.ts";
import type { Colors } from "../design.ts";
import { NUMBERED_LABEL } from "../banned.ts";
import { contrast, mix } from "../color.ts";
import { KIND_PREFIX } from "../assets.ts";
import { ON_ROLE, factObjectGround, typeTreatmentGround } from "./roles.ts";
import { typeTreatmentProblem } from "./type-treatments.ts";
import { MOTION_META, REPEATABLE, inVocab, type VocabKey } from "./vocab.ts";
import { FIELD_CLASH_MASKS, TEXTURE_META, TREATMENT_META } from "./blend-meta.ts";
import type { ColorRole, Element, Scrim } from "./schema.ts";
import {
  BACKGROUND_LIMITS,
  BLEED_X_KINDS,
  BLEED_Y_KINDS,
  CONTRAST_MIN,
  LARGE_TEXT,
  MAX_MOVING_RIBBONS,
  MAX_PHOTO_USES,
  MOTION_BUDGET,
  NO_PHONE_HALF_KINDS,
  PHONE_COLUMNS_NAME_MAX,
  PHOTOS_COUNT,
  PIN_LIMITS,
  QUIET_INK_MAX,
  RESTRAINT,
  SCRIM_ALPHA,
  STACKED_MAX_LINES,
  TILT_KINDS,
  isTextBearing,
  photoUses,
  type ComposedSection,
  type CompositionContext,
} from "./guards.ts";

type Layer = NonNullable<ComposedSection["props"]["background"]>[number];
type Loose = Record<string, unknown>;
type Code = Issue["code"];

/** What a rule reports: a path below the section ("/props/…"), a code and a message. */
interface Found {
  path: string;
  code: Code;
  message: string;
}
/** What a rule repairs: the path the log line starts with, what was done, and the change; `run` returns false when it turned out to be unnecessary. */
interface Fix {
  path: string;
  what: string;
  run: () => boolean | void;
}
interface Finding {
  issue?: Found;
  fix?: Fix;
}

export interface Env {
  s: ComposedSection;
  ctx: CompositionContext;
  /** Elements and layers a repair has dropped (removed from their arrays when it ends). */
  gone: Set<object>;
}

const EL = "/props/elements";
const BG = "/props/background";

const entries = (env: Env): { e: Element; i: number }[] => env.s.props.elements.flatMap((e, i) => (env.gone.has(e) ? [] : [{ e, i }]));
const layerEntries = (env: Env): { l: Layer; k: number }[] => (env.s.props.background ?? []).flatMap((l, k) => (env.gone.has(l) ? [] : [{ l, k }]));
const loose = (e: unknown): Loose => e as Loose;
const sorted = (xs: { e: Element; i: number }[]) => [...xs].sort((a, b) => a.e.phone.order - b.e.phone.order || a.i - b.i);

const issue = (code: Code, path: string, message: string): Finding => ({ issue: { path, code, message } });
const both = (path: string, code: Code, message: string, fix: Fix): Finding => ({ issue: { path, code, message }, fix });

// ---------- geometry ----------

interface Box {
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}
const boxOf = (e: Element): Box => ({ c0: e.desk.col, c1: e.desk.col + e.desk.span - 1, r0: e.desk.row, r1: e.desk.row + (e.desk.rowSpan ?? 1) - 1 });
const within = (a: Box, b: Box) => a.c0 >= b.c0 && a.c1 <= b.c1 && a.r0 >= b.r0 && a.r1 <= b.r1;
const meets = (a: Box, b: Box) => a.c0 <= b.c1 && b.c0 <= a.c1 && a.r0 <= b.r1 && b.r0 <= a.r1;

function fieldBox(l: Extract<Layer, { kind: "field" }>, rows: number): Box {
  const c = l.cols ?? { from: 1, to: 12 };
  const r = l.rows ?? { from: 1, to: rows };
  return { c0: Math.min(c.from, c.to), c1: Math.max(c.from, c.to), r0: Math.min(r.from, r.to), r1: Math.max(r.from, r.to) };
}

function fields(env: Env): { l: Extract<Layer, { kind: "field" }>; k: number; box: Box }[] {
  return layerEntries(env).flatMap(({ l, k }) => (l.kind === "field" ? [{ l, k, box: fieldBox(l, env.s.props.rows) }] : []));
}

/** The first field layer the element lies wholly inside. */
const fieldOf = (env: Env, e: Element) => fields(env).find((f) => within(boxOf(e), f.box));

// ---------- the contrast model ----------

const hexOf = (c: Colors, r: ColorRole): string => (r === "band" ? (c.band ?? c.primary) : r === "onBand" ? (c.onBand ?? c.onPrimary) : c[r]);

function toneGround(env: Env): ColorRole {
  switch (env.s.tone ?? "default") {
    case "alt":
      return "surface";
    case "inverse":
      return "inverse";
    case "band":
      return env.ctx.colors?.band ? "band" : "primary";
    default:
      return "background";
  }
}

/** The default text role on a ground: one table for the guards and the stylesheet (roles.ts). */
const onRole = (ground: ColorRole): ColorRole => ON_ROLE[ground];

interface Painted {
  color?: ColorRole;
  fill?: ColorRole;
  /** Large text (3:1) when the element's words are all large; a fact's label is body size, so it never counts as large (see `facts` below). */
  large: boolean;
  /** The element has smaller words next to its large ones (a fact's label): over a photo the whole needs the text threshold. */
  label?: boolean;
}
/**
 * The kinds that set words; their ink and ground are checked. A sticker's line is --fs-lg bold, about 17 px on a phone,
 * under the 18.66 px that makes bold text large, so it is checked as text (CSS stays as it is: a bigger sticker is a bigger
 * sticker on every page). A non-primary action is text on the ground; a primary one has its button ground. Captions of a
 * photos element and a map's words are text on the ground too.
 */
function painted(e: Element): Painted | undefined {
  const o = loose(e);
  const paint = { ...(o.color ? { color: o.color as ColorRole } : {}), ...(o.fill ? { fill: o.fill as ColorRole } : {}) };
  switch (e.kind) {
    case "heading":
      return { ...paint, large: e.size >= LARGE_TEXT.headingSize };
    case "fact":
      return { ...paint, large: e.size >= LARGE_TEXT.factSize, label: true };
    case "sticker":
      return { ...paint, large: false };
    case "wordmark":
      return { ...paint, large: e.size >= LARGE_TEXT.headingSize };
    case "text":
    case "list":
    case "hours":
    case "contact":
    case "prices":
    case "ribbon":
    case "iconFacts":
    case "quote":
    case "steps":
    case "qa":
      return { ...paint, large: false };
    case "action":
      return e.style === "primary" ? undefined : { large: false };
    case "photos":
      return (e.captions?.length ?? 0) > 0 ? { large: false } : undefined;
    case "map":
      // The colour role paints the drawing (pin, ring, frame) and the street names on it, so it is checked as text; the address under it keeps the ground's own colour.
      return { ...paint, large: false };
    default:
      return undefined;
  }
}
/** Over a photo the same colour carries a fact's value and its label, so the label's threshold is the one. */
const minOf = (p: Painted) => (p.large && !p.label ? CONTRAST_MIN.large : CONTRAST_MIN.text);
const ratio = (x: number) => x.toFixed(2);

/** Elements that sit on a ground of their own, not on the tone or the field behind them: a sticker, and the fact objects and heading treatments that paint one. */
const hasOwnGround = (env: Env, e: Element): boolean =>
  e.kind === "sticker" ||
  (e.kind === "fact" && factObjectGround(e.treatment, env.s.tone ?? "default") !== undefined) ||
  (e.kind === "heading" && typeTreatmentGround(e.treatment, env.s.tone ?? "default") !== undefined);

/** The scrim holders: a photo layer (over the section's texts) or an image element with a scrim (over the texts overlapping it). */
interface Holder {
  /** The image element, for an element holder. */
  el?: Element;
  /** Path of the holder below the section ("/props/background/0", "/props/elements/2"). */
  path: string;
  scrim: Scrim;
  /** The holder itself (the photo layer or the image element), for a repair that edits it. */
  ref: object;
  /** Its photo treatment, when it has one: it changes what the scrim sits on (TREATMENT_META). */
  treatment?: string;
  layer: boolean;
  texts: { e: Element; p: Painted }[];
}

function holders(env: Env): Holder[] {
  const out: Holder[] = [];
  const texts = entries(env).flatMap(({ e }) => {
    const p = painted(e);
    return p && !p.fill && !hasOwnGround(env, e) ? [{ e, p }] : [];
  });
  for (const { l, k } of layerEntries(env)) {
    if (l.kind !== "photo") continue;
    out.push({ path: `${BG}/${k}`, scrim: l.scrim, ref: l, treatment: l.treatment, layer: true, texts: texts.filter((t) => !fieldOf(env, t.e)) });
  }
  for (const { e, i } of entries(env)) {
    if (e.kind !== "image" || !e.scrim) continue;
    out.push({ el: e, path: `${EL}/${i}`, scrim: e.scrim, ref: e, treatment: e.treatment, layer: false, texts: texts.filter((t) => meets(boxOf(t.e), boxOf(e))) });
  }
  return out;
}

/**
 * The worst contrast of `fg` against the scrim over a black and a white pixel, with the photo treatment's worst case
 * (TREATMENT_META): a darkening treatment caps the white pixel at grey 1 − factor; a lightening one lifts both pixels,
 * after the scrim, `factor` of the way to white (an upper bound on any veil or filter it adds).
 */
function scrimContrast(colors: Colors, scrim: Scrim, strength: number, fg: string, treatment?: string): number {
  const a = SCRIM_ALPHA[strength - 1]!;
  const s = hexOf(colors, scrim.role);
  const meta = treatment !== undefined ? (TREATMENT_META as Readonly<Record<string, { shift: string; factor: number } | undefined>>)[treatment] : undefined;
  const lift = (c: string) => (meta?.shift === "lighten" ? mix("#ffffff", c, meta.factor) : c);
  const white = meta?.shift === "darken" ? mix("#ffffff", "#000000", 1 - meta.factor) : "#ffffff";
  return Math.min(contrast(fg, lift(mix(s, "#000000", a))), contrast(fg, lift(mix(s, white, a))));
}

function fgOver(env: Env, colors: Colors, p: Painted): string {
  return hexOf(colors, p.color ?? onRole(toneGround(env)));
}

// ---------- G1 background layers, G2 fields ----------

function g1(env: Env): Finding[] {
  const out: Finding[] = [];
  const all = env.s.props.background ?? [];
  const live = layerEntries(env);
  const drop = (l: Layer, k: number, what: string): Fix => ({ path: `${BG}/${k}`, what, run: () => void env.gone.add(l) });
  const seen = { photo: 0, drawing: 0 };
  for (const { l, k } of live) {
    if (l.kind === "photo" && ++seen.photo > BACKGROUND_LIMITS.photos) out.push(both(`${BG}/${k}`, "structure", `composed: at most one photo layer (has ${live.filter((x) => x.l.kind === "photo").length})`, drop(l, k, "extra photo layer dropped")));
    if (l.kind === "drawing" && ++seen.drawing > BACKGROUND_LIMITS.drawings) out.push(both(`${BG}/${k}`, "structure", `composed: at most one drawing layer (has ${live.filter((x) => x.l.kind === "drawing").length})`, drop(l, k, "extra drawing layer dropped")));
  }
  if (all.length > BACKGROUND_LIMITS.layers) {
    out.push(
      both(`${BG}/${BACKGROUND_LIMITS.layers}`, "structure", `composed: at most ${BACKGROUND_LIMITS.layers} background layers (has ${all.length})`, {
        path: `${BG}/${BACKGROUND_LIMITS.layers}`,
        what: "extra layers dropped",
        run: () => {
          const rest = layerEntries(env);
          if (rest.length <= BACKGROUND_LIMITS.layers) return false;
          for (const { l } of rest.slice(BACKGROUND_LIMITS.layers)) env.gone.add(l);
        },
      }),
    );
  }
  return out;
}

function g2(env: Env): Finding[] {
  const out: Finding[] = [];
  const fs = fields(env);
  if (fs.length === 0) return out;
  const els = entries(env);
  for (const { e, i } of els) {
    if (!isTextBearing(e) || loose(e).fill) continue;
    const f = fs.find((x) => meets(boxOf(e), x.box) && !within(boxOf(e), x.box));
    if (f) out.push(issue("structure", `${EL}/${i}/desk`, `composed: ${e.id} straddles field layer ${f.k}; text sits wholly inside or outside a field`));
  }
  const order = sorted(els);
  for (const f of fs) {
    const pos = order.flatMap((o, n) => (within(boxOf(o.e), f.box) ? [n] : []));
    if (pos.length > 1 && pos[pos.length - 1]! - pos[0]! + 1 !== pos.length) out.push(issue("structure", `${BG}/${f.k}`, `composed: field layer ${f.k}: the elements inside it are not contiguous in reading order`));
  }
  return out;
}

// ---------- G3 contrast over a photo, G9 colours ----------

function g3(env: Env): Finding[] {
  const colors = env.ctx.colors;
  if (!colors) return [];
  const out: Finding[] = [];
  for (const h of holders(env)) {
    if (h.texts.length === 0) continue;
    const holds = (n: number, treatment: string | undefined) => h.texts.every((t) => scrimContrast(colors, h.scrim, n, fgOver(env, colors, t.p), treatment) >= minOf(t.p));
    // The scrim goes up first; when even the strongest one can't hold the treatment's worst case, the treatment goes (and the scrim the plain photo needs stays).
    const need = [1, 2, 3, 4].find((n) => holds(n, h.treatment));
    const plain = h.treatment !== undefined && h.treatment !== "none" ? [1, 2, 3, 4].find((n) => holds(n, undefined)) : undefined;
    const fix: Fix | undefined =
      need !== undefined
        ? { path: `${h.path}/scrim/strength`, what: `scrim raised to ${need}`, run: () => void (h.scrim.strength = need) }
        : plain !== undefined
          ? {
              path: `${h.path}/treatment`,
              what: `treatment dropped (its worst case fails contrast at every scrim); scrim ${plain}`,
              run: () => {
                delete loose(h.ref).treatment;
                h.scrim.strength = Math.max(h.scrim.strength, plain) as typeof h.scrim.strength;
              },
            }
          : !h.layer
            ? { path: `${h.path}/scrim`, what: "scrim dropped; the solid panel applies", run: () => void delete loose(h.el).scrim }
            : undefined;
    let first = true;
    for (const { e, p } of h.texts) {
      const got = scrimContrast(colors, h.scrim, h.scrim.strength, fgOver(env, colors, p), h.treatment);
      if (got >= minOf(p)) continue;
      const f = issue("design", `${h.path}/scrim`, `composed: ${e.id} over the photo fails contrast (${ratio(got)} < ${minOf(p)})`);
      if (first && fix) f.fix = fix;
      first = false;
      out.push(f);
    }
    // On phones a "band" photo sits above the content: text coloured for the photo then sits on the section's own ground.
    if (h.layer && ((loose(h.ref).phone as string | undefined) ?? "band") === "band") {
      const ground = hexOf(colors, toneGround(env));
      const coverHolds = h.texts.every((t) => scrimContrast(colors, h.scrim, h.scrim.strength, fgOver(env, colors, t.p), h.treatment) >= minOf(t.p));
      const toCover: Fix | undefined = coverHolds ? { path: `${h.path}/phone`, what: "photo kept behind the content on phones (cover)", run: () => void (loose(h.ref).phone = "cover") } : undefined;
      let firstPhone = true;
      for (const { e, p } of h.texts) {
        if (!p.color || e.phone.hidden) continue; // the tone's own text colour reads on its own ground
        const got = contrast(fgOver(env, colors, p), ground);
        if (got >= minOf(p)) continue;
        const msg = `composed: ${e.id} is coloured for the photo but sits on the section's ground on phones (band photo) (${ratio(got)} < ${minOf(p)})`;
        out.push(firstPhone && toCover ? both(`${h.path}/phone`, "design", msg, toCover) : issue("design", `${h.path}/phone`, msg));
        firstPhone = false;
      }
    }
  }
  return out;
}

/** One ink on one ground. `via` is what a repair would change: the own colour, the own fill, or the field behind. */
interface Pair {
  fg: ColorRole;
  ground: ColorRole;
  min: number;
  via: "color" | "fill" | "field";
  label: boolean;
  /** A prices note (muted text), not the element's own words. */
  note?: boolean;
}

/**
 * The inks an element's words are set in and the grounds they sit on, with the threshold of each. A pair whose ink and
 * ground are both the page's own defaults is not listed (the tone's own pair is the design's business, not a guard's).
 * A fact has a value (large from size 4) and a label (body size, 4.5:1) in the same colour; numeral and stamp take the
 * element's colour into the object (composed-v2.css), ticket, seal and tag keep their own ink on their own ground (the
 * colour is checked against that ground all the same, so an unreadable choice never reaches a site), a plate's label sits
 * outside it.
 */
function pairsOf(env: Env, e: Element, p: Painted, useColor: boolean): Pair[] {
  const color = useColor ? p.color : undefined;
  const fld = fieldOf(env, e);
  const outer: { ground: ColorRole; src: "fill" | "field" | "tone" | "own" } = fld ? { ground: fld.l.role, src: "field" } : { ground: toneGround(env), src: "tone" };
  const out: Pair[] = [];
  const add = (ground: ColorRole, src: "fill" | "field" | "tone" | "own", colorApplies: boolean, min: number, label: boolean) => {
    const via = colorApplies && color ? "color" : src === "fill" || src === "field" ? src : undefined;
    if (via) out.push({ fg: colorApplies && color ? color : onRole(ground), ground, min, via, label });
  };
  if (e.kind === "fact") {
    const t = e.treatment as string;
    const own = factObjectGround(t, env.s.tone ?? "default");
    const valueMin = p.large ? CONTRAST_MIN.large : CONTRAST_MIN.text;
    if (t === "plate") {
      if (p.fill) add(p.fill, "fill", false, valueMin, false);
      add(outer.ground, outer.src, true, CONTRAST_MIN.text, true);
    } else {
      const g = p.fill ?? own ?? outer.ground;
      const src = p.fill ? "fill" : own ? "own" : outer.src;
      add(g, src, true, valueMin, false);
      if (t === "numeral") add(outer.ground, outer.src, true, CONTRAST_MIN.text, true);
      else add(g, src, true, CONTRAST_MIN.text, true);
    }
  } else if (e.kind === "sticker") {
    add(p.fill ?? "primary", p.fill ? "fill" : "own", true, minOf(p), false);
  } else if (e.kind === "heading" && typeTreatmentGround(e.treatment, env.s.tone ?? "default")) {
    // A treatment that paints its own ground (fascia-lettering, marker-highlight) keeps its own ink on it, as a fact object does.
    const own = typeTreatmentGround(e.treatment, env.s.tone ?? "default")!;
    add(p.fill ?? own, p.fill ? "fill" : "own", true, minOf(p), false);
  } else {
    add(p.fill ?? outer.ground, p.fill ? "fill" : outer.src, true, minOf(p), false);
  }
  // A prices note in rows-like styles is `.muted`: muted on default and alt tones, the tone's own ink on inverse and band
  // (base.css), whatever the element's colour; the field or fill behind it does not change that.
  if (e.kind === "prices" && e.style !== "board" && e.style !== "plates" && e.style !== "tags" && e.items.some((it) => it.note) && (p.fill || fld)) {
    const tone = env.s.tone ?? "default";
    const ink: ColorRole = tone === "inverse" || tone === "band" ? onRole(toneGround(env)) : "muted";
    out.push({ fg: ink, ground: p.fill ?? fld!.l.role, min: CONTRAST_MIN.text, via: p.fill ? "fill" : "field", label: false, note: true });
  }
  return out.filter((x) => contrast(hexOf(env.ctx.colors!, x.fg), hexOf(env.ctx.colors!, x.ground)) < x.min);
}

function g9(env: Env): Finding[] {
  const colors = env.ctx.colors;
  if (!colors) return [];
  const out: Finding[] = [];
  const over = new Set(holders(env).flatMap((h) => h.texts.map((t) => t.e)));
  const drop = (o: Loose, key: "color" | "fill", i: number): Fix => ({ path: `${EL}/${i}/${key}`, what: `${key} dropped`, run: () => void delete o[key] });
  for (const { e, i } of entries(env)) {
    const p = painted(e);
    if (!p || over.has(e)) continue;
    const o = loose(e);
    const fails = pairsOf(env, e, p, true);
    if (fails.length === 0) continue;
    const msg = (x: Pair) => `composed: ${e.id}: ${x.fg} on ${x.ground}${x.label ? " (label)" : ""}${x.note ? " (note)" : ""} fails contrast (${ratio(contrast(hexOf(colors, x.fg), hexOf(colors, x.ground)))} < ${x.min})`;
    const colorFail = fails.find((x) => x.via === "color");
    if (colorFail) out.push(both(`${EL}/${i}/color`, "design", msg(colorFail), drop(o, "color", i)));
    // What still fails without the own colour is the fill's or the field's.
    const rest = p.color ? pairsOf(env, e, p, false)[0] : fails[0];
    if (!rest) continue;
    let fix: Fix;
    let path: string;
    if (rest.via === "fill") {
      path = `${EL}/${i}/fill`;
      fix = drop(o, "fill", i);
    } else {
      const f = fieldOf(env, e)!;
      path = `${BG}/${f.k}`;
      fix = { path, what: "field layer dropped", run: () => (env.gone.has(f.l) ? false : void env.gone.add(f.l)) };
    }
    out.push(colorFail ? { fix } : both(path, "design", msg(rest), fix));
  }
  // A background drawing is quiet: its ink close to the ground.
  const ground = toneGround(env);
  if (!layerEntries(env).some(({ l }) => l.kind === "photo")) {
    for (const { l, k } of layerEntries(env)) {
      if (l.kind !== "drawing" || !l.color) continue;
      const got = contrast(hexOf(colors, l.color), hexOf(colors, ground));
      if (got <= QUIET_INK_MAX) continue;
      const border = contrast(hexOf(colors, "border"), hexOf(colors, ground)) <= QUIET_INK_MAX && l.color !== "border";
      out.push(
        both(`${BG}/${k}/color`, "design", `composed: drawing layer ${k} is not quiet (${ratio(got)} > ${QUIET_INK_MAX} against ${ground})`, border
          ? { path: `${BG}/${k}/color`, what: "ink set to border", run: () => void (l.color = "border") }
          : { path: `${BG}/${k}`, what: "loud drawing layer dropped", run: () => void env.gone.add(l) }),
      );
    }
  }
  return out;
}

// ---------- G4 header over, G5 top edge, G6 pin, G7 motion ----------

const isFirst = (env: Env) => env.ctx.page !== undefined && env.ctx.page.index === 0;

function g4(env: Env): Finding[] {
  if (!env.s.props.headerOver) return [];
  const fix: Fix = { path: "/props/headerOver", what: "headerOver dropped", run: () => void delete env.s.props.headerOver };
  const out: Finding[] = [];
  if (env.ctx.page && env.ctx.page.index > 0) out.push(both("/props/headerOver", "structure", "composed: headerOver only on the page's first section", fix));
  if (!layerEntries(env).some(({ l }) => l.kind === "field" || l.kind === "photo")) out.push(both("/props/headerOver", "structure", "composed: headerOver needs a field or photo layer", fix));
  return out;
}

const prevOf = (ctx: CompositionContext): Section | undefined => ctx.prev ?? (ctx.page && ctx.page.index > 0 ? ctx.page.sections[ctx.page.index - 1] : undefined);

function g5(env: Env): Finding[] {
  const top = env.s.props.top;
  if (!top) return [];
  const out: Finding[] = [];
  const dropTop: Fix = { path: "/props/top", what: "top edge dropped", run: () => void delete env.s.props.top };
  if (isFirst(env)) out.push(both("/props/top", "structure", "composed: a top edge can't be on the page's first section", dropTop));
  const prev = prevOf(env.ctx);
  if (prev) {
    const divider = prev.type === "composed" ? prev.props.surface?.divider : undefined;
    if (divider !== undefined && divider !== "none") out.push(both("/props/top", "structure", "composed: the previous section already has a divider", dropTop));
    else if ((top.rise ?? 0) > 0 && (prev.tone ?? "default") === (env.s.tone ?? "default")) {
      out.push(both("/props/top/rise", "structure", "composed: rise needs a different ground from the previous section", { path: "/props/top/rise", what: "rise set to 0", run: () => void (top.rise = 0) }));
    }
  }
  if (top.edge === "drawing" && top.drawing === undefined) out.push(issue("structure", "/props/top/drawing", 'composed: top edge "drawing" needs a drawing'));
  if (top.edge !== "drawing" && top.drawing !== undefined) out.push(issue("structure", "/props/top/drawing", 'composed: top.drawing only with edge "drawing"'));
  return out;
}

function g6(env: Env): Finding[] {
  const pin = env.s.props.pin;
  if (!pin) return [];
  const pinBox: Box = { c0: pin.col, c1: pin.col + pin.span - 1, r0: 1, r1: env.s.props.rows };
  const els = entries(env);
  const msgs: string[] = [];
  const inside = els.filter(({ e }) => boxOf(e).c0 >= pinBox.c0 && boxOf(e).c1 <= pinBox.c1);
  for (const { e } of els) {
    const b = boxOf(e);
    if (b.c0 <= pinBox.c1 && pinBox.c0 <= b.c1 && !(b.c0 >= pinBox.c0 && b.c1 <= pinBox.c1)) msgs.push(`composed: ${e.id} crosses the pinned columns`);
  }
  if (inside.length > PIN_LIMITS.maxElements) msgs.push(`composed: at most ${PIN_LIMITS.maxElements} pinned elements (has ${inside.length})`);
  const order = sorted(els);
  const pos = order.flatMap((o, n) => (inside.some((x) => x.e === o.e) ? [n] : []));
  if (pos.length > 1 && pos[pos.length - 1]! - pos[0]! + 1 !== pos.length) msgs.push("composed: pinned elements are not contiguous in reading order");
  for (const { e } of inside) {
    if (e.kind !== "image") continue;
    const m = /^(\d+):(\d+)$/.exec(e.ratio);
    if (m && Number(m[2]) / Number(m[1]) > 5 / 4) msgs.push(`composed: ${e.id} in the pin is taller than 4:5`);
  }
  if (env.s.props.rows < PIN_LIMITS.minRows) msgs.push(`composed: a pinned section needs at least ${PIN_LIMITS.minRows} rows`);
  if (inside.length > 0) {
    const pinned = Math.max(...inside.map((x) => boxOf(x.e).r1)) - Math.min(...inside.map((x) => boxOf(x.e).r0)) + 1;
    const outside = els.filter((x) => !inside.includes(x));
    if (!(outside.length > 0 && Math.max(...outside.map((x) => boxOf(x.e).r1 - boxOf(x.e).r0 + 1)) > pinned)) msgs.push("composed: nothing outside the pin spans more rows than it");
  }
  const fix: Fix = { path: "/props/pin", what: "pin dropped", run: () => void delete env.s.props.pin };
  return msgs.map((m) => both("/props/pin", "structure", m, fix));
}

const hasMotion = (s: Section) => s.type === "composed" && s.props.motion !== undefined;
const movingRibbons = (s: Section) => (s.type === "composed" ? s.props.elements.filter((e) => e.kind === "ribbon" && (e.move === "drift" || e.move === "loop")).length : 0);

function g7(env: Env): Finding[] {
  const out: Finding[] = [];
  const level = env.ctx.motionLevel;
  const page = env.ctx.page;
  const motion = env.s.props.motion;
  if (motion !== undefined && inVocab("MOTIONS", motion)) {
    const dropMotion: Fix = { path: "/props/motion", what: "motion dropped", run: () => void delete env.s.props.motion };
    const meta = MOTION_META[motion as keyof typeof MOTION_META];
    if (level === "still") out.push(both("/props/motion", "structure", `composed: motion "${motion}" isn't allowed at motion level still`, dropMotion));
    else if (level) {
      if (meta && meta.minLevel === "lively" && level !== "lively") out.push(both("/props/motion", "structure", `composed: motion "${motion}" needs motion level lively (is ${level})`, dropMotion));
      if (page) {
        const earlier = page.sections.slice(0, page.index).filter(hasMotion).length;
        if (earlier + 1 > MOTION_BUDGET[level]) out.push(both("/props/motion", "structure", `composed: at most ${MOTION_BUDGET[level]} sections with motion per page at motion level ${level} (${earlier} earlier on the page)`, dropMotion));
      }
    }
    if (page && page.index === 0 && meta && !meta.safeAtLoad) out.push(both("/props/motion", "structure", `composed: the page's first section takes only motion that is safe at load ("${motion}" isn't)`, dropMotion));
  }
  let ribbons = page ? page.sections.slice(0, page.index).reduce((n, s) => n + movingRibbons(s), 0) : 0;
  for (const { e, i } of entries(env)) {
    if (e.kind !== "ribbon" || (e.move !== "drift" && e.move !== "loop")) continue;
    const dropMove: Fix = { path: `${EL}/${i}/move`, what: "move dropped", run: () => void delete (e as Loose).move };
    ribbons++;
    if (level === "still") out.push(both(`${EL}/${i}/move`, "structure", `composed: ${e.id} moves but the motion level is still`, dropMove));
    else if (level && e.move === "loop" && level !== "lively") out.push(both(`${EL}/${i}/move`, "structure", `composed: ${e.id}: loop needs motion level lively (is ${level})`, dropMove));
    if (ribbons > MAX_MOVING_RIBBONS) out.push(both(`${EL}/${i}/move`, "structure", "composed: at most one moving ribbon per page", dropMove));
  }
  return out;
}

// ---------- G8 vocabulary names ----------

const VOCAB_PREFIX: Partial<Record<VocabKey, string>> = {
  MASKS: KIND_PREFIX.mask,
  IMAGE_TREATMENTS: KIND_PREFIX.treatment,
  TEXTURES: KIND_PREFIX.texture,
  EDGES: KIND_PREFIX.divider,
  FACT_OBJECTS: KIND_PREFIX.factObject,
  TYPE_TREATMENTS: KIND_PREFIX.typeTreatment,
  MOTIONS: KIND_PREFIX.motion,
};
/** Names that are the plain default, never an asset to approve. */
const NEUTRAL = new Set(["none", "numeral", "straight"]);

function g8(env: Env): Finding[] {
  const out: Finding[] = [];
  const approved = env.ctx.approved;
  const check = (path: string, field: string, vocab: VocabKey, name: unknown, fix: Fix) => {
    if (typeof name !== "string") return;
    if (!inVocab(vocab, name)) return void out.push(both(path, "reference", `composed: unknown ${field} "${name}" (not in ${vocab})`, fix));
    if (!approved || NEUTRAL.has(name)) return;
    const prefix = VOCAB_PREFIX[vocab];
    const id = vocab === "DRAWINGS" ? name : prefix ? `${prefix}/${name}` : undefined;
    if (id && !approved.has(id)) out.push(both(path, "reference", `composed: ${id} is not an approved asset`, fix));
  };
  const setTo = (o: Loose, key: string, value: string, path: string): Fix => ({ path, what: `${key} set to ${value}`, run: () => void (o[key] = value) });
  const del = (o: Loose, key: string, path: string): Fix => ({ path, what: `${key} dropped`, run: () => void delete o[key] });
  const p = env.s.props;
  for (const { e, i } of entries(env)) {
    const o = loose(e);
    const at = `${EL}/${i}`;
    if (e.kind === "image" || e.kind === "photos") {
      check(`${at}/mask`, "mask", "MASKS", e.mask, setTo(o, "mask", "none", `${at}/mask`));
      check(`${at}/treatment`, "treatment", "IMAGE_TREATMENTS", e.treatment, setTo(o, "treatment", "none", `${at}/treatment`));
    }
    if (e.kind === "heading") check(`${at}/treatment`, "treatment", "TYPE_TREATMENTS", e.treatment, setTo(o, "treatment", "none", `${at}/treatment`));
    if (e.kind === "fact") check(`${at}/treatment`, "treatment", "FACT_OBJECTS", e.treatment, setTo(o, "treatment", "numeral", `${at}/treatment`));
    if (e.kind === "iconFacts") {
      e.items.forEach((item, k) => {
        const drop: Fix = {
          path: `${at}/items/${k}`,
          what: "item dropped",
          run: () => {
            o.items = (o.items as unknown[]).filter((x) => x !== item);
            if ((o.items as unknown[]).length === 0) env.gone.add(e);
          },
        };
        check(`${at}/items/${k}/fact`, "fact", "PRACTICAL_FACTS", item.fact, drop);
      });
    }
    if (e.kind === "decor") check(`${at}/drawing`, "drawing", "DRAWINGS", e.drawing, { path: at, what: "drawing element dropped", run: () => void env.gone.add(e) });
    if (e.kind === "list") check(`${at}/drawing`, "drawing", "DRAWINGS", e.drawing, del(o, "drawing", `${at}/drawing`));
    if (e.kind === "ribbon") check(`${at}/separator`, "drawing", "DRAWINGS", e.separator, del(o, "separator", `${at}/separator`));
  }
  check("/props/surface/texture", "texture", "TEXTURES", p.surface?.texture, setTo(p.surface as Loose, "texture", "none", "/props/surface/texture"));
  if (p.top) {
    const dropTop: Fix = { path: "/props/top", what: "top edge dropped", run: () => void delete p.top };
    check("/props/top/edge", "edge", "EDGES", p.top.edge, dropTop);
    check("/props/top/drawing", "drawing", "DRAWINGS", p.top.drawing, dropTop);
  }
  check("/props/motion", "motion", "MOTIONS", p.motion, { path: "/props/motion", what: "motion dropped", run: () => void delete p.motion });
  for (const { l, k } of layerEntries(env)) {
    if (l.kind === "photo") check(`${BG}/${k}/treatment`, "treatment", "IMAGE_TREATMENTS", l.treatment, setTo(l as Loose, "treatment", "none", `${BG}/${k}/treatment`));
    if (l.kind === "drawing") check(`${BG}/${k}/drawing`, "drawing", "DRAWINGS", l.drawing, { path: `${BG}/${k}`, what: "drawing layer dropped", run: () => void env.gone.add(l) });
  }
  return out;
}

// ---------- G10–G12 tilt and bleed, G14 links, G15–G17 lists and prices ----------

function g10to12(env: Env): Finding[] {
  const out: Finding[] = [];
  for (const { e, i } of entries(env)) {
    const d = e.desk as Loose;
    const at = `${EL}/${i}`;
    const drop = (key: string, path: string): Fix => ({ path, what: `${key} dropped`, run: () => void delete d[key] });
    // G10
    if (e.desk.tilt) {
      const numeral = e.kind === "fact" && e.treatment === "numeral";
      if (!TILT_KINDS.has(e.kind) || numeral) out.push(both(`${at}/desk/tilt`, "structure", `composed: ${e.id} (${numeral ? "fact numeral" : e.kind}) can't tilt`, drop("tilt", `${at}/desk/tilt`)));
    }
    // G11
    if (e.desk.bleedX) {
      const f = drop("bleedX", `${at}/desk/bleedX`);
      const b = boxOf(e);
      if (!BLEED_X_KINDS.has(e.kind)) out.push(both(`${at}/desk/bleedX`, "structure", `composed: ${e.id} (${e.kind}) can't bleed`, f));
      else if (e.desk.bleedX !== "end" && b.c0 !== 1) out.push(both(`${at}/desk/bleedX`, "structure", `composed: ${e.id} bleeds to the start but doesn't touch column 1`, f));
      else if (e.desk.bleedX !== "start" && b.c1 !== 12) out.push(both(`${at}/desk/bleedX`, "structure", `composed: ${e.id} bleeds to the end but doesn't touch column 12`, f));
    }
    if (e.desk.bleedY && !BLEED_Y_KINDS.has(e.kind)) out.push(both(`${at}/desk/bleedY`, "structure", `composed: ${e.id} (${e.kind}) can't bleed past the section`, drop("bleedY", `${at}/desk/bleedY`)));
    // G12
    const fix: Fix = { path: `${at}/phone/span`, what: "phone span set to full", run: () => void ((e.phone as Loose).span = "full") };
    if (e.phone.span === "bleed" && !BLEED_X_KINDS.has(e.kind)) out.push(both(`${at}/phone/span`, "structure", `composed: ${e.id} (${e.kind}) can't bleed on phones`, fix));
    if (e.phone.span === "half" && NO_PHONE_HALF_KINDS.has(e.kind)) out.push(both(`${at}/phone/span`, "structure", `composed: ${e.id} (${e.kind}) can't be half width on phones`, fix));
  }
  return out;
}

const LINK_NEEDS = {
  call: ["phone", (b: NonNullable<CompositionContext["business"]>) => b.phone],
  directions: ["address", (b: NonNullable<CompositionContext["business"]>) => b.address],
  booking: ["bookingUrl", (b: NonNullable<CompositionContext["business"]>) => b.bookingUrl],
  email: ["email", (b: NonNullable<CompositionContext["business"]>) => b.email],
} as const;

/** G14: a fact's link target resolves; every call (an action or a fact's call link) counts toward one per section. */
function g14(env: Env): Finding[] {
  const out: Finding[] = [];
  const business = env.ctx.business;
  const calls: { e: Element; i: number; path: string }[] = [];
  for (const { e, i } of entries(env)) {
    if (e.kind === "action" && e.action === "call") calls.push({ e, i, path: `${EL}/${i}/action` });
    if (e.kind !== "fact" || !e.link) continue;
    const o = loose(e);
    const dropLink: Fix = { path: `${EL}/${i}/link`, what: "link dropped", run: () => void delete o.link };
    if ("action" in e.link) {
      if (e.link.action === "call") calls.push({ e, i, path: `${EL}/${i}/link` });
      const need = LINK_NEEDS[e.link.action];
      if (business && !need[1](business)) out.push(both(`${EL}/${i}/link`, "reference", `composed: ${e.id} links to ${e.link.action} but the business has no ${need[0]}`, dropLink));
    }
  }
  const second = calls[1];
  if (second) {
    const hasAction = calls.some((c) => c.e.kind === "action");
    const dropFact = (c: (typeof calls)[number]): Fix => ({ path: c.path, what: "link dropped", run: () => void delete loose(c.e).link });
    const factCalls = calls.filter((c) => c.e.kind === "fact");
    const f: Finding = issue("banned", second.path, "composed: at most one call action per section");
    // With a call action the fact's call links go; with only facts the first one stays.
    const drops = hasAction ? factCalls : factCalls.slice(1);
    if (drops.length > 0) {
      f.fix = dropFact(drops[0]!);
      out.push(f, ...drops.slice(1).map((c): Finding => ({ fix: dropFact(c) })));
    } else out.push(f);
  }
  return out;
}

function g15to17(env: Env): Finding[] {
  const out: Finding[] = [];
  for (const { e, i } of entries(env)) {
    const o = loose(e);
    const at = `${EL}/${i}`;
    if ((e.kind === "fact" && e.treatment !== "plate") || (e.kind === "prices" && e.style !== "plates")) {
      if (o.plateCode === true) out.push(both(`${at}/plateCode`, "structure", `composed: ${e.id}: plateCode only on a plate`, { path: `${at}/plateCode`, what: "plateCode dropped", run: () => void delete o.plateCode }));
    }
    if (e.kind === "list") {
      if (e.marker === "line") {
        e.items.forEach((item, k) => {
          if (typeof item === "string") out.push(issue("structure", `${at}/items/${k}`, `composed: ${e.id}: a timeline (marker line) needs a lead on every item`));
        });
      }
      e.items.forEach((item, k) => {
        if (typeof item !== "string" && NUMBERED_LABEL.test(item.lead)) out.push(issue("banned", `${at}/items/${k}/lead`, `numbered label: "${item.lead}"`));
      });
      if (e.marker === "drawing" && e.drawing === undefined) out.push(both(`${at}/marker`, "structure", `composed: ${e.id}: marker "drawing" needs a drawing`, { path: `${at}/marker`, what: "marker dropped", run: () => void delete o.marker }));
      if (e.marker !== "drawing" && e.drawing !== undefined) out.push(both(`${at}/drawing`, "structure", `composed: ${e.id}: a drawing only with marker "drawing"`, { path: `${at}/drawing`, what: "drawing dropped", run: () => void delete o.drawing }));
    }
    if (e.kind === "steps") {
      e.items.forEach((x, k) => {
        if (NUMBERED_LABEL.test(x.title)) out.push(issue("banned", `${at}/items/${k}/title`, `numbered label: "${x.title}"`));
      });
    }
    if (e.kind === "qa") {
      e.items.forEach((x, k) => {
        if (NUMBERED_LABEL.test(x.question)) out.push(issue("banned", `${at}/items/${k}/question`, `numbered label: "${x.question}"`));
      });
    }
    if (e.kind === "prices" && e.phoneColumns === 2 && (!["plates", "tags"].includes(e.style) || e.items.some((x) => x.name.length > PHONE_COLUMNS_NAME_MAX))) {
      out.push(both(`${at}/phoneColumns`, "structure", `composed: ${e.id} can't set 2 columns on phones (only plates and tags with names up to ${PHONE_COLUMNS_NAME_MAX} characters)`, { path: `${at}/phoneColumns`, what: "phoneColumns set to 1", run: () => void (o.phoneColumns = 1) }));
    }
  }
  return out;
}

// ---------- G18–G21 decor, treatments, photos ----------

function g18to21(env: Env): Finding[] {
  const out: Finding[] = [];
  const fs = fields(env);
  const hasPhotoLayer = layerEntries(env).some(({ l }) => l.kind === "photo");
  const els = entries(env);
  for (const { e, i } of els) {
    const o = loose(e);
    const at = `${EL}/${i}`;
    if (e.kind === "decor") {
      if (e.size !== undefined && e.fit !== "fixed") out.push(issue("structure", `${at}/size`, `composed: ${e.id}: size only with fit "fixed"`));
      if (e.fit === "fixed" && e.size === undefined) out.push(issue("structure", `${at}/size`, `composed: ${e.id}: fit "fixed" needs a size`));
      if (e.repeat !== undefined && !(e.drawing !== undefined && e.motif === undefined && e.svg === undefined && (REPEATABLE as readonly string[]).includes(e.drawing))) {
        out.push(both(`${at}/repeat`, "banned", `composed: ${e.id}: repeat only with a repeatable drawing`, { path: `${at}/repeat`, what: "repeat dropped", run: () => void delete o.repeat }));
      }
    }
    if (e.kind === "heading" && e.treatment) {
      const drop: Fix = { path: `${at}/treatment`, what: "treatment dropped", run: () => void delete o.treatment };
      if (e.treatment === "stacked") {
        const lines = e.text.split(/\s+/).filter(Boolean).length;
        if (lines > STACKED_MAX_LINES) out.push(both(`${at}/treatment`, "structure", `composed: ${e.id}: stacked takes at most ${STACKED_MAX_LINES} lines (has ${lines})`, drop));
      }
      if (e.treatment === "knockout") {
        const b = boxOf(e);
        const over = fs.some((f) => within(b, f.box)) || hasPhotoLayer || els.some((x) => x.e.kind === "image" && meets(b, boxOf(x.e)));
        if (!over) out.push(both(`${at}/treatment`, "structure", `composed: ${e.id}: knockout only over a photo or a field`, drop));
      }
      const problem = typeTreatmentProblem(e);
      if (problem) out.push(both(`${at}/treatment`, "structure", `composed: ${e.id}: ${problem}`, drop));
    }
    if (e.kind === "photos") {
      const [min, max] = PHOTOS_COUNT[e.arrangement];
      const n = e.images.length;
      if (n < min || n > max) out.push(issue("structure", `${at}/images`, `composed: ${e.id}: ${e.arrangement} takes ${min === max ? `exactly ${min}` : `${min}–${max}`} photos (has ${n})`));
      const origins = env.ctx.images;
      if (e.arrangement === "before-after" && origins && e.images.some((id) => origins.get(id)?.origin === "generated")) out.push(issue("structure", `${at}/images`, `composed: ${e.id}: before-after only with the client's own photos`));
    }
  }
  return out;
}

/** G1 and G21: every image exists and is used at most twice on the page (layers first, then the elements in order). */
function photoRefs(env: Env): Finding[] {
  const out: Finding[] = [];
  const { ctx } = env;
  const earlier = ctx.page ? photoUses(ctx.page.sections.slice(0, ctx.page.index)) : new Map<string, number>();
  const used = new Map<string, number>();
  const use = (id: string, path: string) => {
    if (ctx.imageIds && !ctx.imageIds.has(id)) out.push(issue("reference", path, `unknown image ${id}`));
    const n = (used.get(id) ?? 0) + 1;
    used.set(id, n);
    if ((earlier.get(id) ?? 0) + n > MAX_PHOTO_USES) out.push(issue("structure", path, `composed: ${id} is used more than ${MAX_PHOTO_USES} times on the page`));
  };
  for (const { l, k } of layerEntries(env)) if (l.kind === "photo") use(l.image, `${BG}/${k}/image`);
  for (const { e, i } of entries(env)) {
    if (e.kind === "image") use(e.image, `${EL}/${i}/image`);
    if (e.kind === "photos") e.images.forEach((id, k) => use(id, `${EL}/${i}/images/${k}`));
  }
  return out;
}

// ---------- G22 restraint ----------

function g22(env: Env): Finding[] {
  const out: Finding[] = [];
  const page = env.ctx.page;
  const before = page ? page.sections.slice(0, page.index) : [];
  const count = (kind: Element["kind"]) => before.reduce((n, s) => n + (s.type === "composed" ? s.props.elements.filter((e) => e.kind === kind).length : 0), 0);
  const drop = (e: Element, i: number, what: string): Fix => ({ path: `${EL}/${i}`, what, run: () => void env.gone.add(e) });
  let stickers = 0;
  let pageStickers = count("sticker");
  let marks = count("wordmark");
  let quotes = 0;
  let qas = 0;
  for (const { e, i } of entries(env)) {
    if (e.kind === "sticker") {
      stickers++;
      pageStickers++;
      if (stickers > RESTRAINT.stickersPerSection) out.push(both(`${EL}/${i}`, "structure", "composed: at most one sticker per section", drop(e, i, "sticker dropped")));
      else if (pageStickers > RESTRAINT.stickersPerPage) out.push(both(`${EL}/${i}`, "structure", `composed: at most ${RESTRAINT.stickersPerPage} stickers per page`, drop(e, i, "sticker dropped")));
    }
    if (e.kind === "wordmark" && ++marks > RESTRAINT.wordmarksPerPage) out.push(both(`${EL}/${i}`, "structure", "composed: at most one wordmark per page", drop(e, i, "wordmark dropped")));
    if (e.kind === "quote" && ++quotes > RESTRAINT.quotesPerSection) out.push(issue("structure", `${EL}/${i}`, "composed: at most one quote per section"));
    if (e.kind === "qa" && ++qas > RESTRAINT.qaPerSection) out.push(issue("structure", `${EL}/${i}`, "composed: at most one qa per section"));
  }
  return out;
}

// ---------- G29 the intent's own content ----------

/** A list that is a dated or stepped run: every item carries a lead (a date, a step). */
const isLeadList = (e: Element): boolean => e.kind === "list" && e.items.length > 0 && e.items.every((x) => typeof x !== "string");

/**
 * G29 (spec v21): a faq section holds a `qa` element (the questions and answers), a steps section holds a `steps`
 * element or a list whose every item has a lead (the dated list of spec v20, kept working). The other intents say nothing
 * about their elements. No repair: a section that says it is a FAQ and shows none is replaced by the intent's preset layout.
 */
function g29(env: Env): Finding[] {
  const intent = env.s.props.intent;
  const els = entries(env).map((x) => x.e);
  if (intent === "faq" && !els.some((e) => e.kind === "qa")) return [issue("structure", "/props/intent", "composed: intent faq needs a qa element")];
  if (intent === "steps" && !els.some((e) => e.kind === "steps" || isLeadList(e))) return [issue("structure", "/props/intent", "composed: intent steps needs a steps element or a list with a lead on every item")];
  return [];
}

// ---------- G26 text over a photo is painted above it ----------

/**
 * G26 (docs/plans/studio-phase1-design.md §2.1): a text-bearing element that shares desktop grid cells with an `image` or
 * `photos` element lies over it, and then its `layer` must be higher than that image's, or the photo paints over the
 * words. The rule is the geometry and the stacking; it does not narrow which kinds may sit on a photo. Every text-bearing
 * kind may: text, lists, hours and contact get the renderer's backing panel (`overPhoto` in @sb/components layout.ts,
 * `.cx-over`), and the objects with a ground of their own (plate, seal, ticket and tag facts, a primary action, a sticker,
 * a ribbon) need none, so `overPhoto`'s exemptions decide only whether a panel is drawn, never whether the element may be
 * there. The panel's rule stays in the renderer (spec cannot import components); this one is the part both share: who
 * overlaps whom, and who is on top. A repair raises the layer (at most 3); when the photo is already on layer 3 the
 * section is rejected. A captioned `photos` element is text-bearing itself, so its overlap with other text is G23's.
 */
function g26(env: Env): Finding[] {
  const out: Finding[] = [];
  const els = entries(env);
  for (const { e, i } of els) {
    if (!isTextBearing(e)) continue;
    let need = 0;
    const under: string[] = [];
    for (const o of els) {
      if (o.e === e || (o.e.kind !== "image" && o.e.kind !== "photos") || isTextBearing(o.e) || !meets(boxOf(e), boxOf(o.e))) continue;
      const layer = o.e.desk.layer ?? 0;
      if ((e.desk.layer ?? 0) > layer) continue;
      need = Math.max(need, layer + 1);
      under.push(`${o.e.id} (layer ${layer})`);
    }
    if (need === 0) continue;
    const path = `${EL}/${i}/desk/layer`;
    const message = `composed: ${e.id} (${e.kind}) shares desktop cells with ${under.join(", ")} and must be on a higher layer than the photo (it is on ${e.desk.layer ?? 0})`;
    if (need > 3) out.push(issue("structure", path, `${message}; the photo is already on the top layer`));
    else out.push(both(path, "structure", message, { path, what: `layer raised to ${need} (above the photo)`, run: () => void (e.desk.layer = Math.max(e.desk.layer ?? 0, need)) }));
  }
  return out;
}

// ---------- G27 contrast on a texture, G28 the field treatment's frame ----------

/**
 * G27 (docs/plans/studio-phase1-design.md §2.1): a texture paints the section's text colour over the ground at up to its
 * max alpha (TEXTURE_META), so the words on the ground see that blend, not the plain ground. Every ink a text sets on the
 * tone's ground (not on a fill, an own ground, a field, a photo or an image's scrim: those cover the texture) is held to its
 * threshold (4.5, or 3 for large text) against the blended ground; repair drops the texture. A section with a photo layer
 * hides its texture and is not checked.
 */
function g27(env: Env): Finding[] {
  const colors = env.ctx.colors;
  const texture = env.s.props.surface?.texture;
  if (!colors || texture === undefined || texture === "none") return [];
  const meta = (TEXTURE_META as Readonly<Record<string, { maxAlpha: number } | undefined>>)[texture];
  if (!meta || layerEntries(env).some(({ l }) => l.kind === "photo")) return [];
  const ground = toneGround(env);
  const ink = hexOf(colors, onRole(ground));
  const under = mix(ink, hexOf(colors, ground), meta.maxAlpha);
  const over = new Set(holders(env).flatMap((h) => h.texts.map((t) => t.e)));
  const path = "/props/surface/texture";
  const fix: Fix = { path, what: "texture dropped", run: () => void delete (env.s.props.surface as Loose).texture };
  const out: Finding[] = [];
  for (const { e } of entries(env)) {
    const p = painted(e);
    if (!p || p.fill || hasOwnGround(env, e) || fieldOf(env, e) || over.has(e)) continue;
    const fg = p.color ?? onRole(ground);
    const got = contrast(hexOf(colors, fg), under);
    if (got >= minOf(p)) continue;
    const f = issue("design", path, `composed: ${e.id}: ${fg} on the "${texture}" texture over ${ground} fails contrast (${ratio(got)} < ${minOf(p)} at alpha ${meta.maxAlpha})`);
    if (out.length === 0) f.fix = fix;
    out.push(f);
  }
  return out;
}

const FIELD_CLASH: ReadonlySet<string> = new Set(FIELD_CLASH_MASKS);

/** G28: the field treatment sets the photo's inset, as the postcard, ruled and crop frames do; the two never meet. Repair drops the frame. */
function g28(env: Env): Finding[] {
  const out: Finding[] = [];
  for (const { e, i } of entries(env)) {
    if ((e.kind !== "image" && e.kind !== "photos") || e.treatment !== "field" || e.mask === undefined || !FIELD_CLASH.has(e.mask)) continue;
    const o = loose(e);
    const path = `${EL}/${i}/mask`;
    out.push(both(path, "structure", `composed: ${e.id}: the field treatment can't be combined with the ${e.mask} frame`, { path, what: "mask dropped", run: () => void delete o.mask }));
  }
  return out;
}

/**
 * The rules in repair order: layers and names first (they change what the later rules see), restraint last. G4 runs after
 * G9 and G3: G9 may drop the field layer a headerOver opener rested on, and G4 then drops headerOver with it.
 */
const RULES: ((env: Env) => Finding[])[] = [g1, g8, g5, g6, g7, g2, g9, g3, g4, g27, g28, g10to12, g14, g15to17, g18to21, photoRefs, g26, g22, g29];

/** Every issue G1–G22 find in the section (paths include `ctx.at`). */
export function validateV2(section: ComposedSection, ctx: CompositionContext): Issue[] {
  const env: Env = { s: section, ctx, gone: new Set() };
  const at = ctx.at ?? "";
  return RULES.flatMap((rule) => rule(env).flatMap((f) => (f.issue ? [{ ...f.issue, path: at + f.issue.path }] : [])));
}

/** Applies the fixes of G1–G22 to `next` (a copy) and logs them through `log`. */
export function repairV2(next: ComposedSection, ctx: CompositionContext, log: (path: string, what: string) => void): void {
  const env: Env = { s: next, ctx, gone: new Set() };
  const at = ctx.at ?? "";
  for (const rule of RULES) {
    const done = new Set<string>();
    for (const f of rule(env)) {
      if (!f.fix || done.has(f.fix.path)) continue;
      done.add(f.fix.path);
      if (f.fix.run() !== false) log(at + f.fix.path, f.fix.what);
    }
  }
  if (env.gone.size === 0) return;
  next.props.elements = next.props.elements.filter((e) => !env.gone.has(e));
  if (next.props.background) {
    const rest = next.props.background.filter((l) => !env.gone.has(l));
    if (rest.length > 0) next.props.background = rest;
    else delete next.props.background;
  }
}
