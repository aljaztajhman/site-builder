import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The product UI's colours ("Arctic & teal", owner decision sb-ui-palette): every text/background pair the
 * stylesheets use keeps 4.5:1 (WCAG 1.4.3) and every border, focus ring and accent mark 3:1 against what it sits on
 * (WCAG 1.4.11), computed from the `:root` tokens of app.css and home.css themselves. axe checks the rendered pages
 * (legal-browser, editor-a11y-browser, ui-pages-browser); this covers the pairs a page may not show at test time
 * (hover colours, the toast, the live preview skeleton, the landing's dark vignettes).
 */
const ui = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/ui");
const read = (f: string) => readFileSync(path.join(ui, f), "utf8");
const appCss = read("app.css");
const homeCss = read("home.css");

const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "");

/** The custom properties of a stylesheet's first `:root{…}` block, `var()` references resolved. */
function rootTokens(css: string): Record<string, string> {
  const block = /:root\s*\{([^}]*)\}/.exec(withoutComments(css))?.[1] ?? "";
  return declarations(block);
}
function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+)\s*:\s*([^;]+)/g)) out[m[1]!] = m[2]!.trim();
  for (const [k, v] of Object.entries(out)) out[k] = v.replace(/var\(--([\w-]+)\)/g, (_, r: string) => out[r] ?? "");
  return out;
}

function rgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  expect(h, hex).toMatch(/^[0-9a-f]{6}$/i);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** A token name, or a literal hex colour the stylesheet hard-codes. */
type Ref = string;
const colour = (t: Record<string, string>, r: Ref): string => (r.startsWith("#") ? r : (t[r] ?? `missing --${r}`));

/** Text colour on background, as the stylesheets pair them. */
const APP_TEXT: [Ref, Ref][] = [
  ...(["ink", "ink-2", "ink-3", "accent-text"] as const).flatMap((fg) => (["canvas", "surface", "surface-2"] as const).map((bg): [Ref, Ref] => [fg, bg])),
  ["accent-ink", "accent"], // .btn.primary
  ["accent-ink", "accent-hover"], // .btn.primary:hover
  ["accent-text", "accent-soft"], // .pill.live, .findings .mark
  ["accent-text", "surface"], // .btn.primary.blocked, .variant .name::after
  ["warn", "warn-soft"], // .pill.busy, .findings .fix .mark
  ["warn", "surface"],
  ["danger", "danger-soft"], // .pill.err
  ["danger", "surface"], // .btn.danger, .err
  ["danger", "canvas"],
  ["ink", "ph"], // mark.ph
  ["surface", "ink"], // .toast, .msg.user
  ["#5c3700", "warn-soft"], // .note.warn
  ["#7a1a14", "danger-soft"], // .note.bad
  ["#7f4b00", "warn-soft"], // .chip.warn
  ["#7f4b00", "#f7e2bd"], // .chip.warn:hover
  ["ink", "#fffaf0"], // .ed .field.missing input
];
const HOME_TEXT: [Ref, Ref][] = [
  ...(["ink", "ink-2", "ink-3"] as const).flatMap((fg) => (["canvas", "surface", "surface-2"] as const).map((bg): [Ref, Ref] => [fg, bg])),
  ["accent-ink", "accent"],
  ["accent-ink", "accent-hover"],
  ["accent-text", "accent-soft"], // .attach count, .edit-vis .done
  ["accent-text", "surface"], // .search-vis .facts b, .edit-vis .val b
  ["on-ink", "ink"], // .call-vis .calling, .msg.user
  ["on-ink-2", "ink"], // .msg.user small
  ["calling", "ink"], // .call-vis .calling b
  ["link", "surface"], // .search-vis .title
  ["ink", "ph"],
  ["#7a1a14", "danger-soft"], // .hero .note.bad
];
/** Borders, focus rings and accent marks on what they sit on: 3:1. */
const APP_UI: [Ref, Ref][] = [
  ...(["line-field", "accent", "ink"] as const).flatMap((fg) => (["canvas", "surface", "surface-2"] as const).map((bg): [Ref, Ref] => [fg, bg])),
  ["warn", "surface"], // missing field border, .flash outline
  ["danger", "surface"], // [aria-invalid] border
];
const HOME_UI: [Ref, Ref][] = (["accent", "ink"] as const).flatMap((fg) => (["canvas", "surface", "surface-2"] as const).map((bg): [Ref, Ref] => [fg, bg]));

