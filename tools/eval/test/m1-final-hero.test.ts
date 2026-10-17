// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { serveStatic, type StaticServer } from "@sb/engine";
import { DIRECTIONS, FAMILIES, migrateSpec, type Skeleton, type SiteSpec } from "@sb/spec";
import { openPage, repoRoot } from "../src/compose-sheet.ts";
import { familyVariants } from "../src/families-sheet.ts";
import { renderToDir } from "../src/lib/render-dir.ts";

/**
 * M1 final check (2026-10-17): hero defects the outside reviewers named, in a real browser (no model call).
 * 1. kamp-soska: on the first desktop screen the text card over the photo ran past the bottom, cutting its copy and
 *    hiding its link. A hero that lays a card over a photo keeps the card and its main action on the first screen.
 * 3. pralnica-cisto, slascicarna-pri-zofki, zeliscarna-pri-lipi: a filled button whose label was underlined and
 *    touched its left edge (the skeleton's underline buttons under a direction that fills its primary action).
 */
let browser: Browser;
let dir: string;
let server: StaticServer;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-m1-hero-"));
  server = await serveStatic(dir);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
  await rm(dir, { recursive: true, force: true });
});

const fixture = async (id: string, slug = `m1h-${id}`): Promise<SiteSpec> => {
  const spec = migrateSpec(JSON.parse(await readFile(path.join(repoRoot, "tools/eval/test/fixtures/m1", `${id}.json`), "utf8"))) as SiteSpec;
  spec.slug = slug;
  return spec;
};

const shot = async (page: Page, name: string) => {
  if (process.env.SB_SHOTS) await page.screenshot({ path: path.join(process.env.SB_SHOTS, `m1h-${name}.png`) });
};

/** The heroes that lay a text card over a photo. */
const CARD_HEROES = ["hero-image:overlay-bottom", "hero-image:overlay-left", "hero-signature:card"];
const DESKTOPS = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];

/** The hero's text card and its first link (the main action), against the first screen. */
function cardOnScreen(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const hero = document.querySelector("main > :first-child")!;
    const card = hero.querySelector<HTMLElement>(".hero-image__panel, .hsig__card");
    if (!card) return ["no card"];
    const out: string[] = [];
    const vh = window.innerHeight;
    const r = card.getBoundingClientRect();
    if (r.bottom > vh + 0.5) out.push(`card ends at ${Math.round(r.bottom)} > ${vh}`);
    // overlay-bottom: the photo still spans its row (a capped height must not narrow it to its ratio).
    const media = hero.querySelector<HTMLElement>(".s-hero-image--overlay-bottom .hero-image__media");
    const row = media?.parentElement?.getBoundingClientRect();
    if (media && row && media.getBoundingClientRect().width < row.width - 16) out.push(`photo ${Math.round(media.getBoundingClientRect().width)} px of a ${Math.round(row.width)} px row`);
    const action = [...hero.querySelectorAll<HTMLElement>("a")].find((a) => a.checkVisibility({ visibilityProperty: true, opacityProperty: true }));
    if (action && action.getBoundingClientRect().bottom > vh + 0.5) out.push(`"${action.textContent?.trim()}" ends at ${Math.round(action.getBoundingClientRect().bottom)} > ${vh}`);
    return out;
  });
}

describe("1. a text card over a photo ends on the first desktop screen", () => {
  const long = async () => {
    const s = await fixture("kamp-soska", "m1h-kamp-soska-long");
    const hero = s.pages[0]!.sections[0]! as { props: Record<string, unknown> };
    hero.props = {
      ...hero.props,
      headline: "Šotor ob smaragdni Soči, mesto pa le deset minut stran od kampa",
      intro: "Majhen družinski kamp za planince, kolesarje, kajakaše in družine z otroki. Zvečer zakurimo ognjišče, zjutraj pa je kava že skuhana. Do reke je le nekaj korakov po travniku.",
    };
    return s;
  };
  const cases: [string, () => Promise<SiteSpec>][] = [
    ["final10 kamp-soska", () => fixture("kamp-soska")],
    ["kamp-soska with the longest copy", long],
  ];
  for (const d of DIRECTIONS.filter((x) => x.template && FAMILIES[x.id]?.heroes.some((h) => CARD_HEROES.includes(h)))) {
    for (const hero of FAMILIES[d.id]!.heroes.filter((h) => CARD_HEROES.includes(h))) {
      cases.push([
        `${d.id} ${hero}`,
        async () => {
          const v = (await familyVariants(d)).find((x) => x.hero === hero && x.palette === FAMILIES[d.id]!.palettes[0]!.id)!;
          v.spec.slug = `m1h-card-${d.id}-${hero.replace(":", "-")}`;
          return v.spec;
        },
      ]);
    }
  }
  for (const [name, spec] of cases) {
    it(`${name}: the card and its link inside 1280 × 800 and 1440 × 900`, async () => {
      const s = await spec();
      await renderToDir(s, dir);
      for (const w of DESKTOPS) {
        const { page, ctx } = await openPage(browser, w, `${server.url}/${s.slug}/index.html`);
        try {
          await shot(page, `card-${s.slug}-${w.width}`);
          expect(await cardOnScreen(page), `${w.width}×${w.height}`).toEqual([]);
        } finally {
          await ctx.close();
        }
      }
    }, 120_000);
  }
});

