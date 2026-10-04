import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AppConfig } from "@sb/config";
import { collectPlaceholders, entryPages, validateSite, type Issue, type SiteSpec } from "@sb/spec";
import { pageFile } from "@sb/render";
import { checkFacts, type FactViolation } from "../facts.ts";
import { launchCheckBrowser, type CheckBrowser } from "./browser.ts";
import { hideFixedForFullPage, loadLazyImages, measurePage, runAxe, type AxeViolation, type MobileReport } from "./page-checks.ts";
import { runLighthouse, type LighthouseScores } from "./lighthouse.ts";
import { measureComposition, type Composition } from "./composition.ts";
import { serveStatic } from "./static-server.ts";

export { launchCheckBrowser, type CheckBrowser } from "./browser.ts";
export { serveStatic, type StaticServer } from "./static-server.ts";
export type { AxeViolation, MobileReport } from "./page-checks.ts";
export { loadLazyImages, measurePage, runAxe } from "./page-checks.ts";
export type { LighthouseScores } from "./lighthouse.ts";
export type { Composition } from "./composition.ts";
export { checkExportOffline, unzipTo, type ExportCheck } from "./export-offline.ts";
export * from "./url-check.ts";

export interface PageCheck {
  file: string;
  axe: AxeViolation[];
  mobile: MobileReport;
  desktop: Pick<MobileReport, "horizontalScroll" | "scrollWidth" | "lineLengths" | "banned">;
}

export interface SiteCheckReport {
  validation: Issue[];
  facts: FactViolation[];
  placeholders: number;
  pages: PageCheck[];
  lighthouse: LighthouseScores | null;
  /**
   * mobile, desktopFirst: the first screen as a visitor sees it (fixed bars included).
   * mobileFull, desktop: the whole page, fixed elements (action bar, consent box) hidden.
   */
  screenshots: { mobile: Uint8Array; mobileFull: Uint8Array; desktop: Uint8Array; desktopFirst: Uint8Array };
  /** Whole-page screenshots of the pages asked for in `shots` (fixed elements hidden), at the phone and desktop viewports. */
  pageShots: { file: string; mobile: Uint8Array; desktop: Uint8Array }[];
  /** Lighthouse (mobile) on the pages asked for in `lighthousePages`, besides the homepage. */
  lighthousePages: { file: string; scores: LighthouseScores }[];
  /** Homepage first-screen composition at the phone and desktop viewports (null when the homepage wasn't checked). */
  composition: { mobile: Composition; desktop: Composition } | null;
  /** Human-readable reasons the site fails the phase 1 bar; empty means pass. */
  failures: string[];
}

export interface CheckOptions {
  config: AppConfig;
  /** Everything the client wrote (brief text + chat messages), for the fact check. */
  corpus: string;
  /** Run Lighthouse on the homepage (slow; ~10 s). */
  lighthouse?: boolean;
  /** Reuse a browser across many checks (eval). */
  browser?: CheckBrowser;
  /** Only check these page files (default: the spec's pages; `sitePageFiles` adds the collection entries' pages). */
  pages?: string[];
  /** Screenshot these of the checked pages whole, at 360 and 1280 px (e.g. a collection entry's page). */
  shots?: string[];
  /** With `lighthouse`, also run it on these pages (the homepage always). */
  lighthousePages?: string[];
}

/**
 * Every page a visitor can open in the default language: the spec's pages, then each collection entry's own page
 * (novice/…, dogodki/…), which the spec's page list doesn't name.
 */
export function sitePageFiles(spec: SiteSpec): string[] {
  return [...spec.pages.map((p) => pageFile(p)), ...entryPages(spec.collections).map((e) => e.path!)];
}

/** One entry page per collection (the first the site lists): the ones that get screenshots and Lighthouse. */
export function sampleEntryPages(spec: SiteSpec): string[] {
  const seen = new Set<string>();
  return entryPages(spec.collections).flatMap((e) => {
    if (seen.has(e.kind)) return [];
    seen.add(e.kind);
    return [e.path!];
  });
}

/**
 * Renders nothing itself: takes the files produced by @sb/render (siteFiles), serves them over
 * HTTP like a static host and runs every automated check from the phase 1 "done" list.
 */
