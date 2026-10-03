/**
 * Opens offline exports (the zip an owner downloads) in a real Firefox from file:// and checks what Chromium-only
 * tests can't: Firefox treats every file:// page as its own origin, so fonts, the stylesheet and the island scripts
 * in `_shared/` (a parent folder) must still load. Per export, at 360 and 1280 px: the root index.html lands on the
 * site, every stylesheet and font loads, the heading uses the site's font, the islands ran, no image is broken,
 * nothing scrolls sideways. Screenshots in eval/runs/firefox-export/.
 *
 * Needs a Firefox binary (not in CI): FIREFOX_BIN=/path/to/firefox pnpm check:firefox [fixture ids]
 * It drives Firefox over WebDriver BiDi (its built-in remote protocol); Playwright's Firefox is a patched build.
 * No model calls.
 */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { processLogo, processPhoto } from "@sb/engine";
import { exportFiles } from "@sb/render";
import { fontPair, migrateSpec, type SiteSpec } from "@sb/spec";
import { loadFixture } from "./fixtures/load.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DEFAULT_IDS = ["pekarna-kvas", "racunovodstvo-seliskar", "kmetija-grabnar"];
const WIDTHS = [360, 1280];

/** The export (the zip's files) of a golden spec with the fixture's own photos, written into `dir`. */
async function exportTo(id: string, dir: string): Promise<SiteSpec> {
  const config = loadConfig();
  const fixture = loadFixture(id);
  const spec = migrateSpec(JSON.parse(await readFile(path.join(repoRoot, "tools/eval/golden", `${id}.json`), "utf8"))) as SiteSpec;
  const media = new Map<string, Uint8Array>();
  for (const [i, img] of spec.assets.images.entries()) {
    const photo = fixture.photos[i];
    if (!photo) break;
    const p = await processPhoto(img.id, new Uint8Array(await readFile(photo.path)), config.images.widths, { avif: config.images.avifQuality, webp: config.images.webpQuality });
    for (const v of p.variants) media.set(v.file, v.data);
    img.width = p.width;
    img.height = p.height;
  }
  if (spec.assets.logo && fixture.logoPath) {
    const logo = await processLogo(new Uint8Array(await readFile(fixture.logoPath)), "image/svg+xml");
    media.set(logo.file, logo.data);
    spec.assets.logo = { ...spec.assets.logo, file: logo.file, width: logo.width, height: logo.height };
  }
  for (const [rel, data] of exportFiles(spec, media, { imageWidths: config.images.widths })) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), data);
  }
  return spec;
}

/** A WebDriver BiDi session on a headless Firefox. */
async function startFirefox(bin: string) {
  const port = 9333 + Math.floor(Math.random() * 500);
  const profile = await mkdtemp(path.join(tmpdir(), "sb-ff-"));
  const ff = spawn(bin, ["--headless", "--no-remote", "--profile", profile, "--remote-debugging-port", String(port)], { stdio: "ignore" });
  let ws: WebSocket | undefined;
  for (let i = 0; i < 60 && !ws; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const s = new WebSocket(`ws://127.0.0.1:${port}/session`);
    ws = await new Promise<WebSocket | undefined>((res) => {
      s.onopen = () => res(s);
      s.onerror = () => res(undefined);
    });
  }
  if (!ws) throw new Error(`Firefox did not open WebDriver BiDi on port ${port}`);
  const socket = ws;
  let next = 0;
  type Reply = { id?: number; result?: Record<string, unknown>; error?: string; message?: string };
  const pending = new Map<number, (d: Reply) => void>();
  socket.onmessage = (m) => {
    const d = JSON.parse(String(m.data)) as Reply;
    if (d.id !== undefined) pending.get(d.id)?.(d);
  };
  const send = (method: string, params: Record<string, unknown>) =>
    new Promise<Record<string, unknown>>((res, rej) => {
      const i = ++next;
      pending.set(i, (d) => (d.error ? rej(new Error(`${method}: ${d.error} ${d.message ?? ""}`)) : res(d.result ?? {})));
      socket.send(JSON.stringify({ id: i, method, params }));
    });
  const session = (await send("session.new", { capabilities: {} })) as { capabilities?: { browserVersion?: string } };
  const tree = (await send("browsingContext.getTree", {})) as { contexts: { context: string }[] };
  const context = tree.contexts[0]!.context;
  return {
    send,
    context,
    version: session.capabilities?.browserVersion ?? "unknown",
    close: async () => {
      await send("session.end", {}).catch(() => undefined);
      ff.kill();
      await rm(profile, { recursive: true, force: true });
    },
  };
}

