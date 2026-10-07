import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, mediaKey, processPhoto, runAxe, type AxeViolation, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, fakeDns, fakeEdge, fakeRegistrar, migrate, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { adminCookie } from "./session-helpers.ts";
import { fillPlaceholderOps } from "../../../tools/eval/src/placeholder-fill.ts";

/**
 * The editor's accessibility, in Chromium at phone (360 px) and desktop (1280 px) width, as /dostopnost says:
 * - axe (WCAG 2.2 A and AA, plus axe's best practices, the same `runAxe` as the public pages) finds nothing on the
 *   editor's main states: nothing selected, a section selected, "Še to potrebujemo", the publish checklist, the
 *   domain step, and the Podatki, Fotografije and Oblika panes the tasks below go through;
 * - the six owner tasks of owner-tasks-browser.test.ts (phone, Saturday hours, a photo, FAQ, a warmer colour,
 *   publish) can be done with the keyboard alone. Key presses are counted like taps there: Tab, Shift+Tab, Enter,
 *   Space, arrows and Ctrl+A count, the characters of a typed value don't; choosing the file in the system dialog is
 *   one. Every element the keyboard lands on shows a focus indicator and is on screen, not under the sheet or a bar.
 * The budgets only go down. SB_KEYS_OUT=<file> writes the counts as JSON. No model calls.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
let platform: Platform;
let dir: string;
const servers: ServerType[] = [];
let base: string;
let domainBase: string;
let cb: CheckBrowser;
let cookie: string;

type Width = 360 | 1280;
type Task = "phone" | "saturday" | "photo" | "faq" | "colour" | "publish";
/**
 * Key presses per task; budgets only go down. Measured 2026-10-07. Before this test: the warmer colour couldn't be set
 * from the keyboard here (only the browser's colour dialog), and at 360 px focus went under the sheet's handle after a
 * shortcut; phone 13/11, Saturday 36/34, FAQ 43/41 (360/1280), publish 4.
 */
const BUDGET: Record<Width, Record<Task, number>> = {
  360: { phone: 11, saturday: 34, photo: 18, faq: 41, colour: 12, publish: 4 },
  1280: { phone: 10, saturday: 33, photo: 17, faq: 40, colour: 11, publish: 4 },
};

async function listen(app: ReturnType<typeof createApp>): Promise<string> {
  const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  servers.push(server);
  await new Promise<void>((r) => server.once("listening", () => r()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-editor-a11y-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const config = loadConfig();
  const auth = { password: PASSWORD, secret: "s".repeat(32), secureCookies: false };
  base = await listen(createApp({ platform, config, auth }));
  // The same data behind an app with custom domains on (fake registrar, edge and DNS): the domain step.
  const edge = fakeEdge();
  const providers = { registrar: fakeRegistrar(), edge, dns: fakeDns({}, { anyCnameTo: edge.cnameTarget }) };
  domainBase = await listen(createApp({ platform, config: { ...config, domains: { ...config.domains, enabled: true } }, domainProviders: providers, auth }));
  cookie = await adminCookie((p, init) => fetch(`${base}${p}`, init), PASSWORD);
  cb = await launchCheckBrowser();
}, 120_000);

// Chromium takes about 10 s to shut down after a page opened the system file dialog (the photo task): more than the
// default hook time.
afterAll(async () => {
  await cb?.close();
  for (const s of servers) s.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
}, 60_000);

let seq = 0;
/**
 * A fresh copy of a golden site with its fixture's description and photos (as owner-tasks-browser.test.ts seeds it).
 * The bakery's hero gets an AI-generated picture, which the photo task replaces.
 */
async function seed(golden: string, change?: (spec: SiteSpec) => void): Promise<string> {
  const fixture = path.join(here, `../../../tools/eval/fixtures/${golden}`);
  const brief = JSON.parse(await readFile(path.join(fixture, "brief.json"), "utf8")) as { description: string; photos?: { file: string }[] };
  const spec = JSON.parse(await readFile(path.join(here, `../../../tools/eval/golden/${golden}.json`), "utf8")) as SiteSpec;
  spec.slug = `${golden}-${++seq}`;
  if (golden === "pekarna-kvas") {
    spec.assets.images.push({ ...spec.assets.images[0]!, id: "img_g1", origin: "generated" } as SiteSpec["assets"]["images"][number]);
    const hero = home(spec).sections[0]!;
    (hero.props as { image: string }).image = "img_g1";
  }
  change?.(spec);
  const site = await platform.repo.createSite({ name: spec.slug, slug: spec.slug, intake: { description: brief.description, photoAssetIds: [], scope: "home" } });
  const photos = brief.photos ?? [];
  if (photos.length) {
    for (const [i, im] of spec.assets.images.entries()) {
      const photo = photos[i % photos.length]!;
      const processed = await processPhoto(im.id, new Uint8Array(await readFile(path.join(fixture, ...photo.file.split("/")))), [360], { avif: 40, webp: 60 });
      for (const v of processed.variants) await platform.storage.put(mediaKey(site.id, v.file), v.data, v.file.endsWith(".webp") ? "image/webp" : "image/avif");
    }
  }
  await platform.repo.saveSpec(site.id, spec, "generate");
  await platform.repo.setStatus(site.id, "ready");
  return site.id;
}

/** The installer's golden site with every missing fact filled in, so Objavi goes to the domain step. */
async function seedFilled(): Promise<string> {
  const id = await seed("instalacije-rebernik");
  const spec = (await platform.repo.getSpec(id))!.spec;
  const r = await fetch(`${base}/api/sites/${id}/patch`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ baseVersion: 1, ops: fillPlaceholderOps(spec), message: "facts" }) });
  expect(r.status, await r.clone().text()).toBe(200);
  return id;
}

