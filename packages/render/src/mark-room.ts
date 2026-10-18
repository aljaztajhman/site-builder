/**
 * Room for a capital with a mark above it (Č Š Ž Ć …) on a display line. The mark rises above the cap height, up to
 * 1.09 em (Oswald, Unbounded), so on display line-heights (0.84–1.12) it touched the line above (review 50, "HITRO /
 * POŠTENO"; fresh 10, "Sirarna Pr' / Šimnu"). A display block with such a capital in its text (site.tsx markMarkedLines)
 * takes a line-height that clears it and, up to MARK_ROOM_CAP, the deepest descender of the line above: --lh-marks
 * (--lh-marks-caps when it is set in capitals), per heading face (tokens.ts).
 */

/**
 * Ink in em of each heading face, measured in Chromium on the shipped woff2 at weight 400 and the face's heaviest (the
 * larger of each; where Windows and Linux Chromium differ, the larger): mark, the ink top of the tallest marked capital above the baseline; desc, the deepest lower-case
 * descender (g j p q y , ; ą ę ç ş) below it; capsDesc, the same for capitals (Q J , ; Ą Ę Ç Ş). `pnpm exec tsx tools/eval/src/mark-metrics-print.ts`
 * prints it again (tools/eval/src/mark-metrics-print.ts); the slow test m1-chrome-blockers holds it to the browser.
 */
export const MARK_INK: Record<string, { mark: number; desc: number; capsDesc: number }> = {
  "albert-sans": { mark: 1.016, desc: 0.251, capsDesc: 0.298 },
  alegreya: { mark: 0.954, desc: 0.266, capsDesc: 0.266 },
  aleo: { mark: 1.016, desc: 0.204, capsDesc: 0.204 },
  archivo: { mark: 0.97, desc: 0.235, capsDesc: 0.235 },
  "atkinson-hyperlegible-next": { mark: 0.954, desc: 0.235, capsDesc: 0.204 },
  besley: { mark: 1.141, desc: 0.313, capsDesc: 0.313 },
  "big-shoulders": { mark: 1.079, desc: 0.235, capsDesc: 0.188 },
  "big-shoulders-stencil": { mark: 1.079, desc: 0.235, capsDesc: 0.22 },
  bitter: { mark: 1.048, desc: 0.298, capsDesc: 0.298 },
  "bodoni-moda": { mark: 1.079, desc: 0.282, capsDesc: 0.282 },
  "bricolage-grotesque": { mark: 0.938, desc: 0.266, capsDesc: 0.266 },
  "brygada-1918": { mark: 0.907, desc: 0.282, capsDesc: 0.266 },
  chivo: { mark: 0.954, desc: 0.235, capsDesc: 0.235 },
  cormorant: { mark: 0.891, desc: 0.298, capsDesc: 0.298 },
  "crimson-pro": { mark: 0.86, desc: 0.251, capsDesc: 0.251 },
  "dm-serif-display": { mark: 0.923, desc: 0.266, capsDesc: 0.251 },
  "eb-garamond": { mark: 0.876, desc: 0.313, capsDesc: 0.313 },
  epilogue: { mark: 1.032, desc: 0.251, capsDesc: 0.251 },
  figtree: { mark: 1.001, desc: 0.235, capsDesc: 0.235 },
  // capsDesc: 0.235 on Windows Chromium, 0.25 on Linux (CI): the larger, so no platform under-reserves (already a step up).
  fraunces: { mark: 0.97, desc: 0.266, capsDesc: 0.25 },
  "ibm-plex-sans": { mark: 1.032, desc: 0.235, capsDesc: 0.235 },
  "instrument-sans": { mark: 1.001, desc: 0.235, capsDesc: 0.235 },
  "inter-tight": { mark: 1.001, desc: 0.266, capsDesc: 0.266 },
  jost: { mark: 1.063, desc: 0.313, capsDesc: 0.345 },
  "krona-one": { mark: 1.016, desc: 0.282, capsDesc: 0.282 },
  "league-spartan": { mark: 0.97, desc: 0.235, capsDesc: 0.235 },
  "libre-caslon-text": { mark: 0.985, desc: 0.282, capsDesc: 0.282 },
  literata: { mark: 1.016, desc: 0.282, capsDesc: 0.282 },
  lora: { mark: 1.032, desc: 0.298, capsDesc: 0.298 },
  manrope: { mark: 1.063, desc: 0.282, capsDesc: 0.266 },
  newsreader: { mark: 0.923, desc: 0.282, capsDesc: 0.282 },
  oswald: { mark: 1.11, desc: 0.298, capsDesc: 0.298 },
  overpass: { mark: 1.032, desc: 0.266, capsDesc: 0.282 },
  "poltawski-nowy": { mark: 0.985, desc: 0.251, capsDesc: 0.251 },
  rokkitt: { mark: 0.845, desc: 0.204, capsDesc: 0.204 },
  "schibsted-grotesk": { mark: 1.001, desc: 0.235, capsDesc: 0.235 },
  signika: { mark: 0.97, desc: 0.251, capsDesc: 0.251 },
  "sofia-sans-condensed": { mark: 0.938, desc: 0.22, capsDesc: 0.22 },
  "space-grotesk": { mark: 0.97, desc: 0.235, capsDesc: 0.235 },
  syne: { mark: 0.97, desc: 0.298, capsDesc: 0.298 },
  unbounded: { mark: 1.11, desc: 0.282, capsDesc: 0.282 },
  vollkorn: { mark: 0.923, desc: 0.266, capsDesc: 0.266 },
  "work-sans": { mark: 0.97, desc: 0.251, capsDesc: 0.251 },
  "young-serif": { mark: 1.079, desc: 0.282, capsDesc: 0.282 },
  yrsa: { mark: 0.813, desc: 0.22, capsDesc: 0.22 },
};

