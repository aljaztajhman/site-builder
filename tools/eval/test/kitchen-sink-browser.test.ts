// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { measurePage, runAxe, serveStatic } from "@sb/engine";
import { COMPOSED_SHEETS, composedSheets } from "@sb/render";
import { loadConfig } from "@sb/config";
import { kitchenSinkSpec, writeSiteFiles } from "../src/kitchen-sink.ts";

/**
 * The kitchen-sink page of composition language v2 (spec v20; tools/eval/composed/kitchen-sink.json: every feature that
 * exists) in a browser at 360 and 1280 px, one context per width (and a reduced-motion one). Per page and width: no
 * horizontal scroll, axe WCAG 2.2 A/AA clean; text never sits under an image (a text box that meets an image box is an
 * intended over-photo element, painted on top: elementFromPoint); a sticker or ribbon box meets no text, link or button
 * box inside main; the marquee's pause button is 44 px or more and works from the keyboard; reduced motion runs no
 * animation; each page links exactly the composed sheets composedSheets() says. Screenshots: eval/runs/kitchen-sink/
 * (gitignored). No model call.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, "../../../eval/runs/kitchen-sink");
const config = loadConfig();

let browser: Browser;
let dir: string;
let base = "";
let close: () => Promise<void>;
let spec: Awaited<ReturnType<typeof kitchenSinkSpec>>["spec"];

beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-sink-"));
  await mkdir(shots, { recursive: true });
  const k = await kitchenSinkSpec();
  spec = k.spec;
  await writeSiteFiles(k.spec, k.media, path.join(dir, "site"));
  const server = await serveStatic(path.join(dir, "site"));
  base = `${server.url}/${spec.slug}`;
  close = server.close;
}, 120_000);
afterAll(async () => {
  await browser?.close();
  await close?.();
  await rm(dir, { recursive: true, force: true });
});

const PAGES = [
  { id: "p_home", file: "index.html" },
  { id: "p_galerija", file: "galerija.html" },
  { id: "p_slike", file: "slike.html" },
];

/** Runs in the page: the overlaps between text, images, stickers and ribbons (boxes in CSS px). */
function overlapProbe() {
  const SMALL = 1;
  const visible = (e: Element) => {
    const r = e.getBoundingClientRect();
    return r.width > SMALL && r.height > SMALL && getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden";
  };
  const meet = (a: DOMRect, b: DOMRect) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > SMALL && h > SMALL ? { x: Math.max(a.left, b.left) + w / 2, y: Math.max(a.top, b.top) + h / 2 } : null;
  };
  const name = (e: Element) => `${e.tagName.toLowerCase()}.${[...e.classList].filter((c) => c.startsWith("cx-el--") || c.startsWith("cx-fact--")).join(".")} "${(e.textContent ?? "").trim().slice(0, 24)}"`;
  const onTop = (el: Element, p: { x: number; y: number }) => {
    const docY = p.y + window.scrollY;
    window.scrollTo(0, Math.max(0, docY - window.innerHeight * 0.6));
    const hit = document.elementFromPoint(Math.min(Math.max(p.x, 1), window.innerWidth - 1), docY - window.scrollY);
    return hit !== null && el.contains(hit);
  };
  const problems: string[] = [];
  let met = 0;
  const ownGround = (e: Element) => e.matches(".cx-el--sticker, .cx-el--ribbon, .cx-pb") || e.querySelector(".cx-fact--plate, .cx-fact--seal, .cx-fact--ticket, .cx-fact--tag") !== null || e.matches(".cx-fact--plate, .cx-fact--seal, .cx-fact--ticket, .cx-fact--tag");
  const texts = [...document.querySelectorAll("main .cx-el")].filter((e) => !e.matches(".cx-el--image, .cx-el--photos, .cx-el--decor") && visible(e));
  const images = [...document.querySelectorAll("main .cx-el--image, main .cx-el--photos")].flatMap((box) => [...box.querySelectorAll("img")].filter(visible).map((img) => ({ box, img })));
  // 1 Text meets an image: an intended over-photo element, painted on top.
  for (const t of texts) {
    for (const { box, img } of images) {
      if (box === t) continue;
      const scrolled = box.matches("[class*='scrim']") || box.querySelector("[class*='scrim']") !== null;
      const hit = meet(t.getBoundingClientRect(), img.getBoundingClientRect());
      if (!hit) continue;
      met++;
      if (!(t.classList.contains("cx-over") || ownGround(t) || scrolled)) problems.push(`${name(t)} meets ${name(box)} and is not marked over-photo`);
      else {
        // A round sticker or seal paints a circle in its box: probe the overlap's point nearest the object's centre, which
        // lies inside the shape, not the overlap's centre, which can fall in the box's empty corner.
        const r = t.getBoundingClientRect(), b = img.getBoundingClientRect();
        const at = ownGround(t) ? { x: Math.min(Math.max(r.left + r.width / 2, Math.max(r.left, b.left) + SMALL), Math.min(r.right, b.right) - SMALL), y: Math.min(Math.max(r.top + r.height / 2, Math.max(r.top, b.top) + SMALL), Math.min(r.bottom, b.bottom) - SMALL) } : hit;
        if (!onTop(t, at)) problems.push(`${name(t)} meets ${name(box)} but is not painted on top`);
      }
    }
  }
  // 2 A sticker or ribbon meets no text, link or button inside main.
  const objects = texts.filter((e) => e.matches(".cx-el--sticker, .cx-el--ribbon"));
  const others = [...document.querySelectorAll("main .cx-el, main a, main button")].filter((e) => visible(e) && !e.matches(".cx-el--image, .cx-el--photos, .cx-el--decor"));
  for (const o of objects) {
    for (const t of others) {
      if (t === o || o.contains(t) || t.contains(o)) continue;
      if (meet(o.getBoundingClientRect(), t.getBoundingClientRect())) problems.push(`${name(o)} meets ${name(t)}`);
    }
  }
  return { problems, met };
}