type Page = Awaited<ReturnType<CheckBrowser["browser"]["newPage"]>>;
const home = (s: SiteSpec) => s.pages.find((p) => p.kind === "home")!;
const spec = async (id: string) => (await platform.repo.getSpec(id))!.spec as SiteSpec & Record<string, unknown>;

/** The editor for a site, signed in as the admin, at a phone or desktop width; resolves once the preview is up. */
async function open(siteId: string, width: Width, at = base) {
  const context = await cb.browser.newContext({ viewport: { width, height: width === 360 ? 780 : 900 }, reducedMotion: "reduce", hasTouch: width === 360, isMobile: width === 360 });
  const [name, value] = cookie.split("=") as [string, string];
  await context.addCookies([{ name, value, url: at }]);
  const page = await context.newPage();
  await page.goto(`${at}/sites/${siteId}`);
  await page.frameLocator("iframe[title='Predogled strani']").locator("main").waitFor();
  await page.locator(".shortcut").first().waitFor();
  // The preview's editing layer is attached on the frame's load.
  await page.waitForTimeout(300);
  return { page, close: () => context.close() };
}

const describeAxe = (v: AxeViolation[]) => v.map((x) => `${x.id} (${x.impact}, ${x.nodes}): ${x.targets.join(" | ")}`);

// ---------- axe on the editor's main states ----------
type State = "nothing selected" | "section selected" | "Še to potrebujemo" | "publish checklist" | "domain step" | "Podatki" | "Fotografije" | "Oblika";
async function shortcut(page: Page, name: string, ready: string): Promise<void> {
  await page.locator(".shortcut", { hasText: name }).click();
  await page.locator(ready).first().waitFor();
}
const STATES: Record<State, { seed: () => Promise<string>; domains?: boolean; reach: (page: Page) => Promise<void> }> = {
  "nothing selected": { seed: () => seed("pekarna-kvas"), reach: async () => undefined },
  "section selected": {
    seed: () => seed("pekarna-kvas"),
    reach: async (page) => {
      await page.locator(".outline li").nth(1).click();
      await page.locator("#selected-head").waitFor();
      await page.frameLocator("iframe[title='Predogled strani']").locator(".sb-tools").waitFor();
    },
  },
  "Še to potrebujemo": {
    seed: () => seed("pekarna-kvas"),
    reach: async (page) => {
      await page.locator("#checklist-summary").click();
      await page.locator("#facts-ask").waitFor();
    },
  },
  "publish checklist": {
    // Every fact is there; one photo on the page has no description: the checklist, not the facts form.
    seed: () => seed("zobozdravstvo-lebar", (s) => {
      const shown = JSON.stringify(home(s).sections);
      const im = s.assets.images.find((i) => shown.includes(`"${i.id}"`))!;
      im.alt = "";
    }),
    reach: async (page) => {
      await page.locator("#checklist-summary").click();
      await page.locator("#checklist li button").first().waitFor();
    },
  },
  // The panes the owner tasks below go through.
  Podatki: { seed: () => seed("pekarna-kvas"), reach: (page) => shortcut(page, "Podatki", '[data-path="/business/phone"] input') },
  Fotografije: { seed: () => seed("pekarna-kvas"), reach: (page) => shortcut(page, "Fotografije", "ul.photos") },
  Oblika: { seed: () => seed("pekarna-kvas"), reach: (page) => shortcut(page, "Oblika", "#main-color-code") },
  "domain step": {
    seed: seedFilled,
    domains: true,
    reach: async (page) => {
      await page.getByRole("button", { name: "Objavi", exact: true }).click();
      await page.locator("#domain-confirm").waitFor();
      await page.locator(".domain-choice input:checked").waitFor();
    },
  },
};