export async function checkSite(spec: SiteSpec, files: Map<string, Uint8Array>, opts: CheckOptions): Promise<SiteCheckReport> {
  const dir = await mkdtemp(path.join(tmpdir(), "sb-check-"));
  for (const [rel, data] of files) {
    const p = path.join(dir, rel);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data);
  }
  const server = await serveStatic(dir);
  const own = !opts.browser;
  const cb = opts.browser ?? (await launchCheckBrowser());
  const t = opts.config.checks.tapTarget;
  const vp = opts.config.checks.viewports;
  // A page that fails to load or an axe error must not leave contexts open in a shared browser.
  const contexts: { close(): Promise<void> }[] = [];
  try {
    const v = validateSite(spec);
    const validation = v.ok ? [] : v.issues;
    const facts = checkFacts(spec, opts.corpus);
    const placeholders = collectPlaceholders(spec).length;
    const files = opts.pages ?? spec.pages.map((p) => pageFile(p));
    const pages: PageCheck[] = [];
    let screenshots: SiteCheckReport["screenshots"] | undefined;
    let mobileComposition: Composition | undefined;
    let composition: SiteCheckReport["composition"] = null;
    const shots = new Set(opts.shots ?? []);
    const pageShots: SiteCheckReport["pageShots"] = [];

    for (const file of files) {
      const url = `${server.url}/${spec.slug}/${file}`;
      const mctx = await cb.browser.newContext({ viewport: vp.mobile, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      contexts.push(mctx);
      const mp = await mctx.newPage();
      await mp.goto(url, { waitUntil: "networkidle" });
      const mobile = await measurePage(mp, { primaryMin: t.primaryMin, primaryGap: t.primaryGap, absoluteMin: t.absoluteMin });
      const axe = await runAxe(mp);
      let shotMobile: Buffer | undefined;
      let shotMobileFull: Buffer | undefined;
      if (file === "index.html") {
        mobileComposition = await measureComposition(mp);
        shotMobile = await mp.screenshot({ type: "png" });
        await loadLazyImages(mp);
        await hideFixedForFullPage(mp);
        shotMobileFull = await mp.screenshot({ type: "png", fullPage: true });
      }
      let pageShotMobile: Buffer | undefined;
      if (shots.has(file)) {
        await loadLazyImages(mp);
        await hideFixedForFullPage(mp);
        pageShotMobile = await mp.screenshot({ type: "png", fullPage: true });
      }
      await mctx.close();

      const dctx = await cb.browser.newContext({ viewport: vp.desktop, deviceScaleFactor: 1 });
      contexts.push(dctx);
      const dp = await dctx.newPage();
      await dp.goto(url, { waitUntil: "networkidle" });
      const d = await measurePage(dp, { primaryMin: t.primaryMin, primaryGap: t.primaryGap, absoluteMin: t.absoluteMin });
      const desktopAxe = await runAxe(dp);
      if (file === "index.html" && shotMobile && shotMobileFull) {
        const desktopComposition = await measureComposition(dp);
        if (mobileComposition) composition = { mobile: mobileComposition, desktop: desktopComposition };
        const desktopFirst = await dp.screenshot({ type: "png" });
        await loadLazyImages(dp);
        await hideFixedForFullPage(dp);
        screenshots = { mobile: shotMobile, mobileFull: shotMobileFull, desktop: await dp.screenshot({ type: "png", fullPage: true }), desktopFirst };
      }
      if (pageShotMobile) {
        await loadLazyImages(dp);
        await hideFixedForFullPage(dp);
        pageShots.push({ file, mobile: pageShotMobile, desktop: await dp.screenshot({ type: "png", fullPage: true }) });
      }
      await dctx.close();
      const axeAll = mergeAxe(axe, desktopAxe);
      pages.push({ file, axe: axeAll, mobile, desktop: { horizontalScroll: d.horizontalScroll, scrollWidth: d.scrollWidth, lineLengths: d.lineLengths, banned: d.banned } });
    }

    const lh = opts.lighthouse === false ? null : await runLighthouse(`${server.url}/${spec.slug}/index.html`, cb.port);
    const lighthousePages: SiteCheckReport["lighthousePages"] = [];
    if (opts.lighthouse !== false) for (const file of opts.lighthousePages ?? []) lighthousePages.push({ file, scores: await runLighthouse(`${server.url}/${spec.slug}/${file}`, cb.port) });
    const report: SiteCheckReport = {
      validation,
      facts,
      placeholders,
      lighthousePages,
      pageShots,
      pages,
      lighthouse: lh,
      screenshots: screenshots ?? { mobile: new Uint8Array(), mobileFull: new Uint8Array(), desktop: new Uint8Array(), desktopFirst: new Uint8Array() },
      composition,
      failures: [],
    };
    report.failures = failuresOf(spec, report, opts.config);
    return report;
  } finally {
    await Promise.all(contexts.map((x) => x.close().catch(() => undefined)));
    await server.close();
    if (own) await cb.close();
    await rm(dir, { recursive: true, force: true });
  }
}

function mergeAxe(a: AxeViolation[], b: AxeViolation[]): AxeViolation[] {
  const byId = new Map(a.map((v) => [v.id, v]));
  for (const v of b) if (!byId.has(v.id)) byId.set(v.id, v);
  return [...byId.values()];
}

/** The phase 1 bar, applied to one check report. */
export function failuresOf(spec: SiteSpec, r: SiteCheckReport, config: AppConfig): string[] {
  const f: string[] = [];
  const lhT = config.checks.lighthouse;
  if (r.validation.length) f.push(`spec invalid: ${r.validation.slice(0, 3).map((i) => `${i.path} ${i.message}`).join("; ")}`);
  if (r.facts.length) f.push(`facts not in brief: ${r.facts.slice(0, 5).map((x) => `${x.kind} ${x.value}`).join(", ")}`);
  const hasPhone = typeof spec.business.phone === "string";
  const hasAddress = !("$placeholder" in (spec.business.address as object));
  for (const p of r.pages) {
    if (p.axe.length) f.push(`${p.file}: axe ${p.axe.map((v) => `${v.id}(${v.nodes})`).join(", ")}`);
    if (p.mobile.horizontalScroll) f.push(`${p.file}: horizontal scroll at 360 px (${p.mobile.scrollWidth})`);
    if (p.desktop.horizontalScroll) f.push(`${p.file}: horizontal scroll at 1280 px`);
    if (p.mobile.tinyTargets.length) f.push(`${p.file}: targets < 24px: ${p.mobile.tinyTargets.slice(0, 3).join("; ")}`);
    if (p.mobile.smallPrimaryTargets.length) f.push(`${p.file}: primary targets < 44px: ${p.mobile.smallPrimaryTargets.slice(0, 3).join("; ")}`);
    if (p.mobile.crowdedTargets.length) f.push(`${p.file}: primary targets < 8px apart: ${p.mobile.crowdedTargets.slice(0, 2).join("; ")}`);
    if (p.mobile.smallText.length) f.push(`${p.file}: body text < 16px: ${p.mobile.smallText.slice(0, 3).join("; ")}`);
    if (p.mobile.lang !== spec.locales.default) f.push(`${p.file}: lang is ${p.mobile.lang}`);
    if (hasPhone && !p.mobile.callInViewport) f.push(`${p.file}: click-to-call not reachable in one tap at 360 px`);
    if (hasAddress && !p.mobile.directionsInViewport) f.push(`${p.file}: directions not reachable in one tap at 360 px`);
    const banned = [...new Set([...p.mobile.banned, ...p.desktop.banned])];
    if (banned.length) f.push(`${p.file}: banned patterns: ${banned.slice(0, 4).join("; ")}`);
    const long = p.desktop.lineLengths.filter((n) => n > 75);
    if (long.length) f.push(`${p.file}: desktop line length over 75 chars (${long.join(", ")})`);
  }
  // The homepage's scores, then each other page Lighthouse ran on (a collection entry's page), named.
  const scored = [...(r.lighthouse ? [{ at: "", l: r.lighthouse }] : []), ...(r.lighthousePages ?? []).map((x) => ({ at: `${x.file}: `, l: x.scores }))];
  for (const { at, l } of scored) {
    if (l.performance < lhT.performance) f.push(`${at}lighthouse performance ${l.performance} < ${lhT.performance}`);
    if (l.accessibility < lhT.accessibility) f.push(`${at}lighthouse accessibility ${l.accessibility} < ${lhT.accessibility}`);
    if (l.bestPractices < lhT.bestPractices) f.push(`${at}lighthouse best practices ${l.bestPractices} < ${lhT.bestPractices}`);
    if (l.seo < lhT.seo) f.push(`${at}lighthouse seo ${l.seo} < ${lhT.seo}`);
  }
  return f;
}
