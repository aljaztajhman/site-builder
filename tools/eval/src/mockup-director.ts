/**
 * Mockup spike 2 (docs/plans/mockup-spike.md): an Opus art director writes two contrasting directions per business,
 * each with the full GPT Image prompt for a homepage mockup. One real Anthropic call per business (config
 * models.fullBuild: the Opus model and effort), through the engine's ModelClient, so tokens and € are booked like any
 * pipeline call. Hard stop at €0.30 for all director calls together (the ledger's anthropic rows).
 *   ANTHROPIC_API_KEY in the environment or .env; pnpm tsx tools/eval/src/mockup-director.ts <pekarna|tattoo|florist>[,…]
 * Writes eval/runs/mockup-spike/director/<business>.json and appends to eval/runs/mockup-spike/cost-log.jsonl.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadConfig } from "@sb/config";
import { AnthropicTransport, ModelClient, ModelOutputError } from "@sb/engine";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(repoRoot, "eval/runs/mockup-spike");
const LOG = path.join(OUT, "cost-log.jsonl");
const CAP_EUR = 0.3;
/** Room for thinking plus two directions with full image prompts, small enough that three calls stay under the cap. */
const MAX_TOKENS = 7000;

export type Business = "pekarna" | "tattoo" | "florist";

/** The texts each page must carry, verbatim (also appended to every image prompt by mockup-spike.ts). */
export const TEXTS: Record<Business, string> = {
  pekarna: `- the logo (attached) and navigation: "Domov", "Kruh in pecivo", "Naročila", "Kontakt"
- headline: "Kruh z drožmi, ki vzhaja čez noč"
- intro: "Družinska pekarna na začetku stare ulice v Kamniku. Vse je ročno delo, brez aditivov in brez zamrznjenega testa."
- a section "Vsak dan" listing: Pirin kruh z drožmi, Rženi kruh, Polnozrnate žemlje, Rogljički z maslom, Cimetovi polži
- a note: "Ob petkih in sobotah še orehova potica in kvašeni krofi"
- opening hours: "Pon–pet 6.30–18.00", "Sob 6.30–12.00", "Ned 7.00–10.00"
- address: "Šutna 30, 1241 Kamnik"
- phone: "041 555 906" with one button "Pokličite"`,
  tattoo: `- the wordmark "Rja" and navigation: "Domov", "Delo", "Posvet", "Kontakt"
- headline: "Vsak motiv narisan na novo"
- intro: "Majhen tatu studio v Mariboru. Tetovaže po vaši zgodbi, nič iz kataloga. Samo z naročili."
- four services: "Tetovaže po meri", "Fine-line in drobni motivi", "Prekrivanje in popravki", "Posvet in osnutek"
- opening hours: "Tor–pet 12.00–20.00", "Sob 10.00–15.00"
- address: "Koroška cesta 41, 2000 Maribor"
- phone: "040 555 318" with one button "Pokličite"`,
  florist: `- the wordmark "Šipek" with the small line "cvetličarna" and navigation: "Domov", "Šopki", "Poroke", "Kontakt"
- headline: "Šopki iz cvetja tega tedna"
- intro: "Majhna cvetličarna na Glavnem trgu v Novem mestu. Šopke vežemo sproti, iz sezonskega cvetja z vrtnarij v Beli krajini."
- four services: "Šopki po naročilu", "Poročna floristika", "Žalni aranžmaji", "Sobne rastline"
- a note: "Šopek naročite po telefonu dan prej."
- opening hours: "Pon–pet 8.00–19.00", "Sob 8.00–13.00"
- address: "Glavni trg 9, 8000 Novo mesto"
- phone: "031 555 427" with one button "Pokličite"`,
};

const BRIEF_FILE: Record<Business, string> = {
  pekarna: "tools/eval/fixtures/pekarna-kvas/brief.json",
  tattoo: "eval/runs/mockup-spike/tattoo-brief.json",
  florist: "eval/runs/mockup-spike/florist-brief.json",
};

