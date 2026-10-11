/**
 * Mockup spike (HQ it-studio-mockup-spike, docs/plans/mockup-spike.md): asks image models on fal for a whole homepage
 * design as a picture, for pekarna-kvas (real fixture photos and logo passed as references) and an invented tattoo studio
 * (eval/runs/mockup-spike/tattoo-brief.json, no photos). Hard stop at €1.20 and 20 images across runs: every call is booked
 * in eval/runs/mockup-spike/cost-log.jsonl before the next one may start (booked at the price below; fal's per-request
 * billing needs a billing key, so the booking is the pricing API's rate, see BOOK).
 *   FAL_KEY in the environment; pnpm tsx tools/eval/src/mockup-spike.ts <job>[,<job>…]   (jobs: see JOBS, or "list")
 * Writes eval/runs/mockup-spike/mockups/<job>-<n>.jpg.
 *
 * Spike 2 (`--spike2`): the prompts are the Opus art director's (mockup-director.ts, director/<business>.json), one
 * image per direction: jobs `d2-<pekarna|tattoo|florist>-<a|b>`, and `…-phone` for a phone version. Its own cap: €0.60
 * and 13 images across the ledger's spike-2 rows.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { TEXTS, type Business } from "./mockup-director.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(repoRoot, "eval/runs/mockup-spike");
const LOG = path.join(OUT, "cost-log.jsonl");
const SPIKE2 = process.argv.includes("--spike2");
const CAP_EUR = SPIKE2 ? 0.6 : 1.2;
const CAP_IMAGES = SPIKE2 ? 13 : 20;
const EUR_PER_USD = 0.86;

/** USD per output image as booked. gpt-image-2.5 is token-billed: config's $0.0502/MP × 1.57 MP plus ~$0.02 for the reference images. Ideogram BALANCED is 2× its TURBO $0.03. */
const BOOK: Record<string, number> = {
  "openai/gpt-image-2.5/flare/edit": 0.1,
  "openai/gpt-image-2.5/flare/text-to-image": 0.08,
  "fal-ai/nano-banana-2/edit": 0.08,
  "fal-ai/nano-banana-2": 0.08,
  "bytedance/seedream/v5/lite/edit": 0.035,
  "bytedance/seedream/v5/lite/text-to-image": 0.035,
  "fal-ai/ideogram/v3": 0.06,
};

const PEKARNA = `Pekarna Kvas, a small family sourdough bakery in Kamnik, Slovenia (the baker Jure bakes, his wife Katja runs the shop). Bread only with natural leaven, risen overnight, flour from a nearby mill, everything by hand, no additives, no frozen dough.
The page must contain these Slovene texts, spelled exactly:
- the logo (attached) and navigation: "Domov", "Kruh in pecivo", "Naročila", "Kontakt"
- headline: "Kruh z drožmi, ki vzhaja čez noč"
- intro: "Družinska pekarna na začetku stare ulice v Kamniku. Vse je ročno delo, brez aditivov in brez zamrznjenega testa."
- a section "Vsak dan" listing: Pirin kruh z drožmi, Rženi kruh, Polnozrnate žemlje, Rogljički z maslom, Cimetovi polži
- a note: "Ob petkih in sobotah še orehova potica in kvašeni krofi"
- opening hours: "Pon–pet 6.30–18.00", "Sob 6.30–12.00", "Ned 7.00–10.00"
- address: "Šutna 30, 1241 Kamnik"
- phone: "041 555 906" with a button "Pokličite"
Use the three attached photographs as the website's photos (the real loaves on the shelf, the baker's hands shaping dough, the croissants and cinnamon rolls); keep them recognisable, crop them as a designer would, do not redraw them or add other photos.`;

