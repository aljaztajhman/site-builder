import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { serveStatic, type StaticServer } from "@sb/engine";
import { ComposedProps, type Section } from "@sb/spec";
import { COMPOSED, WIDTHS, loadComposed, openPage, writeComposedSite, checkPage } from "../src/compose-sheet.ts";

/**
 * The `steps` and `qa` element kinds (spec v21) in a browser at 1280 and 360 px: both kinds in both styles are
 * accessibility-clean (axe, no horizontal scroll), a steps list is an ordered list with its titles as h3, the line style
 * draws the timeline rail, a toggle answer is closed until its summary is activated from the keyboard, and the open style
 * shows every answer. No model call.
 */
let browser: Browser;
let dir: string;
let server: StaticServer;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-composed-steps-qa-"));
  server = await serveStatic(dir);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
  await rm(dir, { recursive: true, force: true });
});

const T = COMPOSED[0]!;

async function open(sections: Section[], w: (typeof WIDTHS)[number]) {
  const spec = await loadComposed(T);
  spec.pages.find((p) => p.kind === "home")!.sections = sections;
  const file = await writeComposedSite(T, spec, dir);
  return openPage(browser, w, `${server.url}/${file}`);
}

const shot = async (page: Page, name: string, w: number) => {
  if (process.env.SB_SHOTS) await page.screenshot({ path: path.join(process.env.SB_SHOTS, `${name}-${w}.png`), fullPage: true });
};

