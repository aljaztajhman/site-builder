import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { checkSite, launchCheckBrowser, type CheckBrowser } from "@sb/engine";
import { siteFiles } from "@sb/render";
import { migrateSpec, type SiteSpec } from "@sb/spec";

/** The give-aways the rendered-page check catches (sb-giveaway-additions), on real output and on a tampered copy. */

const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
let browser: CheckBrowser;
beforeAll(async () => {
  browser = await launchCheckBrowser();
}, 120_000);
afterAll(async () => {
  await browser?.close();
}, 60_000);

const golden = async (id: string) => migrateSpec(JSON.parse(await readFile(path.join(here, `../golden/${id}.json`), "utf8"))) as SiteSpec;
const files = (spec: SiteSpec) => siteFiles(spec, new Map(), { imageWidths: config.images.widths });
const check = (spec: SiteSpec, f: Map<string, Uint8Array>) => checkSite(spec, f, { config, corpus: "", lighthouse: false, browser, pages: ["index.html"] });
const give = /accent single-side border|eyebrow|em dash|buttons in the hero/;

describe("give-aways on the rendered page", () => {
  it("finds none on generated homepages (pekarna-kvas, racunovodstvo-seliskar)", async () => {
    for (const id of ["pekarna-kvas", "racunovodstvo-seliskar"]) {
      const spec = await golden(id);
      const r = await check(spec, files(spec));
      const p = r.pages[0]!;
      expect([...p.mobile.banned, ...p.desktop.banned].filter((b) => give.test(b)), id).toEqual([]);
    }
  }, 180_000);

  it("reports an accent stripe, a capitalised tracked eyebrow, an em dash and a second hero button", async () => {
    const spec = await golden("pekarna-kvas");
    const f = files(spec);
    const key = (end: string) => [...f.keys()].find((k) => k.endsWith(end))!;
    const css = key("site.css");
    const page = key(`${spec.slug}/index.html`);
    expect(css && page).toBeTruthy();
    const text = (k: string) => new TextDecoder().decode(f.get(k));
    f.set(css, new TextEncoder().encode(`${text(css)}.section-head{border-left:4px solid var(--c-primary)}.eyebrow{text-transform:uppercase;letter-spacing:.12em}`));
    const html = text(page)
      .replace(/(<h1[^>]*>)/, "$1Kruh — ")
      .replace(/(<div class="actions">)/, '$1<a class="btn btn--secondary" href="#">Druga</a>');
    expect(html).toContain("btn--secondary");
    f.set(page, new TextEncoder().encode(html));
    const r = await check(spec, f);
    const banned = [...r.pages[0]!.mobile.banned, ...r.pages[0]!.desktop.banned].join("\n");
    expect(banned).toMatch(/accent single-side border: /);
    expect(banned).toMatch(/uppercase eyebrow: /);
    expect(banned).toMatch(/tracked-out eyebrow: /);
    expect(banned).toMatch(/em dash in text: ".*Kruh —/);
    expect(banned).toMatch(/2 buttons in the hero: /);
    expect(r.failures.join(" ")).toMatch(/banned patterns/);
  }, 180_000);
});