const SYSTEM = `You are the art director of a studio that designs one-of-a-kind websites for small Slovenian businesses. An image model (GPT Image 2.5) will paint a full desktop homepage mockup from your prompt; a developer then rebuilds it in our layout system, so it must be buildable.

The owner's taste: bold, characterful, immersive; every site unmistakably this business and no other; never a template. No trade clichés used as props (number plates, price tags, receipts, enamel signs and the like). Pick an idea from what this business really is and does.

Banned on every page (hard rules):
- cream, beige, ivory or off-white page grounds, and the cream ground with a warm serif look in general; a page ground is pure white, a clearly saturated or deep colour, or near-black
- decorative gradients (purple to blue or any other), gradient text, glassmorphism, heavy drop shadows
- everything centred; the default row of three icon cards; pill-shaped buttons; emoji as icons
- italic accent words inside headings; numbered section labels (01 / 02); monospace or uppercase tracked eyebrow labels
- pure black #000 or pure white #fff text (off-black and off-white are fine)
- more than one call button per screen; more than one primary action in the hero
- invented facts: no reviews, stars, prices, awards, extra people, extra services, years, slogans; no photos of people's faces; for businesses without photos, no photos at all (drawn, printed, painted or typographic imagery instead)

What the layout system can build (stay inside it): full-width sections on a 12-column grid; per section a colour field (whole or part), large display type (up to ~12vw), running text, lists, the client's photos cropped and bled to the edge, a labelled AI-made artwork (no people, no premises, no text in it), simple line drawings and ornaments, a strip or ribbon of words, hours as a table, the phone as a large numeral, a schematic map, rules and dividers, overlaps of image and type. It cannot build 3D, video, photo collages with cut-out objects, curved text paths or hand-lettering.

Write two directions that contrast with each other (different ground colour family, different type character, different composition). For each: a one-sentence idea in English; a palette of 5 to 6 hex colours with roles; the type character (name real free fonts on Google Fonts); the composition of the first screen and the next two sections; the imagery medium; one signature move a visitor remembers; and the complete image prompt for GPT Image 2.5 in English. The image prompt must ask for one flat full-page screenshot, 1536×1024, no browser or device frame, and must quote every required Slovene text verbatim (they are given below); describe colours by hex, type by character, and the layout precisely.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["directions"],
  properties: {
    directions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "idea", "palette", "type", "composition", "imagery", "signature", "imagePrompt"],
        properties: {
          name: { type: "string" },
          idea: { type: "string" },
          palette: { type: "array", items: { type: "object", additionalProperties: false, required: ["role", "hex"], properties: { role: { type: "string" }, hex: { type: "string" } } } },
          type: { type: "string" },
          composition: { type: "string" },
          imagery: { type: "string" },
          signature: { type: "string" },
          imagePrompt: { type: "string" },
        },
      },
    },
  },
} as const;

/** A base64 image content block (the Messages API's image block; the SDK is the engine's dependency, not this tool's). */
interface ImageBlock {
  type: "image";
  source: { type: "base64"; media_type: "image/jpeg" | "image/png"; data: string };
}

interface Row {
  provider?: string;
  costEur: number;
}

function anthropicSpent(): number {
  if (!existsSync(LOG)) return 0;
  return readFileSync(LOG, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Row)
    .filter((r) => r.provider === "anthropic")
    .reduce((s, r) => s + r.costEur, 0);
}

/** ANTHROPIC_API_KEY from the environment, else from the repository's .env (never printed). */
function apiKey(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const env = path.join(repoRoot, ".env");
  if (!existsSync(env)) return undefined;
  const line = readFileSync(env, "utf8").split(/\r?\n/).find((l) => l.startsWith("ANTHROPIC_API_KEY="));
  return line?.slice("ANTHROPIC_API_KEY=".length).trim() || undefined;
}

async function pekarnaImages(): Promise<ImageBlock[]> {
  const dir = path.join(repoRoot, "tools/eval/fixtures/pekarna-kvas");
  const out: ImageBlock[] = [];
  for (const f of ["photos/01.jpg", "photos/02.jpg", "photos/03.jpg"]) {
    const b = await sharp(path.join(dir, f)).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    out.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b.toString("base64") } });
  }
  const logo = await sharp(path.join(dir, "logo.svg"), { density: 200 }).flatten({ background: "#ffffff" }).png().toBuffer();
  out.push({ type: "image", source: { type: "base64", media_type: "image/png", data: logo.toString("base64") } });
  return out;
}

async function direct(business: Business): Promise<void> {
  const brief = JSON.parse(readFileSync(path.join(repoRoot, BRIEF_FILE[business]), "utf8")) as { description: string; facts: unknown };
  const images = business === "pekarna" ? await pekarnaImages() : [];
  const text = `The client's own description (Slovene):
${brief.description}

Facts (only these may appear):
${JSON.stringify(brief.facts)}

${images.length ? "Attached: the client's three photographs (the loaves on the shelf, the baker's hands, the croissants and cinnamon rolls) and their logo. The mockup will receive them as references and must use them as the site's photos." : "The business has no photographs and no logo."}

Required texts on the page, verbatim:
${TEXTS[business]}${business === "pekarna" ? "" : "\n\nBe concise: each image prompt under 230 words, the other fields two or three sentences."}`;
  // The pekarna call (the first) ran without the last line and used €0.106; the line keeps the other two inside the €0.30 cap.
  const base = loadConfig();
  const config = {
    ...base,
    models: { ...base.models, fullBuild: { ...base.models.fullBuild, maxTokens: MAX_TOKENS } },
    limits: { ...base.limits, dailyModelSpendCapEur: CAP_EUR },
  };
  const client = new ModelClient({
    config,
    transport: new AnthropicTransport(apiKey()),
    spentToday: async () => anthropicSpent(),
    onCall: async (r) => {
      appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), provider: "anthropic", spike: 2, job: `director-${business}`, model: r.model, stage: r.stage, usage: r.usage, costEur: r.costEur, seconds: r.durationMs / 1000, ok: r.ok, images: 0 }) + "\n");
    },
  });
  const t0 = Date.now();
  try {
    const res = await client.call({
      stage: "fullBuild",
      system: [SYSTEM],
      cache: false,
      schema: SCHEMA as unknown as Record<string, unknown>,
      messages: [{ role: "user", content: [...images, { type: "text", text }] }],
    });
    mkdirSync(path.join(OUT, "director"), { recursive: true });
    const parsed = JSON.parse(res.text) as { directions: unknown[] };
    writeFileSync(path.join(OUT, "director", `${business}.json`), `${JSON.stringify({ model: res.model, usage: res.usage, seconds: (Date.now() - t0) / 1000, ...parsed }, null, 2)}\n`);
    console.log(`${business}: ${parsed.directions.length} directions, ${res.usage.input_tokens} in / ${res.usage.output_tokens} out; director total €${anthropicSpent().toFixed(4)} of €${CAP_EUR}`);
  } catch (e) {
    if (e instanceof ModelOutputError) console.log(`${business}: FAILED ${e.message} (€${e.costEur.toFixed(4)})`);
    throw e;
  }
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) throw new Error("usage: mockup-director.ts <pekarna|tattoo|florist>[,…]");
  for (const b of arg.split(",") as Business[]) {
    if (!(b in TEXTS)) throw new Error(`unknown business ${b}`);
    await direct(b);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
