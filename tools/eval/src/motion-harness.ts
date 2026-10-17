/**
 * The motion test harness (docs/plans/studio-phase1-design.md §5, unit I7): every preset in MOTIONS on a page of
 * composed sections, in a browser at 360 and 1280 px with the CPU throttled 4x (CDP Emulation.setCPUThrottlingRate).
 * Per preset and width it measures
 *   - CLS (PerformanceObserver layout-shift, the whole page scrolled through): must be 0;
 *   - LCP against the same page with motion off: the median of RUNS loads each, difference at most LCP_BUDGET_MS;
 *   - that the preset animates at all with motion allowed (a cx-mo-<name> CSSAnimation exists);
 *   - with prefers-reduced-motion: reduce: no running animation, and a full-page screenshot equal to the page without
 *     the preset (pixel compare; the share of differing pixels is reported, at most REDUCED_DIFF_MAX).
 * The motion goes on sections 1 and 2 (the opener stays plain), and also on section 0 when the preset is safe at load.
 * No model call. The test is tools/eval/test/motion.test.ts.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import sharp from "sharp";
import { serveStatic } from "@sb/engine";
import { ComposedProps, MOTION_META, MOTIONS, migrateSpec, validateSite, type Section, type SiteSpec } from "@sb/spec";
import { renderToDir } from "./lib/render-dir.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.resolve(here, "../golden/avtoservis-mrak.json");

export const WIDTHS = [360, 1280] as const;
export type Width = (typeof WIDTHS)[number];
/** The CPU slowdown the metrics are taken under. */
export const CPU_THROTTLE = 4;
/** LCP loads per variant (the median is compared). */
export const RUNS = 3;
export const LCP_BUDGET_MS = 100;
/** The most pixels of a full-page screenshot that may differ under reduced motion (a share, 0.001 = 0.1 %). */
export const REDUCED_DIFF_MAX = 0.001;
/** A channel must differ by more than this (of 255) for a pixel to count as different. */
const PIXEL_TOLERANCE = 8;

type El = Record<string, unknown>;
const el = (id: string, props: El, col: number, span: number, row: number, order: number, rowSpan?: number): El => ({
  id,
  ...props,
  desk: { col, span, row, ...(rowSpan ? { rowSpan } : {}) },
  phone: { order, span: "full" },
});

/**
 * A composed section of the kinds a preset animates: heading and text and, with `image`, a list, a fact and that image
 * beside them; optionally a photo background layer under a scrim.
 */
function showcase(id: string, motion: string | undefined, o: { image?: string; layer?: string; tone?: "inverse" } = {}): Section {
  const elements = [
    el("e_h", { kind: "heading", text: "Kruh, ki vzhaja čez noč", level: 2, size: 4 }, 1, 6, 1, 0),
    el("e_t", { kind: "text", paragraphs: ["Vsako jutro zamesimo, počakamo in spečemo. Nič ne pospešujemo."] }, 1, 6, 2, 1),
    ...(o.image
      ? [
          el("e_l", { kind: "list", items: ["Beli kruh", "Kvasni kruh", "Pecivo"] }, 1, 6, 3, 2),
          el("e_f", { kind: "fact", value: "041 555 730", label: "Pokličite", treatment: "plate", size: 3 }, 1, 4, 4, 3),
          // A countable numeral beside the phone number: the counter preset counts this one and must leave the phone alone.
          el("e_n", { kind: "fact", value: "12", label: "vrst kruha", treatment: "numeral", size: 3 }, 1, 4, 5, 4),
          el("e_i", { kind: "image", image: o.image, ratio: "4:3", mask: "none" }, 8, 5, 1, 5, 4),
        ]
      : []),
  ];
  const props = ComposedProps.parse({
    intent: "story",
    width: "contained",
    rows: o.image ? 5 : 2,
    elements,
    ...(o.layer ? { background: [{ kind: "photo", image: o.layer, scrim: { role: "inverse", strength: 3 } }] } : {}),
    ...(motion ? { motion } : {}),
  });
  return { id, type: "composed", variant: "free", ...(o.tone ? { tone: o.tone } : {}), props } as Section;
}