/** Air between the mark's ink and the descender's, in em (and the measurement's 1/64 em steps). */
const AIR = 0.04 + 1 / 64;

/**
 * The most a display line with a marked capital gets (director, M1): full room above a descender took a three-line hero
 * heading 40–70 % taller at 360 px and could push its button off the first screen. Within it the mark always clears
 * the line above's capitals and ascenders (mark + air <= 1.19 in every face); the descender only as far as it fits.
 */
export const MARK_ROOM_CAP = 1.25;

/** The line-height (unitless) a display line with a marked capital takes in this heading face, mixed case or in capitals. */
export function markRoom(file: string, caps: boolean): number {
  const all = Object.values(MARK_INK);
  const ink = MARK_INK[file] ?? { mark: Math.max(...all.map((m) => m.mark)), desc: Math.max(...all.map((m) => m.desc)), capsDesc: Math.max(...all.map((m) => m.capsDesc)) };
  const full = Math.ceil((ink.mark + (caps ? ink.capsDesc : ink.desc) + AIR) * 100) / 100;
  return Math.max(Math.ceil((ink.mark + AIR) * 100) / 100, Math.min(MARK_ROOM_CAP, full));
}

const MARK_ABOVE = /[̀-̽̕̚-̈́͆͊-͌]/u;

/** Whether `text`, as set (caps: in capitals), has a capital with a mark above it (Č Š Ž Ć Á …). */
export function hasMarkedCapital(text: string, caps: boolean): boolean {
  // Composed first: a name typed as S + combining caron is one marked capital.
  for (const ch of (caps ? text.toLocaleUpperCase("sl") : text).normalize("NFC")) {
    const parts = ch.normalize("NFD");
    if (parts.length > 1 && /\p{Lu}/u.test(parts[0]!) && MARK_ABOVE.test(parts.slice(1))) return true;
  }
  return false;
}

const PHRASING = new Set("a abbr b bdi bdo cite code data del dfn em i ins kbd mark q s samp small span strong sub sup time u var".split(" "));
const TEXT_BLOCK = new Set("h1 h2 h3 h4 h5 h6 p blockquote figcaption dt dd li td th caption legend label button".split(" "));
const VOID = new Set("area base br col embed hr img input link meta source track wbr".split(" "));
const RAW = new Set(["script", "style", "svg", "noscript", "template", "textarea"]);
const CAPS_CLASS = /(?:^|\s)cx-h--uppercase(?:\s|$)/;
const NORMAL_CLASS = /(?:^|\s)cx-h--normal(?:\s|$)/;
const SITE_CAPS_CLASS = /(?:^|\s)(?:site-header__name|site-footer__wordmark)(?:\s|$)/;
/**
 * Wordmark styles that set the name in capitals (vocab/wordmarks/*.css text-transform: uppercase): [the style's class on
 * an ancestor or the element itself, the element's own class] ("Košir" is set "KOŠIR").
 */