async function open(w: number, reduced: boolean, file: string, initScript?: () => void): Promise<{ page: Page; close: () => Promise<void> }> {
  const phone = w < 768;
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1, reducedMotion: reduced ? "reduce" : "no-preference", ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  if (initScript) await ctx.addInitScript(initScript);
  const page = await ctx.newPage();
  await page.goto(`${base}/${file}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return { page, close: () => ctx.close() };
}

describe("the kitchen-sink page at 360 and 1280 px", () => {
  it.each([360, 1280])("%i px: page checks, no text under a photo, no sticker over text, the sheets it says", async (w) => {
    const problems: string[] = [];
    for (const p of PAGES) {
      const { page, close: done } = await open(w, false, p.file);
      const where = `${p.file} at ${w} px`;
      const t = config.checks.tapTarget;
      const m = await measurePage(page, { primaryMin: t.primaryMin, primaryGap: t.primaryGap, absoluteMin: t.absoluteMin });
      if (m.horizontalScroll) problems.push(`${where}: horizontal scroll (${m.scrollWidth} px)`);
      for (const a of await runAxe(page)) problems.push(`${where}: axe ${a.id} (${a.nodes}): ${a.targets.slice(0, 3).join(", ")}`);
      const probe = await page.evaluate(overlapProbe);
      for (const s of probe.problems) problems.push(`${where}: ${s}`);
      // The probe has something to look at: the opener's sticker lies on the photo fan at desktop widths, and page 3's heading over its photo.
      if (w >= 768 && (p.id === "p_home" || p.id === "p_slike") && probe.met === 0) problems.push(`${where}: no text box meets an image box (the probe checks nothing)`);
      // A piled arrangement's frames fill their box: no empty band above them (the fan once left half its width of air under the heading).
      const air = await page.evaluate(() => [...document.querySelectorAll(".cx-ph--fan, .cx-ph--stack")].map((ph) => { const box = ph.querySelector(".cx-ph__box")!.getBoundingClientRect(); const top = Math.min(...[...ph.querySelectorAll(".cx-ph__f")].map((f) => f.getBoundingClientRect().top)); return { cls: ph.className, air: top - box.top, h: box.height }; }));
      for (const a of air) if (a.air > Math.max(24, a.h * 0.12)) problems.push(`${where}: ${a.cls}: ${Math.round(a.air)} px of empty box above the frames`);
      // The sheets: exactly the composed stylesheets composedSheets() names, in that order.
      const linked = await page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute("href") ?? "").filter((h) => /\/composed(-v2-[a-z]+)?-[0-9a-f]{10}\.css$/.test(h)).map((h) => h.split("/").pop()!));
      const want = composedSheets(spec.pages.find((x) => x.id === p.id)!.sections).map((k) => COMPOSED_SHEETS[k]().name);
      if (JSON.stringify(linked) !== JSON.stringify(want)) problems.push(`${where}: links ${linked.join(", ")}; composedSheets() says ${want.join(", ")}`);
      await page.screenshot({ path: path.join(shots, `${p.file.replace(".html", "")}-${w}.png`), fullPage: true });
      await done();
    }
    expect(problems).toEqual([]);
  }, 180_000);

  it.each([360, 1280])("%i px: the marquee's pause button is a 44 px target and works from the keyboard", async (w) => {
    const { page, close: done } = await open(w, false, "index.html");
    const btn = page.locator("button.cx-rb__btn");
    await btn.waitFor({ state: "visible" });
    const box = (await btn.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await btn.getAttribute("aria-pressed")).toBe("false");
    await btn.scrollIntoViewIfNeeded();
    await btn.focus();
    expect(await page.evaluate(() => document.activeElement?.classList.contains("cx-rb__btn"))).toBe(true);
    await page.keyboard.press("Enter");
    expect(await btn.getAttribute("aria-pressed")).toBe("true");
    await page.keyboard.press("Space");
    expect(await btn.getAttribute("aria-pressed")).toBe("false");
    await done();
  }, 60_000);

  it.each([360, 1280])("%i px: reduced motion runs no animation and shows no marquee button", async (w) => {
    for (const p of PAGES) {
      const { page, close: done } = await open(w, true, p.file);
      const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").map((a) => `${(a as CSSAnimation).animationName ?? a.constructor.name}`));
      expect(running, `${p.file} at ${w} px`).toEqual([]);
      expect(await page.locator("button.cx-rb__btn:visible").count(), `${p.file} at ${w} px`).toBe(0);
      await done();
    }
  }, 60_000);

  it.each([360, 1280])("%i px: a browser without scroll-driven animations (CSS.supports stubbed) keeps the ribbon still and shows no marquee button", async (w) => {
    // The loop and the button's room are inside @supports (animation-timeline: scroll()) (composed-v2.css): where that
    // fails (Firefox today) a shown button would cover the still row. Chromium supports it, so the island is told it doesn't.
    const { page, close: done } = await open(w, false, "index.html", () => {
      const real = CSS.supports.bind(CSS) as (...a: string[]) => boolean;
      CSS.supports = ((...a: string[]) => (a.join(" ").includes("animation-timeline") ? false : real(...a))) as typeof CSS.supports;
    });
    expect(await page.locator("[data-cx-loop]").count()).toBeGreaterThan(0);
    expect(await page.locator("button.cx-rb__btn").count()).toBeGreaterThan(0);
    expect(await page.locator("button.cx-rb__btn:visible").count()).toBe(0);
    expect(await page.locator("[data-cx-loop].is-live").count()).toBe(0);
    const looping = await page.evaluate(() => document.getAnimations().filter((a) => (a as CSSAnimation).animationName === "cx-rb-loop" && a.playState === "running").length);
    expect(looping).toBe(0);
    await done();
  }, 60_000);

  it("the shots exist", async () => {
    expect((await readdir(shots)).filter((f) => f.endsWith(".png")).length).toBeGreaterThanOrEqual(6);
  });
});
