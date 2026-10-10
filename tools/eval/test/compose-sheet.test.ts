import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { serveStatic, type StaticServer } from "@sb/engine";
import { validateSite } from "@sb/spec";
import { COMPOSED, WIDTHS, checkPage, loadComposed, openPage, writeComposedSite } from "../src/compose-sheet.ts";

/**
 * The three hand-made templates re-expressed as composed sections (tools/eval/composed, spec v19; pnpm
 * designer:compose-sheet draws them beside the hand-made pages): each spec validates (schema, references, the banned
 * list and the composed guards), uses composed sections for its opener, and its homepage renders at 360 and 1280 px
 * with no axe violation, no horizontal scroll, one h1 and at most one call button on any screen. No model call.
 */
let browser: Browser;
let dir: string;
let server: StaticServer;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-compose-sheet-test-"));
  server = await serveStatic(dir);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
  await rm(dir, { recursive: true, force: true });
});

describe("composed re-expressions of the hand-made templates", () => {
  for (const t of COMPOSED) {
    it(`${t.id} ${t.name}: validates and renders clean at 360 and 1280 px`, async () => {
      const spec = await loadComposed(t);
      const v = validateSite(spec);
      expect(v.ok ? [] : v.issues.map((i) => `${i.path}: ${i.message}`)).toEqual([]);
      const home = spec.pages.find((p) => p.kind === "home")!;
      expect(home.sections[0]?.type).toBe("composed");
      expect(home.sections.filter((s) => s.type === "composed").length).toBeGreaterThanOrEqual(3);

      const file = await writeComposedSite(t, spec, dir);
      const problems: string[] = [];
      for (const w of WIDTHS) {
        const { page, ctx } = await openPage(browser, w, `${server.url}/${file}`);
        try {
          const c = await checkPage(page);
          const where = `${t.id} at ${w.width} px`;
          for (const a of c.axe) problems.push(`${where}: axe ${a}`);
          if (c.horizontalScroll) problems.push(`${where}: horizontal scroll (${c.scrollWidth} px)`);
          if (c.callButtons.max > 1) problems.push(`${where}: ${c.callButtons.max} call buttons on one screen at ${c.callButtons.at}: ${c.callButtons.buttons.join(", ")}`);
          if (c.h1 !== 1) problems.push(`${where}: ${c.h1} h1 elements`);
        } finally {
          await ctx.close();
        }
      }
      expect(problems).toEqual([]);
    }, 180_000);
  }
});