const WORDMARK_CAPS: [string, string | null][] = [
  ["wm-stacked-caps", null],
  ["wm-plate", "wm__box"],
  ["wm-stamp", "wm__box"],
  ["wm-lockup", "wm__b"],
  ["wm-circle", "wm__rt"],
];
const hasClass = (cls: string, name: string) => ` ${cls} `.includes(` ${name} `);

interface Frame {
  tag: string;
  piece: number;
  attrs: string;
  marked: boolean;
}

/**
 * Marks the element whose own text has a capital with a mark above it (as set), the inline elements around it and the
 * text block they sit in (a heading, a paragraph; not a container such as the header's row), with data-marks ("caps"
 * when set in capitals): base.css gives them the face's mark room as their line-height floor. Set in capitals: the headings h1–h4, the header's name and the footer wordmark on a site with uppercase
 * headings, and a composed heading in capitals. Marked on the rendered markup, so every component's text counts.
 */
export function markMarkedLines(html: string, upperSite: boolean): string {
  const pieces: string[] = [];
  const stack: Frame[] = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let last = 0;
  let changed = false;
  const classOf = (f: Frame) => / class="([^"]*)"/.exec(f.attrs)?.[1] ?? "";
  const caps = (): boolean => {
    const classes = stack.map(classOf);
    for (const [style, own] of WORDMARK_CAPS) {
      const at = classes.findIndex((c) => hasClass(c, style));
      if (at >= 0 && (own === null || classes.slice(at).some((c) => hasClass(c, own)))) return true;
    }
    for (let i = stack.length - 1; i >= 0; i--) {
      const f = stack[i]!;
      const cls = classes[i]!;
      if (NORMAL_CLASS.test(cls)) return false;
      if (CAPS_CLASS.test(cls)) return true;
      if (upperSite && (/^h[1-4]$/.test(f.tag) || SITE_CAPS_CLASS.test(cls))) return true;
    }
    return false;
  };
  const text = (t: string) => {
    if (!t.trim() || stack.length === 0) return;
    const c = caps();
    if (!hasMarkedCapital(t.replace(/&[a-z#0-9]+;/gi, " "), c)) return;
    for (let i = stack.length - 1; i >= 0; i--) {
      const f = stack[i]!;
      // A container (the header's row, a section) above the inline elements is not marked: the floor would reach every
      // line inside it. The text's own element always is.
      if (i < stack.length - 1 && !PHRASING.has(f.tag) && !TEXT_BLOCK.has(f.tag)) break;
      if (!f.marked) {
        f.marked = true;
        changed = true;
        pieces[f.piece] = `${pieces[f.piece]!.slice(0, -1)} data-marks="${c ? "caps" : ""}">`;
      }
      if (!PHRASING.has(f.tag)) break;
    }
  };
  for (let m = tagRe.exec(html); m; m = tagRe.exec(html)) {
    text(html.slice(last, m.index));
    pieces.push(html.slice(last, m.index));
    const [tag, close, rawName, attrs] = m as unknown as [string, string, string, string];
    const name = rawName.toLowerCase();
    last = m.index + tag.length;
    if (close) {
      pieces.push(tag);
      const at = stack.map((f) => f.tag).lastIndexOf(name);
      if (at >= 0) stack.length = at;
      continue;
    }
    if (RAW.has(name)) {
      // Skip to its end: no display text inside, and its contents may hold "<".
      const end = html.toLowerCase().indexOf(`</${name}`, last);
      const stop = end < 0 ? html.length : html.indexOf(">", end) + 1;
      pieces.push(html.slice(m.index, stop));
      last = stop;
      tagRe.lastIndex = stop;
      continue;
    }
    pieces.push(tag);
    if (!VOID.has(name) && !attrs.endsWith("/")) stack.push({ tag: name, piece: pieces.length - 1, attrs, marked: / data-marks=/.test(attrs) });
  }
  pieces.push(html.slice(last));
  return changed ? pieces.join("") : html;
}