const TATTOO = `Rja, a one-artist tattoo studio in Maribor, Slovenia. Every design is drawn new from the client's story, nothing from a catalogue; fine-line work, custom pieces, cover-ups; by appointment only.
The page must contain these Slovene texts, spelled exactly:
- the wordmark "Rja" and navigation: "Domov", "Delo", "Posvet", "Kontakt"
- headline: "Vsak motiv narisan na novo"
- intro: "Majhen tatu studio v Mariboru. Tetovaže po vaši zgodbi, nič iz kataloga. Samo z naročili."
- a services section with four items: "Tetovaže po meri", "Fine-line in drobni motivi", "Prekrivanje in popravki", "Posvet in osnutek"
- opening hours: "Tor–pet 12.00–20.00", "Sob 10.00–15.00"
- address: "Koroška cesta 41, 2000 Maribor"
- phone: "040 555 318" with a button "Pokličite"
The studio has no photographs. Any imagery must be original artwork (drawn, printed or painted), not photos of people, skin, tattooed bodies, faces or the studio interior.`;

const DESKTOP = `Design the complete desktop homepage of a website for this business, shown as one flat full-page screenshot at 1536×1024 (the first screen and the start of the next sections; no browser window, no device frame, no perspective).

BUSINESS
%BUSINESS%

ART DIRECTION
Make it original and art-directed, the way a top independent design studio would design for this one business: a distinctive layout idea, characterful typography, a deliberate colour palette and confident use of space. Not a generic website template, no stock imagery, no rounded-card SaaS look, no gradients for decoration. Do not invent anything that is not given above: no reviews, ratings, stars, prices, awards, extra people, extra services, social-media numbers or slogans. Every word must be legible and spelled exactly as given; use only the texts listed.`;

const PHONE = DESKTOP.replace("desktop homepage", "phone homepage").replace(
  "one flat full-page screenshot at 1536×1024 (the first screen and the start of the next sections; no browser window, no device frame, no perspective)",
  "one flat screenshot of a 390-pixel-wide phone screen, tall (the first screen and the start of the next section; no phone frame, no browser bar, no perspective). The layout must be a real phone layout: one column, large tap targets, the phone number tappable",
);

interface Job {
  endpoint: string;
  business: Business;
  phone?: boolean;
  /** The whole prompt (spike 2); otherwise DESKTOP or PHONE with the business filled in. */
  prompt?: string;
  input: (prompt: string, refs: string[]) => Record<string, unknown>;
  n: number;
}

const gpt = (size: { width: number; height: number }) => (prompt: string, refs: string[]) =>
  refs.length ? { prompt, image_urls: refs, image_size: size, quality: "high", num_images: 2, output_format: "jpeg" } : { prompt, image_size: size, quality: "high", num_images: 2, output_format: "jpeg" };
const nano = (aspect: string) => (prompt: string, refs: string[]) => ({ prompt, ...(refs.length ? { image_urls: refs } : {}), aspect_ratio: aspect, resolution: "1K", num_images: 2, output_format: "jpeg" });
const seedream = (prompt: string, refs: string[]) => ({ prompt, ...(refs.length ? { image_urls: refs } : {}), image_size: "landscape_4_3", num_images: 2 });
const ideogram = (prompt: string, _refs: string[]) => ({ prompt, image_size: "landscape_4_3", rendering_speed: "BALANCED", style: "DESIGN", expand_prompt: false, num_images: 2 });

export const JOBS: Record<string, Job> = {
  "gpt-pekarna": { endpoint: "openai/gpt-image-2.5/flare/edit", business: "pekarna", input: gpt({ width: 1536, height: 1024 }), n: 2 },
  "gpt-tattoo": { endpoint: "openai/gpt-image-2.5/flare/text-to-image", business: "tattoo", input: gpt({ width: 1536, height: 1024 }), n: 2 },
  "nano-pekarna": { endpoint: "fal-ai/nano-banana-2/edit", business: "pekarna", input: nano("3:2"), n: 2 },
  "nano-tattoo": { endpoint: "fal-ai/nano-banana-2", business: "tattoo", input: nano("3:2"), n: 2 },
  "seedream-pekarna": { endpoint: "bytedance/seedream/v5/lite/edit", business: "pekarna", input: seedream, n: 2 },
  "seedream-tattoo": { endpoint: "bytedance/seedream/v5/lite/text-to-image", business: "tattoo", input: seedream, n: 2 },
  "ideogram-pekarna": { endpoint: "fal-ai/ideogram/v3", business: "pekarna", input: ideogram, n: 2 },
  "ideogram-tattoo": { endpoint: "fal-ai/ideogram/v3", business: "tattoo", input: ideogram, n: 2 },
};

