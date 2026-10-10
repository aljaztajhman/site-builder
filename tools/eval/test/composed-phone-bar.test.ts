import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { callButtonsPerScreen, serveStatic, type StaticServer } from "@sb/engine";
import { COMPOSED, loadComposed, openPage, writeComposedSite } from "../src/compose-sheet.ts";

/**
 * A composed opener with a call action on a site without a skeleton, phone bar on: at 360 px the first screen shows one
 * call button, not the opener's and the bar's (site.tsx reads a composed opener's actions as it reads a hero's). The
 * three compose-sheet specs (tools/eval/composed) each open with a composed section that has a call action. No model call.
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

describe("composed opener and the phone action bar", () => {
  for (const t of COMPOSED) {
    it(`${t.id} ${t.name}: one call button on the first phone screen`, async () => {
      const spec = await loadComposed(t);
      delete spec.design.skeleton;
      spec.chrome.mobileActionBar = true;
      const opener = spec.pages.find((p) => p.kind === "home")!.sections[0]!;
      expect(opener.type).toBe("composed");
      expect((opener.props as { elements: { kind: string; action?: string }[] }).elements.some((e) => e.kind === "action" && e.action === "call")).toBe(true);

      const file = await writeComposedSite(t, spec, dir);
      const { page, ctx } = await openPage(browser, { width: 360, height: 800 }, `${server.url}/${file}`);
      try {
        // Call buttons (not text links) on the first screen, the bar's included.
        const first = await page.evaluate(() => {
          const vh = window.innerHeight;
          return [...document.querySelectorAll<HTMLAnchorElement>('a.btn[href^="tel:"]')]
            .filter((a) => {
              const cs = getComputedStyle(a);
              const r = a.getBoundingClientRect();
              return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 1 && r.height > 1 && r.top < vh && r.bottom > 0;
            })
            .map((a) => `${a.className} "${a.textContent?.trim()}"`);
        });
        expect(first).toHaveLength(1);
        // The engine's own count agrees on the first screen.
        const calls = await callButtonsPerScreen(page);
        if (calls.at === 0) expect(calls.max).toBeLessThanOrEqual(1);
      } finally {
        await ctx.close();
      }
    }, 120_000);
  }
});