const place = (row: number, order: number) => ({ desk: { col: 1, span: 8, row }, phone: { order, span: "full" as const } });
const head = (text: string) => ({ id: "e_h", kind: "heading", text, level: 2, size: 3, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" as const } });

function composed(id: string, intent: string, elements: unknown[], tone?: "inverse"): Section {
  const rows = Math.max(...elements.map((e) => (e as { desk: { row: number } }).desk.row));
  return { id, type: "composed", variant: "free", ...(tone ? { tone } : {}), props: ComposedProps.parse({ intent, width: "contained", rows, elements }) } as Section;
}

/** The page's opener, so the page has its one h1 and the h2/h3 order under test is a real page's. */
const opener = composed("s_open", "page-head", [{ id: "e_h1", kind: "heading", text: "Avtoservis Mrak", level: 1, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } }]);

const STEPS = [
  { title: "Naročilo", text: "Pokličete nas ali pišete in se dogovorimo za termin." },
  { title: "Pregled vozila", text: "Pogledamo, kaj je treba narediti, in vam povemo, koliko bo trajalo." },
  { title: "Popravilo", text: "Delo opravimo v dogovorjenem roku z originalnimi deli." },
  { title: "Prevzem", text: "Vozilo prevzamete, mi pa vam razložimo, kaj smo naredili." },
];
const QA = [
  { question: "Ali delate ob sobotah?", answer: "Da, ob sobotah smo odprti do poldneva. Za večja popravila se dogovorimo vnaprej." },
  { question: "Ali popravljate vse znamke vozil?", answer: "Popravljamo vse znamke osebnih vozil in lažjih dostavnikov." },
  { question: "Koliko traja redni servis?", answer: "Običajno en delovni dan." },
];

const steps = (style: "numbered" | "line", tone?: "inverse") => composed(`s_steps_${style}${tone ? "_dark" : ""}`, "steps", [head("Kako poteka popravilo"), { id: "e_s", kind: "steps", style, items: STEPS, ...place(2, 1) }], tone);
const qa = (style: "open" | "toggle", tone?: "inverse") => composed(`s_qa_${style}${tone ? "_dark" : ""}`, "faq", [head("Pogosta vprašanja"), { id: "e_q", kind: "qa", style, items: QA, ...place(2, 1) }], tone);

describe("steps and qa in the renderer", () => {
  it.each([
    ["numbered", steps("numbered")],
    ["line", steps("line")],
    ["numbered on a dark section", steps("numbered", "inverse")],
    ["line on a dark section", steps("line", "inverse")],
    ["open", qa("open")],
    ["toggle", qa("toggle")],
    ["toggle on a dark section", qa("toggle", "inverse")],
  ] as const)("%s: axe clean and no horizontal scroll at 1280 and 360 px", async (name, section) => {
    for (const w of WIDTHS) {
      const { page, ctx } = await open([opener, section], w);
      try {
        await shot(page, `steps-qa-${name.replace(/ /g, "-")}`, w.width);
        const checks = await checkPage(page);
        expect(checks.axe, `${name} ${w.width} px`).toEqual([]);
        expect(checks.horizontalScroll, `${name} ${w.width} px scrollWidth ${checks.scrollWidth}`).toBe(false);
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);

  it("steps is an ordered list of h3 titles with a sentence each; numbered counts, line draws the rail", async () => {
    for (const w of WIDTHS) {
      const { page, ctx } = await open([steps("numbered"), steps("line")], w);
      try {
        for (const style of ["numbered", "line"] as const) {
          const r = await page.evaluate((id) => {
            const ol = document.querySelector(`#${id} ol.cx-l`)!;
            const lis = [...ol.querySelectorAll(":scope > li")];
            return {
              tag: ol.tagName,
              titles: lis.map((li) => li.querySelector("h3")?.textContent),
              texts: lis.map((li) => li.querySelector("p")?.textContent),
              before: getComputedStyle(lis[0]!, "::before").content,
              after: getComputedStyle(lis[0]!, "::after").content,
              lastAfter: getComputedStyle(lis[lis.length - 1]!, "::after").content,
            };
          }, `s_steps_${style}`);
          expect(r.tag).toBe("OL");
          expect(r.titles, `${style} ${w.width} px`).toEqual(STEPS.map((s) => s.title));
          expect(r.texts).toEqual(STEPS.map((s) => s.text));
          if (style === "line") {
            expect(r.before, `${w.width} px`).toBe('""');
            expect(r.after, `${w.width} px rail`).toBe('""');
            expect(r.lastAfter, `${w.width} px no rail after the last`).toBe("none");
          }
        }
        // numbered: the ol's own decimal markers (never part of the words a translation sees), inside the content box on a phone too.
        const numbered = await page.evaluate(() => {
          const ol = document.querySelector("#s_steps_numbered ol.cx-l")!;
          const li = ol.querySelector("li")!;
          return { type: getComputedStyle(ol).listStyleType, pad: parseFloat(getComputedStyle(ol).paddingLeft), left: li.getBoundingClientRect().left };
        });
        expect(numbered.type, `${w.width} px`).toBe("decimal");
        expect(numbered.pad, `${w.width} px`).toBeGreaterThan(16);
        expect(numbered.left, `${w.width} px`).toBeGreaterThan(16);
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);

  it("a line step clears its ring: the text starts to the right of it", async () => {
    for (const w of WIDTHS) {
      const { page, ctx } = await open([steps("line")], w);
      try {
        const gap = await page.evaluate(() => {
          const li = document.querySelector("#s_steps_line ol.cx-l > li")!;
          const ring = getComputedStyle(li, "::before");
          return parseFloat(getComputedStyle(li).paddingLeft) - (parseFloat(ring.left) + parseFloat(ring.width));
        });
        expect(gap, `${w.width} px`).toBeGreaterThanOrEqual(6);
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);

  it("qa open shows every answer; no details element", async () => {
    for (const w of WIDTHS) {
      const { page, ctx } = await open([opener, qa("open")], w);
      try {
        const r = await page.evaluate(() => {
          const root = document.querySelector("#s_qa_open ul.cx-l")!;
          return {
            details: root.querySelectorAll("details").length,
            q: [...root.querySelectorAll("h3")].map((h) => h.textContent),
            visible: [...root.querySelectorAll("li > p")].map((a) => (a as HTMLElement).checkVisibility()),
          };
        });
        expect(r.details).toBe(0);
        expect(r.q, `${w.width} px`).toEqual(QA.map((x) => x.question));
        expect(r.visible).toEqual(QA.map(() => true));
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);

  it("qa toggle: closed until the summary is activated from the keyboard, then open; focus is visible and the target 44 px high", async () => {
    for (const w of WIDTHS) {
      const { page, ctx } = await open([opener, qa("toggle")], w);
      try {
        const state = () =>
          page.evaluate(() => [...document.querySelectorAll("#s_qa_toggle details")].map((d) => ({ open: (d as HTMLDetailsElement).open, shown: (d.querySelector("p") as HTMLElement).checkVisibility() })));
        expect((await state()).map((s) => [s.open, s.shown]), `${w.width} px closed`).toEqual(QA.map(() => [false, false]));
        // Tab to the first summary, press Enter; then Space on the second.
        const summaries = page.locator("#s_qa_toggle summary");
        await summaries.nth(0).focus();
        expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("SUMMARY");
        await page.keyboard.press("Enter");
        expect((await state()).map((s) => s.open), `${w.width} px Enter`).toEqual([true, false, false]);
        expect((await state())[0]!.shown).toBe(true);
        await summaries.nth(1).focus();
        await page.keyboard.press("Space");
        expect((await state()).map((s) => s.open), `${w.width} px Space`).toEqual([true, true, false]);
        await page.keyboard.press("Enter");
        expect((await state()).map((s) => s.open)).toEqual([true, false, false]);
        const box = await summaries.nth(2).boundingBox();
        expect(box!.height, `${w.width} px target`).toBeGreaterThanOrEqual(44);
        await shot(page, "qa-toggle-open", w.width);
        const checks = await checkPage(page);
        expect(checks.axe, `${w.width} px`).toEqual([]);
        expect(checks.horizontalScroll).toBe(false);
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);

  it("item headings sit one level below the section's own heading: h3 under an h2, h2 under an h1 or with no heading (no heading-order violation)", async () => {
    const bare = composed("s_faq_bare", "faq", [{ id: "e_q", kind: "qa", style: "open", items: QA, ...place(1, 0) }]);
    const inH1 = composed("s_steps_h1", "page-head", [
      { id: "e_h1", kind: "heading", text: "Avtoservis Mrak", level: 1, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_s", kind: "steps", style: "numbered", items: STEPS, ...place(2, 1) },
    ]);
    for (const w of WIDTHS) {
      // A faq section with only a qa element, straight after the h1 hero.
      const a = await open([opener, bare], w);
      try {
        const r = await a.page.evaluate(() => [...document.querySelectorAll("#s_faq_bare li > h2, #s_faq_bare li > h3")].map((h) => h.tagName));
        expect(r, `bare faq ${w.width} px`).toEqual(QA.map(() => "H2"));
        const checks = await checkPage(a.page);
        expect(checks.axe, `bare faq ${w.width} px`).toEqual([]);
      } finally {
        await a.ctx.close();
      }
      // A steps element inside the section that holds the h1.
      const b = await open([inH1], w);
      try {
        const r = await b.page.evaluate(() => [...document.querySelectorAll("#s_steps_h1 ol > li > h2, #s_steps_h1 ol > li > h3")].map((h) => h.tagName));
        expect(r, `steps in the h1 section ${w.width} px`).toEqual(STEPS.map(() => "H2"));
      } finally {
        await b.ctx.close();
      }
    }
  }, 120_000);

  it("a title-only step renders its title and no empty paragraph; axe clean", async () => {
    const titles = composed("s_steps_titles", "steps", [head("Kako poteka popravilo"), { id: "e_s", kind: "steps", style: "line", items: [{ title: "Naročilo" }, { title: "Pregled", text: "Pogledamo vozilo." }, { title: "Prevzem" }], ...place(2, 1) }]);
    for (const w of WIDTHS) {
      const { page, ctx } = await open([opener, titles], w);
      try {
        const r = await page.evaluate(() => [...document.querySelectorAll("#s_steps_titles ol > li")].map((li) => [li.querySelector("h3")?.textContent, li.querySelectorAll("p").length]));
        expect(r, `${w.width} px`).toEqual([["Naročilo", 0], ["Pregled", 1], ["Prevzem", 0]]);
        const checks = await checkPage(page);
        expect(checks.axe, `${w.width} px`).toEqual([]);
        expect(checks.horizontalScroll).toBe(false);
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);
});
