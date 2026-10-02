import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { unzipSync } from "fflate";
import type { Browser } from "playwright";

export interface ExportCheck {
  ok: boolean;
  files: number;
  bytes: number;
  /** Pages opened from file:// and what failed on them. */
  pages: { file: string; brokenImages: string[]; fontsLoaded: string[]; styled: boolean; failedRequests: string[] }[];
  problems: string[];
}

/** Writes an export's files under `dir`, as a client unpacking the download would; returns them by name. */
export async function unzipTo(zip: Uint8Array, dir: string): Promise<Record<string, Uint8Array>> {
  const files = unzipSync(zip);
  for (const [name, data] of Object.entries(files)) {
    const p = path.resolve(dir, name);
    if (!p.startsWith(path.resolve(dir) + path.sep)) throw new Error(`zip entry outside the folder: ${name}`);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data);
  }
  return files;
}

/**
 * Unzips an export and opens every page from file:// with no server, as a client would after
 * downloading it: the stylesheet must apply, every image must load, the self-hosted fonts must load,
 * and nothing may request the network.
 */
export async function checkExportOffline(zip: Uint8Array, slug: string, browser: Browser): Promise<ExportCheck> {
  const dir = await mkdtemp(path.join(tmpdir(), "sb-export-"));
  const files = await unzipTo(zip, dir);
  const pages = Object.keys(files).filter((f) => f.startsWith(`${slug}/`) && f.endsWith(".html"));
  const result: ExportCheck = { ok: true, files: pages.length, bytes: zip.length, pages: [], problems: [] };
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, offline: true });
  try {
    // The root index.html must lead to the site.
    const entry = await ctx.newPage();
    await entry.goto(pathToFileURL(path.join(dir, "index.html")).href);
    await entry.waitForURL((u) => u.pathname.endsWith(`/${slug}/index.html`), { timeout: 5000 }).catch(() => undefined);
    await entry.waitForLoadState("load");
    if (!entry.url().endsWith(`${slug}/index.html`)) result.problems.push(`root index.html did not open the site (at ${entry.url()})`);
    await entry.close();

    for (const file of pages) {
      const page = await ctx.newPage();
      const failed: string[] = [];
      page.on("requestfailed", (r) => failed.push(r.url().split("/").slice(-2).join("/")));
      await page.goto(pathToFileURL(path.join(dir, file)).href, { waitUntil: "load" });
      // Scroll so lazy images load.
      await page.evaluate("globalThis.__name = globalThis.__name || ((f) => f)");
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
      });
      await page.waitForLoadState("networkidle");
      const r = await page.evaluate(async () => {
        await document.fonts.ready;
        return {
          brokenImages: [...document.images].filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.currentSrc || i.src),
          fontsLoaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")),
          // The shared stylesheet sets the body font from the design tokens; unstyled pages keep the UA serif.
          styled: getComputedStyle(document.body).fontFamily.includes(",") && getComputedStyle(document.querySelector(".container") ?? document.body).maxWidth !== "none",
        };
      });
      const external = failed.filter((u) => /^https?:/.test(u));
      result.pages.push({ file, ...r, failedRequests: failed });
      if (r.brokenImages.length) result.problems.push(`${file}: ${r.brokenImages.length} images did not load`);
      if (!r.styled) result.problems.push(`${file}: stylesheet did not apply`);
      if (r.fontsLoaded.length === 0) result.problems.push(`${file}: no web font loaded`);
      if (external.length) result.problems.push(`${file}: network requests ${external.join(", ")}`);
      await page.close();
    }
  } finally {
    await ctx.close();
    await rm(dir, { recursive: true, force: true });
  }
  result.ok = result.problems.length === 0;
  return result;
}