const axeResults: Record<string, Record<string, string[]>> = {};

describe("axe on the editor", () => {
  for (const width of [360, 1280] as const) {
    for (const [state, s] of Object.entries(STATES) as [State, (typeof STATES)[State]][]) {
      it(`at ${width} px: ${state}`, async () => {
        const id = await s.seed();
        const ui = await open(id, width, s.domains ? domainBase : base);
        try {
          await s.reach(ui.page);
          await ui.page.waitForTimeout(300);
          const found = describeAxe(await runAxe(ui.page));
          (axeResults[width] ??= {})[state] = found;
          expect(found).toEqual([]);
          expect(await ui.page.evaluate(() => document.documentElement.scrollWidth), "no sideways scroll").toBeLessThanOrEqual(width);
        } finally {
          await ui.close();
        }
      }, 90_000);
    }
  }
});

// ---------- the six owner tasks with the keyboard alone ----------
interface Stop {
  /** What has focus, for messages: tag, id or class, text. */
  what: string;
  inFrame: boolean;
  /** An outline or ring on the element (or, for a visually hidden file input, on its label button). */
  indicator: boolean;
  /** Its middle is on screen and nothing else (the sheet, a bar, a toast) is on top of it. */
  visible: boolean;
}

/** The focused element (inside the preview frame when focus is there) and whether it can be seen. */
function focusStop(page: Page): Promise<Stop | null> {
  return page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>("iframe[title='Predogled strani']");
    let el = document.activeElement as HTMLElement | null;
    let doc: Document = document;
    let inFrame = false;
    if (el && el === frame && frame.contentDocument) {
      doc = frame.contentDocument;
      el = doc.activeElement as HTMLElement | null;
      inFrame = true;
    }
    if (!el || el === doc.body || el === doc.documentElement) return null;
    const win = doc.defaultView!;
    const ring = (e: Element) => {
      const s = win.getComputedStyle(e);
      return (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 1 && s.outlineColor !== "rgba(0, 0, 0, 0)") || s.boxShadow !== "none";
    };
    const r0 = el.getBoundingClientRect();
    const hidden = r0.width <= 1 || r0.height <= 1;
    const shown = hidden ? (el.closest("label") ?? el) : el;
    const indicator = ring(shown);
    const r = shown.getBoundingClientRect();
    const x = r.left + Math.min(r.width / 2, 12);
    const y = r.top + r.height / 2;
    let visible = x >= 0 && y >= 0 && x <= win.innerWidth && y <= win.innerHeight;
    if (visible) {
      const hit = doc.elementFromPoint(x, y);
      visible = !!hit && (hit === shown || shown.contains(hit) || hit.contains(shown));
    }
    if (visible && inFrame && frame) {
      // The frame is scaled into its box: the point must be on screen in the editor too, with the frame on top.
      const f = frame.getBoundingClientRect();
      const scale = f.width / frame.offsetWidth;
      const tx = f.left + x * scale;
      const ty = f.top + y * scale;
      visible = tx >= 0 && ty >= 0 && tx <= innerWidth && ty <= innerHeight && document.elementFromPoint(tx, ty) === frame;
    }
    const text = (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    const what = `${inFrame ? "frame " : ""}${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).join(".")}` : ""} "${text}"`;
    return { what, inFrame, indicator, visible };
  });
}

/** Does the focused element match? `frame` looks inside the preview. */
function focusMatches(page: Page, selector: string, text: string | undefined, frame: boolean): Promise<boolean> {
  return page.evaluate(
    ([sel, txt, inFrame]) => {
      const f = document.querySelector<HTMLIFrameElement>("iframe[title='Predogled strani']");
      let el = document.activeElement;
      if (el === f) {
        if (!inFrame) return false;
        el = f!.contentDocument!.activeElement;
      } else if (inFrame) return false;
      // A visually hidden file input is named by the label button around it.
      return !!el && el.matches(sel as string) && (!txt || ((el.closest("label") ?? el).textContent ?? "").includes(txt as string));
    },
    [selector, text ?? "", frame] as const,
  );
}

async function keyboard(siteId: string, width: Width) {
  const { page, close } = await open(siteId, width);
  let keys = 0;
  const stops: Stop[] = [];
  const press = async (key: string) => {
    keys++;
    await page.keyboard.press(key);
    await page.waitForTimeout(60);
    const s = await focusStop(page);
    if (s) stops.push(s);
  };
  /** Tab forward until the focused element matches; at most `max` presses. */
  const tabTo = async (selector: string, opts: { text?: string; frame?: boolean; max?: number } = {}) => {
    for (let i = 0; i < (opts.max ?? 60); i++) {
      await press("Tab");
      if (await focusMatches(page, selector, opts.text, opts.frame ?? false)) return;
    }
    throw new Error(`Tab never reached ${selector}${opts.text ? ` "${opts.text}"` : ""}; last: ${stops.at(-1)?.what}`);
  };
  /** Types a value into the focused field (not counted), replacing what is there. */
  const type = async (value: string) => {
    await press("Control+A");
    await page.keyboard.type(value);
  };
  return { page, press, tabTo, type, keys: () => keys, stops, close };
}
type Kb = Awaited<ReturnType<typeof keyboard>>;

/** The best keyboard path the editor offers for each task. */
const TASKS: Record<Task, { golden: string; run: (kb: Kb) => Promise<void>; done: (id: string) => Promise<boolean> }> = {
  phone: {
    golden: "pekarna-kvas",
    run: async (kb) => {
      await kb.tabTo(".shortcut", { text: "Podatki" });
      await kb.press("Enter");
      await kb.tabTo('[data-path="/business/phone"] input');
      await kb.type("+38641555000");
    },
    done: async (id) => (await spec(id)).business.phone === "+38641555000",
  },
  saturday: {
    golden: "pekarna-kvas",
    run: async (kb) => {
      await kb.tabTo(".shortcut", { text: "Podatki" });
      await kb.press("Enter");
      await kb.tabTo('[data-path="/business/hours/entries/1/close"] input', { max: 80 });
      await kb.type("13:00");
    },
    done: async (id) => JSON.stringify((await spec(id)).business.hours).includes('"close":"13:00"'),
  },
  photo: {
    golden: "pekarna-kvas",
    run: async (kb) => {
      await kb.tabTo(".shortcut", { text: "Fotografije" });
      await kb.press("Enter");
      await kb.tabTo("label.file-btn input[type=file]", { text: "Zamenjaj s svojo fotografijo", max: 80 });
      const chooser = kb.page.waitForEvent("filechooser");
      await kb.press("Space");
      await (await chooser).setFiles(path.join(here, "../../../tools/eval/fixtures/frizerstvo-lana/photos/01.jpg"));
    },
    done: async (id) => (await spec(id)).assets.images.every((i) => (i as { origin?: string }).origin !== "generated"),
  },
  faq: {
    golden: "pekarna-kvas",
    run: async (kb) => {
      await kb.tabTo("button", { text: "+ Dodaj razdelek" });
      await kb.press("Enter");
      await kb.tabTo(".add-grid button", { text: "Pogosta vprašanja" });
      await kb.press("Enter");
    },
    done: async (id) => home(await spec(id)).sections.some((s) => s.type === "faq"),
  },
  colour: {
    golden: "pekarna-kvas",
    run: async (kb) => {
      await kb.tabTo(".shortcut", { text: "Oblika" });
      await kb.press("Enter");
      // The browser's colour dialog can't be driven here; the colour's code field next to it can.
      await kb.tabTo("#main-color-code");
      await kb.type("#c2410c");
    },
    done: async (id) => (await spec(id)).design.colors.primary !== "#b4441f",
  },
  publish: {
    golden: "zobozdravstvo-lebar",
    run: async (kb) => {
      await kb.tabTo("button.publish");
      await kb.press("Enter");
    },
    done: async (id) => (await platform.repo.getSite(id))?.published_version != null,
  },
};

const keyResults: Record<string, Record<string, number>> = {};

describe("owner tasks with the keyboard alone", () => {
  for (const width of [360, 1280] as const) {
    for (const [task, t] of Object.entries(TASKS) as [Task, (typeof TASKS)[Task]][]) {
      it(`at ${width} px: ${task}`, async () => {
        const id = await seed(t.golden);
        const kb = await keyboard(id, width);
        try {
          await t.run(kb);
          await expect.poll(() => t.done(id), { timeout: 45_000 }).toBe(true);
          (keyResults[width] ??= {})[task] = kb.keys();
          const unseen = kb.stops.filter((s) => !s.indicator || !s.visible).map((s) => `${s.what}${s.indicator ? "" : " [no focus ring]"}${s.visible ? "" : " [not on screen]"}`);
          expect(unseen, "every stop shows its focus and is on screen").toEqual([]);
          expect(kb.keys()).toBeLessThanOrEqual(BUDGET[width][task]);
        } finally {
          await kb.close();
        }
      }, 90_000);
    }
  }
  it("writes the numbers", async () => {
    const out = process.env.SB_KEYS_OUT;
    if (!out) return;
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, `${JSON.stringify({ keys: keyResults, axe: axeResults }, null, 2)}\n`);
  });
});