function failures(t: Record<string, string>, pairs: [Ref, Ref][], min: number): string[] {
  return pairs
    .map(([fg, bg]) => ({ fg, bg, r: contrast(colour(t, fg), colour(t, bg)) }))
    .filter((p) => !(p.r >= min))
    .map((p) => `${p.fg} on ${p.bg}: ${p.r.toFixed(2)}`);
}

describe("product UI colours", () => {
  const app = rootTokens(appCss);
  const home = rootTokens(homeCss);

  it("app.css: text 4.5:1, borders, focus and marks 3:1", () => {
    expect(failures(app, APP_TEXT, 4.5)).toEqual([]);
    expect(failures(app, APP_UI, 3)).toEqual([]);
  });

  it("home.css: text 4.5:1, focus and marks 3:1", () => {
    expect(failures(home, HOME_TEXT, 4.5)).toEqual([]);
    expect(failures(home, HOME_UI, 3)).toEqual([]);
  });

  it("the live preview skeleton's text keeps 4.5:1 before the run's colours arrive", () => {
    const sk = declarations(/\.ed \.frame\.live\{([^}]*)\}/.exec(appCss)?.[1] ?? "");
    expect(Object.keys(sk)).toEqual(expect.arrayContaining(["sk-bg", "sk-surface", "sk-text", "sk-muted"]));
    const pairs: [Ref, Ref][] = [["sk-text", "sk-bg"], ["sk-text", "sk-surface"], ["sk-muted", "sk-bg"], ["sk-muted", "sk-surface"]];
    expect(failures(sk, pairs, 4.5)).toEqual([]);
  });

  it("the landing uses the same product tokens as the dashboard", () => {
    const shared = ["canvas", "surface", "surface-2", "ink", "ink-2", "ink-3", "line", "line-2", "accent", "accent-hover", "accent-ink", "accent-text", "accent-soft", "ph", "danger", "danger-soft"];
    for (const k of shared) expect(home[k], `--${k}`).toBe(app[k]);
  });

  it("is the Arctic & teal scheme, and nothing in the product UI keeps the old warm palette", () => {
    expect(app).toMatchObject({ canvas: "#eef3f4", "surface-2": "#dfe8ea", ink: "#0f1f22", accent: "#0d7a84", "accent-soft": "#dbeef0" });
    // The warm paper canvas and green accent before sb-ui-palette, and the warm near-blacks and greys around them.
    const old = ["#f5f3ef", "#ece9e3", "#151412", "#4d4a44", "#6b665e", "#dcd8d0", "#c9c4ba", "#8a857c", "#156b4a", "#115a3e", "#e3efe8", "#191714", "#b5b0a7", "%23151412", "rgb(20 20 18", "rgb(21 107 74", "rgb(21 20 18"];
    const sources = {
      "ui/app.css": appCss,
      "ui/home.css": homeCss,
      "ui/assets.ts": read("assets.ts"),
      "client/editor.ts": read("../client/editor.ts"),
      "client/demo-transform.ts": read("../client/demo-transform.ts"),
      // The demo's backdrop colour lives in the engine.
      "packages/morph/src/choreograph.ts": read("../../../../packages/morph/src/choreograph.ts"),
    };
    const left = Object.entries(sources).flatMap(([f, src]) => old.filter((c) => withoutComments(src).toLowerCase().includes(c)).map((c) => `${f}: ${c}`));
    expect(left).toEqual([]);
  });
});
