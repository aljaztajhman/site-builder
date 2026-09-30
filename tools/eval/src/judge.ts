/**
 * Vision judge for the eval: scores a generated homepage from its screenshots against a written
 * rubric, phone and desktop separately and with equal weight, with a one-line reason for each.
 * Eval only (a real model call per site); never part of generation. Its scores are checked against a
 * human look at the same review sheets (tools/eval/src/look.ts) before they count for anything.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { fitImageForModel, sliceScreenshot, type ModelClient, type ModelRequest } from "@sb/engine";
import { toModelJsonSchema } from "@sb/spec";

const Score = z.number().int().min(1).max(5);
const Scores = z.strictObject({
  impression: Score,
  hierarchy: Score,
  imagery: Score,
  spacing: Score,
  clutter: Score,
  distinctiveness: Score,
});
export const JudgeOutput = z.strictObject({
  phone: Scores,
  desktop: Scores,
  phoneNote: z.string().max(300),
  desktopNote: z.string().max(300),
  /** The changes that would lift the page most, most important first. */
  fixes: z.array(z.string().max(200)).max(3),
});
export type JudgeOutput = z.infer<typeof JudgeOutput>;
export type JudgeScores = z.infer<typeof Scores>;

export const mean = (s: JudgeScores): number => (s.impression + s.hierarchy + s.imagery + s.spacing + s.clutter + s.distinctiveness) / 6;

export const JUDGE_SYSTEM = `You are a strict senior web designer reviewing homepages generated for Slovenian small businesses (hairdressers, gostilne, car repair, dentists, bakeries, tourist farms, accountants, installers, shops). You get screenshots of one homepage: the phone's first screen as a visitor sees it (360×800, a fixed call/directions bar may sit at the bottom), the whole phone page, the desktop first screen (1280×800) and the whole desktop page. Judge only what you see, for phone and desktop separately: a site must be excellent on both.

Score each criterion from 1 to 5. Be strict: 3 is an ordinary small-business site, 5 is what a good designer would hand over.
- impression: would the owner be proud to show it? 5 = looks designed for this business; 1 = broken, amateur or an obvious template.
- hierarchy: 5 = what the business is, where it is and how to reach it read in that order, headline size fits the screen; 1 = no clear order, or a headline that swallows the screen.
- imagery: 5 = the business's photos are prominent where they matter (in the first screen when there are good ones), well cropped, supporting the text; a page without photos looks deliberately typographic; 1 = photos buried below the fold, badly cropped, or placeholder-like.
- spacing: 5 = a consistent rhythm, comfortable density, no dead bands; 1 = large empty gaps or cramped blocks.
- clutter: 5 = one clear primary action per screen, nothing repeated; 1 = many competing buttons, contact details or sections repeating each other.
- distinctiveness: 5 = specific to this business and its trade; 1 = the generic pattern every generated site has (eyebrow, big headline, two stacked buttons, then a photo).

Notes: one sentence per viewport naming the biggest problem you see (or what works, if nothing is wrong). Fixes: up to three concrete design changes that would lift this page most, most important first. Don't comment on the copy's facts; they are checked elsewhere.`;

async function png(file: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(file));
}

type Block = Exclude<ModelRequest["messages"][number]["content"], string>[number];
const image = (b: Uint8Array): Block => ({ type: "image", source: { type: "base64", media_type: "image/png", data: Buffer.from(b).toString("base64") } });

/** Scores the homepage whose screenshots `pnpm eval` wrote to `runDir`. */
export async function judgeHomepage(client: ModelClient, runDir: string, context: { businessType: string; direction: string | null; photos: number }): Promise<JudgeOutput> {
  const f = (n: string) => path.join(runDir, n);
  const phoneFull = await sliceScreenshot(await fitImageForModel(await png(f("home-360.png"))), 1560, 4);
  const deskFull = await sliceScreenshot(await fitImageForModel(await png(f("home-1280.png"))), 900, 4);
  const content: Block[] = [
    { type: "text", text: `Business type: ${context.businessType}. Design direction: ${context.direction ?? "unknown"}. Photos the owner gave: ${context.photos}.` },
    { type: "text", text: "Phone first screen (360×800) as a visitor sees it:" },
    image(await png(f("home-360-first.png"))),
    { type: "text", text: `Whole phone page, top to bottom in ${phoneFull.tiles.length} slices${phoneFull.truncated ? " (the page continues below)" : ""}:` },
    ...phoneFull.tiles.map(image),
    { type: "text", text: "Desktop first screen (1280×800) as a visitor sees it:" },
    image(await png(f("home-1280-first.png"))),
    { type: "text", text: `Whole desktop page, top to bottom in ${deskFull.tiles.length} slices${deskFull.truncated ? " (the page continues below)" : ""}:` },
    ...deskFull.tiles.map(image),
    { type: "text", text: "Score this homepage." },
  ];
  const { data } = await client.callJson({ stage: "judge", system: [JUDGE_SYSTEM], messages: [{ role: "user", content }], schema: toModelJsonSchema(JudgeOutput) }, (d) => JudgeOutput.parse(d));
  return data;
}