/** The phone versions, for the best model only (added once the desktops are judged). */
export function phoneJob(base: string): Job {
  const j = JOBS[base]!;
  const one = (p: string, r: string[]) => ({ ...j.input(p, r), num_images: 1 });
  const portrait = (p: string, r: string[]) => {
    const i = one(p, r) as Record<string, unknown>;
    if ("image_size" in i && typeof i.image_size === "object") i.image_size = { width: 1024, height: 1536 };
    if ("aspect_ratio" in i) i.aspect_ratio = "9:16";
    if (i.image_size === "landscape_4_3") i.image_size = "portrait_16_9";
    return i;
  };
  return { ...j, phone: true, input: portrait, n: 1 };
}

/** Spike 2: one GPT Image 2.5 image (high) from the art director's prompt for direction a or b, the required texts appended verbatim. */
function directorJob(name: string): Job {
  const m = /^d2-(pekarna|tattoo|florist)-([ab])(-phone)?$/.exec(name);
  if (!m) throw new Error(`no job ${name}`);
  const business = m[1] as Business;
  const phone = !!m[3];
  const dir = JSON.parse(readFileSync(path.join(OUT, "director", `${business}.json`), "utf8")) as { directions: { imagePrompt: string }[] };
  const d = dir.directions[m[2] === "a" ? 0 : 1]!;
  const photos =
    business === "pekarna" ? "\n\nUse the attached photographs as the website's photos (keep them recognisable, crop them as a designer would, do not redraw them or add other photos); the attached logo is the business's logo." : "";
  const texts = `\n\nRequired texts, verbatim and spelled exactly (use only these; every word legible):\n${TEXTS[business]}`;
  const body = phone
    ? `PHONE VERSION of this homepage: one flat tall screenshot of a 390-pixel-wide phone screen (the first screen and the start of the next section; no phone frame, no browser bar, no perspective), one column, large tap targets, the same art direction:\n\n${d.imagePrompt}`
    : d.imagePrompt;
  const size = phone ? { width: 1024, height: 1536 } : { width: 1536, height: 1024 };
  const endpoint = business === "pekarna" ? "openai/gpt-image-2.5/flare/edit" : "openai/gpt-image-2.5/flare/text-to-image";
  return { endpoint, business, phone, n: 1, prompt: body + photos + texts, input: (p, r) => ({ ...gpt(size)(p, r), num_images: 1 }) };
}

interface Row {
  at: string;
  job: string;
  endpoint: string;
  images: number;
  costEur: number;
  seconds: number;
  ok: boolean;
  provider?: string;
  spike?: number;
  requestId?: string;
  error?: string;
}

/** The fal rows of this spike (spike 2's own cap; the director's Anthropic rows are capped in mockup-director.ts). */
function ledger(): { eur: number; images: number } {
  if (!existsSync(LOG)) return { eur: 0, images: 0 };
  const rows = readFileSync(LOG, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Row)
    .filter((r) => r.provider !== "anthropic" && (r.spike === 2) === SPIKE2);
  return { eur: rows.reduce((s, r) => s + r.costEur, 0), images: rows.reduce((s, r) => s + r.images, 0) };
}

/** The fixture's photos (1024 px wide) and logo (rasterised) as data URIs. */
async function pekarnaRefs(): Promise<string[]> {
  const dir = path.join(repoRoot, "tools/eval/fixtures/pekarna-kvas");
  const out: string[] = [];
  for (const f of ["photos/01.jpg", "photos/02.jpg", "photos/03.jpg"]) {
    const b = await sharp(path.join(dir, f)).resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    out.push(`data:image/jpeg;base64,${b.toString("base64")}`);
  }
  const logo = await sharp(path.join(dir, "logo.svg"), { density: 300 }).flatten({ background: "#ffffff" }).png().toBuffer();
  out.push(`data:image/png;base64,${logo.toString("base64")}`);
  return out;
}

