import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ELEMENT_KINDS, MOTIONS, MOTION_META } from "../src/index.ts";

/**
 * MOTION_META against the CSS that draws each preset (docs/plans/studio-phase1-design.md §1.1, §3.4.3): the entrance /
 * scroll kind decides the timeline, `js` decides whether a motion island exists, `safeAtLoad` is true exactly when the
 * start state hides nothing, and the targets are what the rules select. The starter presets (reveal, unmask) live in
 * composed-v2.css; every later one is a partial in styles/vocab/motion/<name>.css.
 */
const styles = new URL("../../components/styles/", import.meta.url);
const v2Source = readFileSync(new URL("composed-v2.css", styles), "utf8");
const partial = (name: string) => new URL(`vocab/motion/${name}.css`, styles);

interface Block {
  prelude: string;
  body: string;
  ancestors: string[];
}
/** Blocks of CSS (comments stripped) with their at-rule ancestry, nested at-rules flattened. */
function walk(css: string, ancestors: string[] = [], out: Block[] = []): Block[] {
  css = ancestors.length === 0 ? css.replace(/\/\*[\s\S]*?\*\//g, "") : css;
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    let depth = 0;
    let j = open;
    for (; j < css.length; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}" && --depth === 0) break;
    }
    const prelude = css.slice(i, open).trim();
    const body = css.slice(open + 1, j);
    out.push({ prelude, body, ancestors });
    if (/^@(media|supports)\b/.test(prelude)) walk(body, [...ancestors, prelude], out);
    i = j + 1;
  }
  return out;
}

const own = (name: string) => new RegExp(`\\.cx-mo-${name}(?![\\w-])`);
/** The blocks that draw preset `name`: its rules and its keyframes. */
function blocksOf(name: string): { rules: Block[]; keyframes: Block[] } {
  const file = partial(name);
  const all = walk(existsSync(file) ? readFileSync(file, "utf8") : v2Source);
  return {
    rules: all.filter((b) => !b.prelude.startsWith("@") && own(name).test(b.prelude)),
    keyframes: all.filter((b) => b.prelude === `@keyframes cx-mo-${name}`),
  };
}
const animating = (rules: Block[]) => rules.filter((b) => /(^|[;\s])animation(-timeline)?:/.test(b.body));
const timelines = (rules: Block[]) => rules.flatMap((b) => [...b.body.matchAll(/animation-timeline:\s*([a-z-]+)\(/g)].map((m) => m[1]));
const declarations = (k: Block) => walk(k.body).flatMap((f) => f.body.split(";").filter((d) => d.trim()).map((d) => d.split(":")[0]!.trim()));

describe("MOTION_META and the CSS of each preset", () => {
  it("every preset has meta, rules and a keyframes block", () => {
    expect(Object.keys(MOTION_META).sort()).toEqual([...MOTIONS].sort());
    for (const m of MOTIONS) {
      const { rules, keyframes } = blocksOf(m);
      expect(animating(rules).length, `${m} animates something`).toBeGreaterThan(0);
      expect(keyframes.length, `${m} keyframes`).toBe(1);
    }
  });

  it("an entrance preset uses view() timelines only; a scroll preset uses scroll() (and needs lively)", () => {
    for (const m of MOTIONS) {
      const meta = MOTION_META[m];
      const used = timelines(blocksOf(m).rules);
      expect(used.length, m).toBeGreaterThan(0);
      for (const t of used) expect(t, m).toBe(meta.kind === "entrance" ? "view" : "scroll");
      if (meta.kind === "scroll") expect(meta.minLevel, `${m}: scroll presets are lively only`).toBe("lively");
    }
  });

  it("its animations sit under @supports (animation-timeline) matching the timeline, and prefers-reduced-motion: no-preference", () => {
    for (const m of MOTIONS) {
      const { rules, keyframes } = blocksOf(m);
      const fn = MOTION_META[m].kind === "entrance" ? "view" : "scroll";
      for (const b of [...animating(rules), ...keyframes]) {
        expect(b.ancestors.some((a) => a.replace(/\s/g, "") === `@supports(animation-timeline:${fn}())`), `${m} ${b.prelude}`).toBe(true);
        expect(b.ancestors.some((a) => a.replace(/\s/g, "") === "@media(prefers-reduced-motion:no-preference)"), `${m} ${b.prelude}`).toBe(true);
      }
    }
  });

  it("its keyframes use transform, opacity and clip-path only, and clip-path only through a --shape- token", () => {
    for (const m of MOTIONS) {
      for (const k of blocksOf(m).keyframes) {
        for (const d of declarations(k)) expect(d, m).toMatch(/^(transform|opacity|clip-path)$/);
        for (const f of walk(k.body)) for (const c of f.body.matchAll(/clip-path:([^;]+)/g)) expect(c[1]!.trim(), m).toMatch(/^var\(--shape-[a-z]+\)$/);
      }
    }
  });

  it("js: false presets are CSS only: no island hook (data attribute or .is-live state) in their rules", () => {
    for (const m of MOTIONS) {
      if (MOTION_META[m].js) continue;
      const css = blocksOf(m).rules.map((b) => b.prelude).join(" ");
      expect(css, m).not.toMatch(/\[data-|\.is-live/);
    }
    // No preset needs the motion island yet; one that does must say so (js: true) and ship it.
    expect(MOTIONS.filter((m) => MOTION_META[m].js)).toEqual([]);
  });

  it("safeAtLoad is true exactly when the start state hides nothing (no opacity or clip-path in the keyframes)", () => {
    for (const m of MOTIONS) {
      const hides = blocksOf(m).keyframes.some((k) => declarations(k).some((d) => d === "opacity" || d === "clip-path"));
      expect(MOTION_META[m].safeAtLoad, m).toBe(!hides);
    }
  });

  it("targets are element kinds that the rules select, or none for a preset that moves a background layer", () => {
    for (const m of MOTIONS) {
      const { targets } = MOTION_META[m];
      for (const t of targets) expect(ELEMENT_KINDS as readonly string[], `${m} ${t}`).toContain(t);
      const selectors = animating(blocksOf(m).rules).map((b) => b.prelude).join(" ");
      if (targets.length === 0) expect(selectors, m).toMatch(/\.cx-bg-/);
      else for (const t of targets) expect(selectors, `${m} ${t}`).toContain(`.cx-el--${t}`);
    }
  });
});
