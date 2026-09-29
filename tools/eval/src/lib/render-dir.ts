/** Render a spec to a folder with stand-in image variants, and screenshot pages. */
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { chromium } from "playwright";
import { mediaFiles, siteFiles } from "@sb/render";
import type { SiteSpec } from "@sb/spec";
import { loadConfig } from "@sb/config";
import { serveStatic } from "./static-server.ts";

async function standInMedia(spec: SiteSpec, widths: number[], existingDir: string): Promise<Map<string, Uint8Array>> {
  const media = new Map<string, Uint8Array>();
  const palette = ["#6b7f8e", "#8e7a6b", "#6b8e74", "#7d6b8e", "#8e6b6b"];
  for (const file of mediaFiles(spec, widths)) {
    const existing = path.join(existingDir, file);
    if (existsSync(existing)) {
      media.set(file, readFileSync(existing));
      continue;
    }
    const m = /^(img_[a-z0-9_-]+)-(\d+)\.(avif|webp)$/.exec(file);
    if (!m) continue;
    const asset = spec.assets.images.find((i) => i.id === m[1]);
    if (!asset) continue;
    const w = Number(m[2]);
    const h = Math.round((asset.height * w) / asset.width);
    const colour = palette[spec.assets.images.indexOf(asset) % palette.length]!;
    const img = sharp({ create: { width: w, height: h, channels: 3, background: colour } });
    media.set(file, m[3] === "avif" ? await img.avif({ quality: 40 }).toBuffer() : await img.webp({ quality: 60 }).toBuffer());
  }
  return media;
}

export async function renderToDir(spec: SiteSpec, outDir: string): Promise<string> {
  const widths = loadConfig().images.widths;
  const media = await standInMedia(spec, widths, path.join(outDir, spec.slug, "media"));
  for (const [rel, data] of siteFiles(spec, media, { imageWidths: widths })) {
    const file = path.join(outDir, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }
  return path.join(outDir, spec.slug);
}

export async function screenshot(outDir: string, slug: string, page: string, shotsDir: string): Promise<string[]> {
  const server = await serveStatic(outDir);
  const browser = await chromium.launch();
  const out: string[] = [];
  try {
    for (const width of [360, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      await p.goto(`${server.url}/${slug}/${page}`, { waitUntil: "networkidle" });
      const scrollWidth = await p.evaluate(() => document.documentElement.scrollWidth);
      const file = path.join(shotsDir, `${page.replace(/\.html$/, "")}-${width}.png`);
      await mkdir(shotsDir, { recursive: true });
      await p.screenshot({ path: file, fullPage: true });
      console.log(`${file}  (scrollWidth ${scrollWidth}${scrollWidth > width ? " — HORIZONTAL SCROLL" : ""})`);
      out.push(file);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return out;
}