async function run(name: string, job: Job): Promise<void> {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY missing");
  const usd = BOOK[job.endpoint];
  if (usd === undefined) throw new Error(`no booked price for ${job.endpoint}`);
  const est = usd * EUR_PER_USD * job.n;
  const before = ledger();
  if (before.images + job.n > CAP_IMAGES) throw new Error(`cap: ${before.images} images made, ${job.n} more would pass ${CAP_IMAGES}`);
  if (before.eur + est > CAP_EUR) throw new Error(`cap: €${before.eur.toFixed(3)} booked, €${est.toFixed(3)} more would pass €${CAP_EUR}`);
  const refs = job.business === "pekarna" && job.endpoint.endsWith("/edit") ? await pekarnaRefs() : [];
  const template = job.phone ? PHONE : DESKTOP;
  const prompt = job.prompt ?? template.replace("%BUSINESS%", job.business === "pekarna" ? PEKARNA : TATTOO);
  if (SPIKE2) writeFileSync(path.join(OUT, "director", `${name}.prompt.txt`), prompt);
  const t0 = Date.now();
  let row: Row;
  try {
    const res = await fetch(`https://fal.run/${job.endpoint}`, {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(job.input(prompt, refs)),
      signal: AbortSignal.timeout(600_000),
    });
    const seconds = (Date.now() - t0) / 1000;
    const requestId = res.headers.get("x-fal-request-id") ?? undefined;
    if (!res.ok) {
      const text = (await res.text()).slice(0, 400);
      // A 4xx validation error may still be billed; book it at one image.
      row = { at: new Date().toISOString(), ...(SPIKE2 ? { spike: 2 } : {}), job: name, endpoint: job.endpoint, images: 0, costEur: res.status < 500 ? usd * EUR_PER_USD : 0, seconds, ok: false, requestId, error: `${res.status} ${text}` };
    } else {
      const body = (await res.json()) as { images: { url: string }[] };
      mkdirSync(path.join(OUT, "mockups"), { recursive: true });
      for (const [i, img] of body.images.entries()) {
        const data = img.url.startsWith("data:") ? Buffer.from(img.url.split(",")[1]!, "base64") : Buffer.from(await (await fetch(img.url)).arrayBuffer());
        await sharp(data).jpeg({ quality: 90 }).toFile(path.join(OUT, "mockups", `${name}-${i + 1}.jpg`));
      }
      row = { at: new Date().toISOString(), ...(SPIKE2 ? { spike: 2 } : {}), job: name, endpoint: job.endpoint, images: body.images.length, costEur: usd * EUR_PER_USD * body.images.length, seconds, ok: true, requestId };
    }
  } catch (e) {
    row = { at: new Date().toISOString(), ...(SPIKE2 ? { spike: 2 } : {}), job: name, endpoint: job.endpoint, images: 0, costEur: 0, seconds: (Date.now() - t0) / 1000, ok: false, error: String(e) };
  }
  appendFileSync(LOG, JSON.stringify(row) + "\n");
  const l = ledger();
  console.log(`${name}: ${row.ok ? `${row.images} images` : `FAILED ${row.error}`} in ${row.seconds.toFixed(1)} s, €${row.costEur.toFixed(3)}; total €${l.eur.toFixed(3)} of €${CAP_EUR}, ${l.images}/${CAP_IMAGES} images`);
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg || arg === "list") return console.log(Object.keys(JOBS).join("\n"));
  mkdirSync(OUT, { recursive: true });
  const names = arg.split(",");
  // Jobs run in parallel only when the ledger has room for all of them together.
  const jobs = names.map((n) => [n, n.startsWith("d2-") ? directorJob(n) : n.endsWith("-phone") ? phoneJob(n.replace(/-phone$/, "")) : JOBS[n]] as const);
  for (const [n, j] of jobs) if (!j) throw new Error(`no job ${n}`);
  const l = ledger();
  const est = jobs.reduce((s, [, j]) => s + BOOK[j!.endpoint]! * EUR_PER_USD * j!.n, 0);
  const imgs = jobs.reduce((s, [, j]) => s + j!.n, 0);
  if (l.eur + est > CAP_EUR || l.images + imgs > CAP_IMAGES) throw new Error(`cap: €${l.eur.toFixed(3)} + €${est.toFixed(3)} or ${l.images} + ${imgs} images would pass the cap`);
  await Promise.all(jobs.map(([n, j]) => run(n, j!)));
  writeFileSync(path.join(OUT, "prompt-desktop.txt"), DESKTOP);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