interface Probe {
  at: string;
  sheets: [string | null, number | string][];
  fonts: string[];
  h1: string;
  js: boolean;
  broken: string[];
  scrollWidth: number;
  width: number;
}

const PROBE = `(async () => {
  for (const img of document.images) img.loading = "eager";
  await new Promise((r) => setTimeout(r, 1500));
  await Promise.allSettled([...document.fonts].map((f) => f.load()));
  await Promise.allSettled([...document.images].map((i) => i.decode()));
  const h = document.querySelector("h1");
  return JSON.stringify({
    at: location.pathname.split("/").slice(-2).join("/"),
    sheets: [...document.styleSheets].map((s) => { try { return [s.href, s.cssRules.length]; } catch (e) { return [s.href, "blocked: " + e.name]; } }),
    fonts: [...document.fonts].map((f) => f.family.replace(/"/g, "") + ": " + f.status),
    h1: h ? getComputedStyle(h).fontFamily : "",
    js: document.documentElement.classList.contains("js"),
    broken: [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute("src")),
    scrollWidth: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
  });
})()`;

async function main(): Promise<void> {
  const bin = process.env.FIREFOX_BIN;
  if (!bin) throw new Error("Set FIREFOX_BIN to a Firefox binary (e.g. an unpacked firefox-esr tarball's firefox).");
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_IDS;
  const outDir = path.join(repoRoot, "eval/runs/firefox-export");
  await mkdir(outDir, { recursive: true });
  const ff = await startFirefox(bin);
  const failures: string[] = [];
  try {
    console.log(`Firefox ${ff.version} over WebDriver BiDi`);
    for (const id of ids) {
      const dir = await mkdtemp(path.join(tmpdir(), `sb-export-${id}-`));
      try {
        const spec = await exportTo(id, dir);
        const heading = fontPair(spec.design.fontPair).heading.family;
        for (const width of WIDTHS) {
          await ff.send("browsingContext.setViewport", { context: ff.context, viewport: { width, height: 800 } });
          // The root index.html of the export, as an owner opens it after unzipping.
          await ff.send("browsingContext.navigate", { context: ff.context, url: `file://${path.join(dir, "index.html")}`, wait: "complete" });
          await new Promise((r) => setTimeout(r, 1000));
          const r = (await ff.send("script.evaluate", { expression: PROBE, target: { context: ff.context }, awaitPromise: true })) as { result?: { value?: string } };
          const p = JSON.parse(r.result?.value ?? "{}") as Probe;
          const problems = [
            p.at !== `${spec.slug}/index.html` && `root index.html landed on ${p.at}`,
            ...p.sheets.filter(([, n]) => typeof n !== "number").map(([href, n]) => `stylesheet ${href}: ${n}`),
            ...p.fonts.filter((f) => !f.endsWith(": loaded")).map((f) => `font ${f}`),
            !p.h1.includes(heading) && `h1 font is ${p.h1}, not ${heading}`,
            !p.js && "island scripts did not run (no .js class)",
            ...p.broken.map((src) => `broken image ${src}`),
            p.scrollWidth > p.width && `scrolls sideways (${p.scrollWidth} > ${p.width})`,
          ].filter((x): x is string => typeof x === "string");
          const shot = (await ff.send("browsingContext.captureScreenshot", { context: ff.context })) as { data: string };
          await writeFile(path.join(outDir, `${id}-${width}.png`), Buffer.from(shot.data, "base64"));
          console.log(`${id} ${width}px: ${p.fonts.length} fonts, ${p.sheets.length} stylesheets ${problems.length ? `FAIL\n  ${problems.join("\n  ")}` : "ok"}`);
          failures.push(...problems.map((x) => `${id} ${width}px: ${x}`));
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  } finally {
    await ff.close();
  }
  if (failures.length) {
    console.error(`\n${failures.length} problem(s)`);
    process.exit(1);
  }
  console.log(`\nAll exports open cleanly in Firefox. Screenshots in ${path.relative(repoRoot, outDir)}/`);
}

await main();