/**
 * The page a preset runs on (null: the same page, no motion): an opener with a photo behind its heading (the LCP), two
 * showcase sections, then two more so the page scrolls well past the animated ones. Motion level lively, so scroll
 * presets are allowed. `like` names the preset whose page structure to use (the baseline of a preset that adds a background
 * photo to its sections is that same page without the preset's class).
 */
export function motionSpec(preset: string | null, like: string | null = preset): SiteSpec {
  const spec = migrateSpec(JSON.parse(readFileSync(GOLDEN, "utf8"))) as SiteSpec;
  const [a, b, c] = spec.assets.images.map((i) => i.id) as [string, string, string];
  const meta = like === null ? undefined : MOTION_META[like as keyof typeof MOTION_META];
  // A preset without element targets moves the background photo: its sections get one (on an inverse ground, for the text).
  const ground = meta?.targets.length === 0 ? { layer: c, tone: "inverse" as const } : {};
  const home = spec.pages.find((p) => p.kind === "home")!;
  home.sections = [
    showcase("s_h0", meta?.safeAtLoad ? preset! : undefined, { layer: a, tone: "inverse" }),
    showcase("s_h1", preset ?? undefined, { image: b, ...ground }),
    showcase("s_h2", preset ?? undefined, { image: b, ...ground }),
    showcase("s_h3", undefined),
    showcase("s_h4", undefined),
  ];
  spec.design = { ...spec.design, motion: "lively" };
  const v = validateSite(spec);
  if (!v.ok) throw new Error(`Motion page for ${preset ?? "off"} is not valid: ${v.issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
  return (v.spec ?? spec) as SiteSpec;
}

export interface MotionRun {
  preset: string;
  width: Width;
  cls: number;
  /** The layout shifts behind cls (value, element, rect before → after), empty when cls is 0. */
  shifts: string[];
  lcpMs: number;
  lcpOffMs: number;
  lcpDelta: number;
  /** cx-mo animations alive with motion allowed (the preset does something). */
  animations: number;
  /** Running animations under reduced motion (must be none). */
  reducedRunning: number;
  /** The share of full-page screenshot pixels that differ from the page without the preset, under reduced motion. */
  reducedDiff: number;
}

export interface Harness {
  /** Measures one preset at one width. */
  measure(preset: string, width: Width): Promise<MotionRun>;
  /**
   * The counter preset's page at 1280 px: which fact values the island picked up (aria-label set), what the values read
   * shortly after the section came into view, and what they read once the count has finished.
   */
  counter(reduce: boolean): Promise<{ picked: string[]; mid: string[]; end: string[] }>;
  close(): Promise<void>;
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

declare global {
  interface Window {
    __cls: number;
    __lcp: number;
    __shifts: string[];
  }
}

/** Renders the off page and every preset's page, serves them, and starts the browser. */
export async function startHarness(presets: readonly string[] = MOTIONS): Promise<Harness> {
  const dir = await mkdtemp(path.join(tmpdir(), "sb-motion-"));
  const variants = [...presets, ...presets.map((p) => `off:${p}`)];
  const slugs = new Map<string, string>();
  for (const v of variants) {
    const spec = v.startsWith("off:") ? motionSpec(null, v.slice(4)) : motionSpec(v);
    slugs.set(v, spec.slug);
    await renderToDir(spec, path.join(dir, v.replace(":", "-")));
  }
  const server = await serveStatic(dir);
  const browser: Browser = await chromium.launch();
  const url = (v: string) => `${server.url}/${v.replace(":", "-")}/${slugs.get(v)}/index.html`;

  /** One load with the CPU throttled: LCP first (before any input), then the page scrolled through for CLS. */
  async function load(v: string, width: Width): Promise<{ lcp: number; cls: number; animations: number; shifts: string[] }> {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 1, reducedMotion: "no-preference" });
    try {
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        window.__cls = 0;
        window.__lcp = 0;
        window.__shifts = [];
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            const s = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
            if (s.hadRecentInput) continue;
            window.__cls += s.value;
            // Which elements moved, so a failing run names its cause: tag.class, and the rect before → after.
            const sources = (e as PerformanceEntry & { sources?: { node?: Node; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[] }).sources ?? [];
            for (const src of sources) {
              const el = src.node instanceof Element ? src.node : src.node?.parentElement;
              const name = el ? `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).join(".")}` : ""}` : "?";
              const r = (x: DOMRectReadOnly) => `${Math.round(x.x)},${Math.round(x.y)} ${Math.round(x.width)}×${Math.round(x.height)}`;
              window.__shifts.push(`${s.value.toFixed(5)} ${name} ${r(src.previousRect)} → ${r(src.currentRect)}`);
            }
          }
        }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.__lcp = e.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
      });
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
      await page.goto(url(v), { waitUntil: "load" });
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(400);
      const lcp = await page.evaluate(() => window.__lcp);
      const animations = await page.evaluate(() => document.getAnimations().filter((a) => a instanceof CSSAnimation && a.animationName.startsWith("cx-mo-")).length);
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < height; y += 300) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(60);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      const cls = await page.evaluate(() => window.__cls);
      const shifts = await page.evaluate(() => window.__shifts);
      return { lcp, cls, animations, shifts };
    } finally {
      await ctx.close();
    }
  }

  /** Reduced motion: the running animations, and a full-page screenshot (taken after a pass over the page, so lazy images are in). */
  async function reduced(v: string, width: Width): Promise<{ running: number; png: Buffer }> {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    try {
      const page = await ctx.newPage();
      await page.goto(url(v), { waitUntil: "load" });
      await page.waitForLoadState("networkidle");
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < height; y += 400) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(40);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
      return { running, png: await page.screenshot({ fullPage: true }) };
    } finally {
      await ctx.close();
    }
  }

  return {
    async measure(preset, width) {
      const on: number[] = [];
      const off: number[] = [];
      let cls = 0;
      let animations = 0;
      const shifts: string[] = [];
      for (let i = 0; i < RUNS; i++) {
        const a = await load(preset, width);
        const b = await load(`off:${preset}`, width);
        on.push(a.lcp);
        off.push(b.lcp);
        cls = Math.max(cls, a.cls);
        shifts.push(...a.shifts);
        animations = Math.max(animations, a.animations);
      }
      const motion = await reduced(preset, width);
      const still = await reduced(`off:${preset}`, width);
      const lcpMs = median(on);
      const lcpOffMs = median(off);
      return { preset, width, cls, shifts, lcpMs, lcpOffMs, lcpDelta: lcpMs - lcpOffMs, animations, reducedRunning: motion.running, reducedDiff: await pixelDiff(motion.png, still.png) };
    },
    async counter(reduce) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: reduce ? "reduce" : "no-preference" });
      try {
        const page = await ctx.newPage();
        await page.goto(url("counter"), { waitUntil: "load" });
        await page.waitForLoadState("networkidle");
        const values = ".cx-mo-counter .cx-fact__value, .cx-mo-counter .plate__num";
        const read = () => page.evaluate((q) => [...document.querySelectorAll(q)].map((e) => (e.textContent ?? "").trim()), values);
        await page.evaluate(() => document.querySelector(".cx-mo-counter")!.scrollIntoView());
        await page.waitForTimeout(250);
        const mid = await read();
        const picked = await page.evaluate(() => [...document.querySelectorAll(".cx-mo-counter [aria-label]")].map((e) => e.getAttribute("aria-label")!));
        await page.waitForTimeout(1600);
        return { picked, mid, end: await read() };
      } finally {
        await ctx.close();
      }
    },
    async close() {
      await browser.close();
      await server.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/** The share of pixels that differ by more than PIXEL_TOLERANCE in any channel; 1 when the sizes differ. */
export async function pixelDiff(a: Buffer, b: Buffer): Promise<number> {
  const [x, y] = await Promise.all([sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true })]);
  if (x.info.width !== y.info.width || x.info.height !== y.info.height) return 1;
  let different = 0;
  for (let i = 0; i < x.data.length; i += 4) {
    if (Math.abs(x.data[i]! - y.data[i]!) > PIXEL_TOLERANCE || Math.abs(x.data[i + 1]! - y.data[i + 1]!) > PIXEL_TOLERANCE || Math.abs(x.data[i + 2]! - y.data[i + 2]!) > PIXEL_TOLERANCE) different++;
  }
  return different / (x.info.width * x.info.height);
}

/** Where the numbers of a run are written (eval/runs is gitignored). */
export async function writeReport(runs: MotionRun[]): Promise<string> {
  const file = path.resolve(here, "../../../eval/runs/motion/report.json");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(runs, null, 2));
  return file;
}

