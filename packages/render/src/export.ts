import { zipSync, strToU8 } from "fflate";
import type { SiteSpec } from "@sb/spec";
import { renderSite } from "./site.tsx";
import { sharedBundle } from "./shared.ts";

/** Every file of a published site, keyed by path relative to the publish root (which holds `{slug}/` and `_shared/`). */
export function siteFiles(spec: SiteSpec, media: Map<string, Uint8Array>, opts: { imageWidths?: number[] } = {}): Map<string, Uint8Array> {
  const bundle = sharedBundle();
  const rendered = renderSite(spec, { ...opts, sharedHash: bundle.hash });
  const files = new Map<string, Uint8Array>();
  for (const [p, html] of rendered.pages) files.set(`${spec.slug}/${p}`, strToU8(html));
  for (const [name, data] of media) files.set(`${spec.slug}/media/${name}`, data);
  for (const [p, data] of bundle.files) files.set(`_shared/${bundle.hash}/${p}`, data);
  return files;
}

/**
 * The export's files: the same files as the published site plus a root index.html that opens the site.
 * Works from file:// because every path in the pages is relative.
 */
export function exportFiles(spec: SiteSpec, media: Map<string, Uint8Array>, opts: { imageWidths?: number[] } = {}): Map<string, Uint8Array> {
  const files = siteFiles(spec, media, opts);
  files.set(
    "index.html",
    strToU8(
      `<!doctype html><html lang="${spec.locales.default}"><head><meta charset="utf-8"><title>${escapeHtml(spec.business.name)}</title>` +
        `<meta http-equiv="refresh" content="0; url=${spec.slug}/index.html"></head>` +
        `<body><p><a href="${spec.slug}/index.html">${escapeHtml(spec.business.name)}</a></p></body></html>`,
    ),
  );
  return files;
}

/** The export zip an owner downloads: `exportFiles`, zipped. */
export function exportZip(spec: SiteSpec, media: Map<string, Uint8Array>, opts: { imageWidths?: number[] } = {}): Uint8Array {
  return zipSync(Object.fromEntries(exportFiles(spec, media, opts)), { level: 6, mtime: new Date("2026-01-01T00:00:00Z") });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
