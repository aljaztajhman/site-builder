/**
 * pnpm studio:poc --fixture <id> [--replay] [--max-eur 0.40]   (or --all)
 *
 * Design studio 0.5 (docs/plans/studio-0.5.md) on an eval fixture: the fixture's golden spec stands in for today's
 * pipeline output; the studio builds the approved shortlist, asks the director (one Opus call, stage `director`), composes
 * the homepage over the golden and runs the guards, exactly as the worker does for a trial account. Without --replay the
 * call is real (≈ €0.05–0.15 each) and recorded to tools/eval/recordings-studio/<id>/ (the unit tests replay
 * these); --replay answers from that recording for free. The run stops before a call that would take it past --max-eur.
 *
 * Writes eval/runs/studio-poc/: `<id>.spec.json`, `<id>.studio.json` (idea, stance, presets, dropped picks, €) and
 * screenshots of the composed homepage and of today's (the golden) at 1280 and 360 px, first screen and whole page:
 * `<id>-desk.png`, `<id>-deskFull.png`, `<id>-phone.png`, `<id>-phoneFull.png`, and `<id>-today-*.png`.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { loadConfig, repoRoot } from "@sb/config";
import { AnthropicTransport, ModelClient, RecordingTransport, ReplayTransport, runStudio, serveStatic, type ModelTransport } from "@sb/engine";
import { COMPOSER_FIXTURES, composerFixture } from "@sb/inventory";
import type { SiteSpec } from "@sb/spec";
import { writeComposedSite } from "./studio-compose.ts";
import { shoot } from "./okus-items.ts";

const args = process.argv.slice(2);
const val = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const replay = args.includes("--replay");
const maxEur = Number(val("--max-eur") ?? 0.4);
const fixtures = args.includes("--all") ? [...COMPOSER_FIXTURES] : [val("--fixture") ?? ""];
if (fixtures.some((f) => !(COMPOSER_FIXTURES as readonly string[]).includes(f)) || !Number.isFinite(maxEur)) {
  console.error(`Usage: studio:poc --fixture <id> | --all [--replay] [--max-eur 0.40]\nfixtures: ${COMPOSER_FIXTURES.join(", ")}`);
  process.exit(1);
}
if (!replay && !process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Use --replay to run on the recorded answers.");
  process.exit(2);
}

export const STUDIO_RECORDINGS = path.join(repoRoot, "tools/eval/recordings-studio");
const out = path.join(repoRoot, "eval/runs/studio-poc");
const config = loadConfig();
let eur = 0;

async function shots(entries: { id: string; fixtureId: string; spec: SiteSpec }[]): Promise<void> {
  const work = await mkdtemp(path.join(tmpdir(), "sb-studio-poc-"));
  const server = await serveStatic(work);
  const browser = await chromium.launch();
  try {
    for (const e of entries) {
      const home = await writeComposedSite(e.fixtureId, structuredClone(e.spec), path.join(work, e.id));
      await shoot(browser, e.id, `${server.url}/${e.id}/${home}`, out, null);
    }
  } finally {
    await browser.close();
    await server.close();
    await rm(work, { recursive: true, force: true });
  }
}

await mkdir(out, { recursive: true });
for (const id of fixtures) {
  const dir = path.join(STUDIO_RECORDINGS, id);
  let transport: ModelTransport;
  if (replay) transport = new ReplayTransport(dir);
  else {
    rmSync(dir, { recursive: true, force: true });
    transport = new RecordingTransport(new AnthropicTransport(), dir);
  }
  // The run's cap stands in for the daily cap: a call whose estimate would take the run past --max-eur is refused
  // (SpendCapError) before it is sent, and the studio falls back.
  const runConfig = { ...config, limits: { ...config.limits, dailyModelSpendCapEur: maxEur } };
  const client = new ModelClient({
    config: runConfig,
    transport,
    spentToday: async () => (replay ? 0 : eur),
    onCall: async (c) => {
      if (!replay) eur += c.costEur;
      console.log(`  ${c.stage} ${c.model}: ${c.usage.input_tokens} in, ${c.usage.output_tokens} out, €${c.costEur.toFixed(4)}${replay ? " (replayed, not spent)" : ""}`);
    },
  });
  const fx = composerFixture(id);
  console.log(`${id}:`);
  const r = await runStudio(client, runConfig, {
    spec: fx.base,
    brief: fx.sources.brief,
    corpus: fx.description,
    seed: 1,
    ...(fx.tradeWord ? { tradeWord: fx.tradeWord } : {}),
  });
  const report = r.ok
    ? { ok: true, idea: r.idea, stance: r.stance, presets: r.used.presets, palette: r.used.palette, pairing: r.used.pairing, wordmark: r.used.wordmark, drawing: r.used.drawing, dropped: r.dropped, eur: r.costEur }
    : { ok: false, reason: r.reason, idea: r.idea ?? null, eur: r.costEur };
  await writeFile(path.join(out, `${id}.studio.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`  ${r.ok ? `idea: ${r.idea}\n  stance ${r.stance}: ${r.used.presets.map((p) => p.replace("composition/", "")).join(", ")}; ${r.used.palette}, ${r.used.pairing}${r.used.wordmark ? `, ${r.used.wordmark}` : ""}${r.dropped.length ? `\n  dropped: ${r.dropped.join("; ")}` : ""}` : `fell back: ${r.reason}`}`);
  if (r.ok) await writeFile(path.join(out, `${id}.spec.json`), `${JSON.stringify(r.spec, null, 2)}\n`);
  await shots([...(r.ok ? [{ id, fixtureId: id, spec: r.spec }] : []), { id: `${id}-today`, fixtureId: id, spec: fx.base }]);
}
console.log(`${replay ? "replayed" : `spent €${eur.toFixed(4)}`}; shots in ${path.relative(repoRoot, out)}`);
