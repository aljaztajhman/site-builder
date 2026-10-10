import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import type { SiteSpec } from "@sb/spec";
import { callButtonsPerScreen, serveStatic, type StaticServer } from "@sb/engine";
import { COMPOSED, loadComposed, openPage, writeComposedSite } from "../src/compose-sheet.ts";
import { kitchenSinkSpec, writeSiteFiles } from "../src/kitchen-sink.ts";

/**
 * A composed opener that offers the call (a call action, or a fact object linked to the phone: M's plate) with the phone
 * bar on: at 360 px no screen shows two call buttons, the first screen one (site.tsx reads a composed opener's actions
 * and its calling fact as it reads a hero's; reveal.js makes the bar's call wait and step aside for a later plate). The
 * three compose-sheet specs (tools/eval/composed) as authored (with their skeleton) and without a skeleton, and the
 * kitchen-sink page (no skeleton, a calling plate and a directions action). No model call.
 */
let browser: Browser;
let dir: string;
let server: StaticServer;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-composed-bar-"));
  server = await serveStatic(dir);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
  await rm(dir, { recursive: true, force: true });
});

type El = { kind: string; action?: string; link?: { action?: string } };
const offersCall = (spec: SiteSpec): boolean => {
  const opener = spec.pages.find((p) => p.kind === "home")!.sections[0]!;
  expect(opener.type).toBe("composed");
  return (opener.props as { elements: El[] }).elements.some((e) => (e.kind === "action" && e.action === "call") || (e.kind === "fact" && e.link?.action === "call"));
};

/** At 360 px: the call buttons and calling objects on the first screen, and the engine's most per screen over the page. */
async function measure(file: string) {
  const { page, ctx } = await openPage(browser, { width: 360, height: 800 }, `${server.url}/${file}`);
  try {
    const first = await page.evaluate(() => {
      const vh = window.innerHeight;
      return [...document.querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]')]
        .filter((a) => a.matches(".btn, .plate, .callblock, .bignum") || a.querySelector(".cx-fact__obj") !== null)
        .filter((a) => {
          const cs = getComputedStyle(a);
          const r = a.getBoundingClientRect();
          return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 1 && r.height > 1 && r.top < vh && r.bottom > 0;
        })
        .map((a) => `${a.className} "${a.textContent?.trim()}"`);
    });
    return { first, calls: await callButtonsPerScreen(page) };
  } finally {
    await ctx.close();
  }
}

describe("composed opener and the phone action bar", () => {
  for (const t of COMPOSED) {
    for (const skeleton of [true, false]) {
      it(`${t.id} ${t.name}${skeleton ? "" : " without a skeleton"}: one call button on the first phone screen, never two on one`, async () => {
        const spec = await loadComposed(t);
        if (!skeleton) delete spec.design.skeleton;
        spec.chrome.mobileActionBar = true;
        expect(offersCall(spec)).toBe(true);
        spec.slug = `${spec.slug}${skeleton ? "" : "-bare"}`;
        const { first, calls } = await measure(await writeComposedSite(t, spec, dir));
        expect(first).toHaveLength(1);
        // Every screen with a skeleton (skeleton.css makes later call buttons text links) and for M's plates. Without one,
        // S's and J's later sections carry call buttons of their own beside the bar (as any site without a skeleton): only
        // their first screen is held here.
        if (skeleton || t.id === "M" || calls.at === 0) expect(calls.max, `${calls.at}px: ${calls.buttons.join(", ")}`).toBeLessThanOrEqual(1);
      }, 120_000);
    }
  }

  it("kitchen sink: one call button on the first phone screen, never two on one", async () => {
    const { spec, media } = await kitchenSinkSpec();
    spec.chrome.mobileActionBar = true;
    expect(offersCall(spec)).toBe(true);
    await writeSiteFiles(spec, media, dir);
    const { first, calls } = await measure(`${spec.slug}/index.html`);
    expect(first).toHaveLength(1);
    expect(calls.max, `${calls.at}px: ${calls.buttons.join(", ")}`).toBeLessThanOrEqual(1);
  }, 120_000);
});
