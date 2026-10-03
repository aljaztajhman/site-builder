import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { posix } from "node:path";
import { strFromU8 } from "fflate";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { mediaFiles, notFoundPlacement, rebaseRelativeUrls, renderPage, siteFiles } from "../src/index.ts";

const goldenDir = new URL("../../../tools/eval/golden/", import.meta.url);
const goldens = readdirSync(goldenDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
const golden = (id: string) => migrateSpec(JSON.parse(readFileSync(new URL(`${id}.json`, goldenDir), "utf8"))) as SiteSpec;
const notFoundPage = (spec: SiteSpec) => spec.pages.find((p) => p.kind === "not-found")!;
const withEnglish = (spec: SiteSpec): SiteSpec => ({ ...spec, locales: { default: "sl", enabled: ["sl", "en"] } });

/** Every relative URL a document references: href, src, srcset entries, CSS url(). */
function relativeUrls(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) out.push(m[1]!);
  for (const m of html.matchAll(/\s(?:srcset|imagesrcset)="([^"]*)"/g)) for (const e of m[1]!.split(",")) out.push(e.trim().split(/\s+/)[0]!);
  for (const m of html.matchAll(/url\("?([^")]*)"?\)/g)) out.push(m[1]!);
  return out.map((u) => u.replace(/#.*$/, "")).filter((u) => u && !/^(?:[a-z][a-z0-9+.-]*:|\/|\?)/i.test(u));
}

/** URLs of `html`, served at `servedAt` (a path inside the publish root), that don't name a file in `files`. */
function unresolved(html: string, servedAt: string, files: Map<string, unknown>): string[] {
  return relativeUrls(html).filter((u) => !files.has(posix.normalize(posix.join(posix.dirname(servedAt), u))));
}

describe("404 page at any depth", () => {
  it.each(goldens)("%s: the stored 404 rebased one and two levels down equals the page rendered at that depth", (id) => {
    for (const spec of [golden(id), withEnglish(golden(id))]) {
      const page = notFoundPage(spec);
      for (const locale of spec.locales.enabled) {
        const stored = renderPage(spec, page, { locale });
        for (const depth of [1, 2]) expect(rebaseRelativeUrls(stored, "../".repeat(depth))).toBe(renderPage(spec, page, { locale, depth }));
      }
    }
  });

  it("every path of a 404 resolves in the published files at the site root, one and two levels down, in each locale", () => {
    const spec = withEnglish(golden("pekarna-kvas"));
    const files = siteFiles(spec, new Map(mediaFiles(spec).map((f) => [f, new Uint8Array()])));
    for (const dir of ["", "en/"]) {
      const stored = strFromU8(files.get(`${spec.slug}/${dir}404.html`)!);
      expect(relativeUrls(stored).length).toBeGreaterThan(5);
      // As stored (and in the export zip): next to the pages of its locale.
      expect(unresolved(stored, `${spec.slug}/${dir}404.html`, files)).toEqual([]);
      for (const missing of ["storitve/missing", "a/b/missing.html"]) {
        const { depth } = notFoundPlacement(`${dir}${missing}`, ["en/"]);
        const served = rebaseRelativeUrls(stored, "../".repeat(depth));
        expect(unresolved(served, `${spec.slug}/${dir}${missing}`, files), `${dir}${missing}`).toEqual([]);
        // Without the rebase the stylesheet is what breaks first (the bug this guards).
        expect(unresolved(stored, `${spec.slug}/${dir}${missing}`, files).some((u) => /\/site(-[a-z-]+)?\.css$/.test(u))).toBe(true);
      }
    }
  });

  it("leaves absolute, fragment, data:, tel: and mailto: URLs alone", () => {
    const html =
      '<a href="#main">x</a><a href="tel:+38641555123">t</a><a href="mailto:a@b.example">m</a><a href="https://x.example/a">h</a>' +
      '<link href="/abs.css"><img src="media/a.webp" srcset="media/a-480.webp 480w, media/a-960.webp 960w">' +
      '<style>a{background:url("data:image/svg+xml,%3Csvg%3E")}@font-face{src:url("../_shared/h/fonts/a.woff2")}</style>';
    expect(rebaseRelativeUrls(html, "../")).toBe(
      '<a href="#main">x</a><a href="tel:+38641555123">t</a><a href="mailto:a@b.example">m</a><a href="https://x.example/a">h</a>' +
        '<link href="/abs.css"><img src="../media/a.webp" srcset="../media/a-480.webp 480w, ../media/a-960.webp 960w">' +
        '<style>a{background:url("data:image/svg+xml,%3Csvg%3E")}@font-face{src:url("../../_shared/h/fonts/a.woff2")}</style>',
    );
    expect(rebaseRelativeUrls(html, "")).toBe(html);
  });

  it("places a miss in its locale directory and counts the levels below it", () => {
    expect(notFoundPlacement("missing.html")).toEqual({ dir: "", depth: 0 });
    expect(notFoundPlacement("storitve/missing")).toEqual({ dir: "", depth: 1 });
    expect(notFoundPlacement("storitve/index.html")).toEqual({ dir: "", depth: 1 });
    expect(notFoundPlacement("a/b/c")).toEqual({ dir: "", depth: 2 });
    expect(notFoundPlacement("en/missing", ["en/"])).toEqual({ dir: "en/", depth: 0 });
    expect(notFoundPlacement("en/a/missing", ["en/"])).toEqual({ dir: "en/", depth: 1 });
    expect(notFoundPlacement("en/a/missing")).toEqual({ dir: "", depth: 2 });
  });
});
