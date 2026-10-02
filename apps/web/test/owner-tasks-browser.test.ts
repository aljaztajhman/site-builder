import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, mediaKey, processPhoto, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { adminCookie } from "./session-helpers.ts";

/**
 * Six everyday owner tasks in the editor, in Chromium at phone and desktop width, counting taps
 * (typing is not counted; choosing a file is one tap). Also counts how many controls the editor shows
 * before anything is tapped. The budgets below only go down: a change that makes a task take more
 * taps, or puts more controls on screen, fails here. SB_TAPS_OUT=<file> writes the numbers as JSON.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;
let cookie: string;

type Width = 375 | 1280;
type Task = "phone" | "saturday" | "photo" | "faq" | "colour" | "publish";
/**
 * Taps per task and controls on the first screen; budgets only go down (docs/design/editor-simple.html: target ≤ 3 taps).
 * Before the simple editor (2026-10-01): taps 2/2/3/3/2/1 at both widths, controls 23 (375) and 54 (1280).
 */
const BUDGET: Record<Width, Record<Task | "controls", number>> = {
  375: { phone: 1, saturday: 2, photo: 3, faq: 2, colour: 2, publish: 1, controls: 14 },
  1280: { phone: 1, saturday: 2, photo: 3, faq: 2, colour: 2, publish: 1, controls: 24 },
};

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-owner-tasks-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config: loadConfig(), auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cookie = await adminCookie((p, init) => fetch(`${base}${p}`, init), PASSWORD);
  cb = await launchCheckBrowser();
}, 120_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

let seq = 0;
/**
 * A fresh copy of a golden site with the fixture's own description (the fact check reads it) and its
 * photos processed into storage (publishing needs them). The bakery's hero gets an AI-generated
 * picture, which the photo task replaces.
 */
async function seed(golden: string): Promise<string> {
  const fixture = path.join(here, `../../../tools/eval/fixtures/${golden}`);
  const brief = JSON.parse(await readFile(path.join(fixture, "brief.json"), "utf8")) as { description: string; photos: { file: string }[] };
  const spec = JSON.parse(await readFile(path.join(here, `../../../tools/eval/golden/${golden}.json`), "utf8")) as SiteSpec;
  spec.slug = `${golden}-${++seq}`;
  if (golden === "pekarna-kvas") {
    // Generated pictures may only fill hero and image-text slots, so the hero gets its own.
    spec.assets.images.push({ ...spec.assets.images[0]!, id: "img_g1", origin: "generated" } as SiteSpec["assets"]["images"][number]);
    const hero = home(spec).sections[0]!;
    (hero.props as { image: string }).image = "img_g1";
  }
  const site = await platform.repo.createSite({ name: spec.slug, slug: spec.slug, intake: { description: brief.description, photoAssetIds: [], scope: "home" } });
  // One small width is enough for the preview to show the photos; all four made this test take minutes in CI.
  const widths = [360];
  for (const [i, im] of spec.assets.images.entries()) {
    const photo = brief.photos[i % brief.photos.length]!;
    const processed = await processPhoto(im.id, new Uint8Array(await readFile(path.join(fixture, ...photo.file.split("/")))), widths, { avif: 40, webp: 60 });
    for (const v of processed.variants) await platform.storage.put(mediaKey(site.id, v.file), v.data, v.file.endsWith(".webp") ? "image/webp" : "image/avif");
  }
  await platform.repo.saveSpec(site.id, spec, "generate");
  await platform.repo.setStatus(site.id, "ready");
  return site.id;
}

type Page = Awaited<ReturnType<CheckBrowser["browser"]["newPage"]>>;
type Locator = ReturnType<Page["locator"]>;

async function open(siteId: string, width: Width) {
  const context = await cb.browser.newContext({ viewport: { width, height: width === 375 ? 812 : 900 }, reducedMotion: "reduce", hasTouch: width === 375 });
  const [name, value] = cookie.split("=") as [string, string];
  await context.addCookies([{ name, value, url: base }]);
  const page = await context.newPage();
  await page.goto(`${base}/sites/${siteId}`);
  await page.frameLocator("iframe[title='Predogled strani']").locator("main").waitFor();
  let taps = 0;
  const tap = async (l: Locator) => {
    taps++;
    await l.click();
  };
  const choose = async (l: Locator, files: string) => {
    taps++;
    await l.setInputFiles(files);
  };
  const select = async (l: Locator, value: string) => {
    taps += 2; // open the list, pick the option
    await l.selectOption(value);
  };
  return { page, tap, choose, select, taps: () => taps, close: () => context.close() };
}
type Ui = Awaited<ReturnType<typeof open>>;

