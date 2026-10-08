import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { choreograph, keyframes, match, MORPH_TIMING, morphTiming, type Part, type Rect } from "../src/index.ts";
import { bundle, DIST } from "../scripts/bundle.ts";

/**
 * The engine's pure parts, without a browser: keyframe rounding, pairing by role, the schedule and the
 * generated CSS. Elements are stand-ins with just what the code asks of them (document order, matches).
 */
let order = 0;
const el = (tag = "div") => {
  const pos = order++;
  return {
    pos,
    tagName: tag,
    matches: (sel: string) => sel.split(",").some((s) => s.trim() === tag),
    querySelector: () => null,
    compareDocumentPosition(other: { pos: number }) {
      return other.pos > pos ? 4 : 2;
    },
  } as unknown as HTMLElement;
};

const part = (key: string, rect: Rect, o: Partial<Part> = {}): Part => ({ key, el: el(o.kind === "panel" ? "section" : "p"), kind: "part", rect, ...o });
const R = (left: number, top: number, width: number, height: number): Rect => ({ left, top, width, height });

describe("keyframes", () => {
  it("keeps percentages strictly increasing, so a face swap 0.5 ms long never merges into a crossfade", () => {
    const css = keyframes("k", [{ t: 0, css: "opacity:1" }, { t: 500, css: "opacity:1" }, { t: 500.5, css: "opacity:0", ease: "linear" }, { t: 3000, css: "opacity:0" }], 3000);
    const pcts = [...css.matchAll(/([\d.]+)%\{/g)].map((m) => Number(m[1]));
    expect(pcts).toEqual([0, 16.6667, 16.6833, 100]);
    for (let i = 1; i < pcts.length; i++) expect(pcts[i]!).toBeGreaterThan(pcts[i - 1]!);
    expect(css).toContain("opacity:0;animation-timing-function:linear");
  });

  it("nudges equal times apart instead of merging them", () => {
    const css = keyframes("k", [{ t: 100, css: "a:1" }, { t: 100, css: "a:2" }], 1000);
    expect([...css.matchAll(/([\d.]+)%\{/g)].map((m) => m[1])).toEqual(["10.0000", "10.0010"]);
  });
});

describe("match", () => {
  it("pairs by role first, then leftovers of the same sort and similar size; the rest exit or enter", () => {
    const o = [part("h1", R(0, 0, 400, 60)), part("nav0", R(0, 0, 60, 20)), part("nav3", R(300, 0, 60, 20)), part("old", R(0, 400, 900, 300))];
    const n = [part("h1", R(0, 100, 500, 80)), part("nav0", R(0, 0, 60, 20)), part("nav1", R(80, 0, 70, 20)), part("new", R(0, 500, 20, 20))];
    const m = match(o, n);
    expect(m.pairs.map((p) => `${p.o.key}>${p.n.key}`)).toEqual(["h1>h1", "nav0>nav0", "nav3>nav1"]);
    expect(m.exits.map((p) => p.key)).toEqual(["old"]);
    expect(m.enters.map((p) => p.key)).toEqual(["new"]);
  });

  it("never pairs a panel with a part of the same key", () => {
    const m = match([part("x", R(0, 0, 10, 10))], [part("x", R(0, 0, 10, 10), { kind: "panel", el: el("section") })]);
    expect(m.pairs).toEqual([]);
  });
});

describe("choreograph", () => {
  const vw = 1280;
  const vh = 800;
  const hero = (rect: Rect) => part("hero", rect, { kind: "panel", region: "hero", el: el("section") });
  const plan = (tempo = 1) => {
    const oHero = hero(R(0, 80, 1280, 600));
    const nHero = hero(R(0, 80, 1280, 640));
    const pairs = [
      { o: oHero, n: nHero },
      { o: part("h1", R(40, 200, 500, 80)), n: part("h1", R(700, 240, 520, 120)) },
      { o: part("lead", R(40, 300, 400, 60)), n: part("lead", R(700, 380, 300, 50)) },
    ];
    const exits = [part("chip", R(900, 500, 120, 30))];
    const enters = [part("fact0", R(700, 500, 150, 60))];
    const names = new Map([...pairs.map((p) => p.o), ...exits].map((p, i) => [p, `m-${i}`]));
    return choreograph({ pairs, exits, enters, newPanels: [nHero], vw, vh, timing: morphTiming({ tempo }), nameOf: (p) => names.get(p)!, prefix: "m", backdrop: "black" });
  };

  it("names every new element: pairs keep their old part's name, new parts get their own", () => {
    const p = plan();
    expect(p.newNames.map(([, n]) => n)).toEqual(["m-0", "m-1", "m-2", "m-in-0"]);
    for (const n of ["m-0", "m-1", "m-2", "m-3", "m-in-0"]) expect(p.css).toContain(`::view-transition-group(${n}){`);
  });

  it("turns a panel in the middle of its parts' turns, so their colours change together", () => {
    const p = plan();
    // The hero is first in the wave, but waits for the h1 and lead (median turn) on it.
    expect(p.faceAt.get("hero")).toBe(p.faceAt.get("lead"));
    expect(p.faceAt.get("h1")).toBeLessThan(p.faceAt.get("lead")!);
  });

  it("scales with tempo", () => {
    expect(plan(1.5).total).toBeCloseTo(plan(1).total * 1.5, 5);
    expect(plan(1).T.turn).toBe(MORPH_TIMING.phases.turn);
  });

  it("never stretches a snapshot: images keep their size and the pair clips", () => {
    const css = plan().css;
    expect(css).toContain("inline-size:auto;block-size:auto");
    expect(css).toContain("::view-transition-image-pair(*){overflow:clip");
    // 3D only while turning: outside the turn, transforms are flat.
    expect(css).toMatch(/perspective\(\d+px\)[^;]*rotate[XY]\(/);
    expect(css).toContain("::view-transition{background:black}");
  });

  it("with no backdrop, the old and new screens cross-fade over the whole morph", () => {
    const oP = part("h1", R(0, 0, 100, 20));
    const nP = part("h1", R(0, 0, 100, 20));
    const p = choreograph({ pairs: [{ o: oP, n: nP }], exits: [], enters: [], newPanels: [], vw, vh, timing: MORPH_TIMING, nameOf: () => "a", prefix: "z", backdrop: false });
    expect(p.css).not.toContain("::view-transition{");
    expect(p.css).toContain(`::view-transition-old(root){animation:z-root-out ${p.total}ms`);
  });
});

describe("dist/morph.js", () => {
  it("equals a fresh build (run: pnpm --filter @sb/morph build)", async () => {
    const committed = (await readFile(DIST, "utf8")).replace(/\r\n/g, "\n");
    expect(committed).toBe(await bundle());
  });
});