/**
 * Every filled button in the page (its own ground colour): padding on both sides, its label centred and not underlined.
 * Underlined links without a ground (the skeleton's underline buttons) are what they look like and aren't checked.
 */
function brokenButtons(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    for (const b of document.querySelectorAll<HTMLElement>("main .btn")) {
      if (!b.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
      const cs = getComputedStyle(b);
      const filled = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent";
      if (!filled) continue;
      const label = `${b.closest("section")?.className.split(" ")[1] ?? "?"} "${(b.textContent ?? "").trim().slice(0, 24)}"`;
      const pl = parseFloat(cs.paddingLeft);
      const pr = parseFloat(cs.paddingRight);
      if (pl < rem - 0.5 || pr < rem - 0.5) out.push(`${label}: padding ${pl}/${pr} px`);
      if (cs.textDecorationLine !== "none") out.push(`${label}: ${cs.textDecorationLine}`);
      // The label's ink centred in the button (within 2 px either way).
      const range = document.createRange();
      range.selectNodeContents(b);
      const t = range.getBoundingClientRect();
      const r = b.getBoundingClientRect();
      if (Math.abs(t.left - r.left - (r.right - t.right)) > 4) out.push(`${label}: label off centre (${Math.round(t.left - r.left)} | ${Math.round(r.right - t.right)})`);
    }
    return out;
  });
}

const UNDERLINE: Skeleton = { header: "bar", actions: "bar", footer: "visit", footerTone: "default", width: "contained", cards: "filled", buttons: "underline", dividers: "none", photoRatio: "standard" };

describe("3. a filled button is a button: padding, centred label, no underline", () => {
  const finals = ["pralnica-cisto", "slascicarna-pri-zofki", "zeliscarna-pri-lipi"];
  for (const id of finals) {
    it(`final10 ${id} at 360 and 1280 px`, async () => {
      const s = await fixture(id);
      await renderToDir(s, dir);
      for (const w of [{ width: 360, height: 800 }, { width: 1280, height: 800 }]) {
        const { page, ctx } = await openPage(browser, w, `${server.url}/${s.slug}/index.html`);
        try {
          await shot(page, `btn-${id}-${w.width}`);
          expect(await brokenButtons(page), `${w.width} px`).toEqual([]);
          // Nothing (the arch's seal on its shoulder) pushes the page sideways.
          expect(await page.evaluate(() => document.documentElement.scrollWidth), `${w.width} px`).toBeLessThanOrEqual(w.width);
        } finally {
          await ctx.close();
        }
      }
    }, 120_000);
  }
  // Every template direction's every hero, with each button style of the skeleton.
  for (const d of DIRECTIONS.filter((x) => x.template && FAMILIES[x.id])) {
    it(`${d.id}: every hero, with square, soft and underline buttons, at 1280 px`, async () => {
      const variants = (await familyVariants(d)).filter((v) => v.palette === FAMILIES[d.id]!.palettes[0]!.id);
      const problems: string[] = [];
      for (const v of variants) {
        for (const buttons of ["square", "soft", "underline"] as const) {
          const s = structuredClone(v.spec);
          s.design.skeleton = { ...UNDERLINE, buttons };
          s.slug = `m1h-btn-${d.id}-${v.hero.replace(":", "-")}-${buttons}`;
          await renderToDir(s, dir);
          const { page, ctx } = await openPage(browser, { width: 1280, height: 800 }, `${server.url}/${s.slug}/index.html`);
          try {
            problems.push(...(await brokenButtons(page)).map((p) => `${v.hero} ${buttons}: ${p}`));
          } finally {
            await ctx.close();
          }
        }
      }
      expect(problems).toEqual([]);
    }, 300_000);
  }
});