const preview = (ui: Ui) => ui.page.frameLocator("iframe[title='Predogled strani']");
const spec = async (id: string) => (await platform.repo.getSpec(id))!.spec as SiteSpec & Record<string, unknown>;
const home = (s: SiteSpec) => s.pages.find((p) => p.kind === "home")!;

/** Controls the owner sees before tapping anything: visible links, buttons, fields, outside the preview. */
async function controlsOnScreen(page: Page): Promise<number> {
  return page.evaluate(() =>
    [...document.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,summary")].filter((el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width >= 4 && r.height >= 4 && st.visibility !== "hidden" && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    }).length,
  );
}

/** The best path the current editor offers for each task; update it with the editor, never the budget upward. */
const TASKS: Record<Task, { golden: string; run: (ui: Ui) => Promise<void>; done: (id: string) => Promise<boolean> }> = {
  phone: {
    golden: "pekarna-kvas",
    run: async (ui) => {
      // Tap the number on the page: its field opens, focused.
      await ui.tap(preview(ui).locator(".action-bar a[href^='tel:']"));
      await ui.page.locator('[data-path="/business/phone"] input').fill("+38641555000");
    },
    done: async (id) => (await spec(id)).business.phone === "+38641555000",
  },
  saturday: {
    golden: "pekarna-kvas",
    run: async (ui) => {
      // Tap the hours on the page, then Saturday's closing time.
      await ui.tap(preview(ui).locator("main .hours").first());
      const input = ui.page.locator('[data-path="/business/hours/entries/1/close"] input');
      await ui.tap(input);
      await input.fill("13:00");
    },
    done: async (id) => JSON.stringify((await spec(id)).business.hours).includes('"close":"13:00"'),
  },
  photo: {
    golden: "pekarna-kvas",
    run: async (ui) => {
      // Tap the picture on the page, then "Zamenjaj s svojo fotografijo".
      await ui.tap(preview(ui).locator("main section img").first());
      const button = ui.page.locator("label.file-btn", { hasText: "Zamenjaj s svojo fotografijo" });
      await ui.tap(button);
      await ui.choose(button.locator("input[type=file]"), path.join(here, "../../../tools/eval/fixtures/frizerstvo-lana/photos/01.jpg"));
    },
    done: async (id) => (await spec(id)).assets.images.every((i) => (i as { origin?: string }).origin !== "generated"),
  },
  faq: {
    golden: "pekarna-kvas",
    run: async (ui) => {
      await ui.tap(ui.page.getByRole("button", { name: "+ Dodaj razdelek" }));
      await ui.tap(ui.page.locator(".add-grid button", { hasText: "Pogosta vprašanja" }));
    },
    done: async (id) => home(await spec(id)).sections.some((s) => s.type === "faq"),
  },
  colour: {
    golden: "pekarna-kvas",
    run: async (ui) => {
      await ui.tap(ui.page.locator(".shortcut", { hasText: "Oblika" }));
      const input = ui.page.locator('[data-path="/design/colors/primary"] input[type=color]');
      await ui.tap(input);
      await input.fill("#c2410c");
    },
    done: async (id) => (await spec(id)).design.colors.primary !== "#b4441f",
  },
  publish: {
    golden: "zobozdravstvo-lebar",
    run: async (ui) => {
      await ui.tap(ui.page.getByRole("button", { name: "Objavi", exact: true }));
    },
    done: async (id) => (await platform.repo.getSite(id))?.published_version != null,
  },
};

const results: Record<string, Record<string, number>> = {};

describe("owner tasks in the editor", () => {
  for (const width of [375, 1280] as const) {
    it(`at ${width} px: controls on the first screen`, async () => {
      const ui = await open(await seed("pekarna-kvas"), width);
      try {
        const n = await controlsOnScreen(ui.page);
        (results[width] ??= {}).controls = n;
        expect(n).toBeLessThanOrEqual(BUDGET[width].controls);
      } finally {
        await ui.close();
      }
    }, 60_000);
    for (const [task, t] of Object.entries(TASKS) as [Task, (typeof TASKS)[Task]][]) {
      it(`at ${width} px: ${task}`, async () => {
        const id = await seed(t.golden);
        const ui = await open(id, width);
        try {
          await t.run(ui);
          // Generous: replacing the photo makes the server encode AVIF and WebP at four widths (about 10 s on
          // 4 cores), and a busy CI runner took over 15 s. Taps are the measure here, not seconds.
          await expect.poll(() => t.done(id), { timeout: 45_000 }).toBe(true);
          (results[width] ??= {})[task] = ui.taps();
          expect(ui.taps()).toBeLessThanOrEqual(BUDGET[width][task]);
        } finally {
          await ui.close();
        }
      }, 90_000);
    }
  }
  it("writes the numbers", async () => {
    const out = process.env.SB_TAPS_OUT;
    if (!out) return;
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, `${JSON.stringify(results, null, 2)}\n`);
  });
});
