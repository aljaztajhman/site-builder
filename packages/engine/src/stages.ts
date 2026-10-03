import { z } from "zod";
import type { Operation } from "fast-json-patch";
import type Anthropic from "@anthropic-ai/sdk";
import {
  DIRECTIONS,
  Design,
  GENERATED_IMAGE_SECTIONS,
  SIGNATURE_PHOTO_VARIANTS,
  direction as directionById,
  awayFromShowcases,
  enforceDesign,
  templateFor,
  type BusinessType,
  type Direction,
  contrast,
  repairSiteCopy,
  toModelJsonSchema,
  validateSite,
  type ImageAsset,
  type Issue,
  type SiteSpec,
} from "@sb/spec";
import type { ModelClient } from "./llm/client.ts";
import { ModelOutputError, extractJson, isSchemaRejection } from "./llm/client.ts";
import { Brief, Classification, briefJsonSchema, classificationJsonSchema, clientWithholdsHours, verifyBriefFacts, type Dropped } from "./brief.ts";
import {
  ALT_SYSTEM,
  BRIEF_SYSTEM,
  CLASSIFY_SYSTEM,
  CONTENT_SYSTEM,
  CRITIQUE_SYSTEM,
  CritiqueOutput,
  DESIGN_SYSTEM,
  EDIT_SYSTEM,
  EditOutput,
  PATCH_FORMAT,
  directionsCatalogue,
  sectionCatalogue,
  businessSchema,
} from "./prompts.ts";
import { assembleSpec, contentJsonSchema, contentOutputSchema, type ContentOutput } from "./assemble.ts";
import { repairContentOutput } from "./repair.ts";
import type { Swatch } from "./palette.ts";
import { fitImageForModel, sliceScreenshot } from "./images.ts";
import { checkFacts, type FactViolation } from "./facts.ts";
import { applyOps } from "./editor.ts";

// ---------- 1. Intake -> brief ----------

export async function classify(client: ModelClient, description: string): Promise<Classification> {
  const { data } = await client.callJson({
    stage: "classify",
    system: [CLASSIFY_SYSTEM],
    messages: [{ role: "user", content: description }],
    schema: classificationJsonSchema(),
  }, (d) => Classification.parse(d));
  return data;
}

export async function makeBrief(
  client: ModelClient,
  input: { description: string; businessType: string; photoCount: number; generatedSlots: number; hasLogo: boolean; scope: "home" | "full" },
): Promise<{ brief: Brief; dropped: Dropped[] }> {
  const { data } = await client.callJson({
    stage: "brief",
    system: [BRIEF_SYSTEM],
    messages: [
      {
        role: "user",
        content: `Business type (classified): ${input.businessType}\nPhotos provided: ${input.photoCount}\nGenerated pictures allowed: ${input.generatedSlots}\nLogo provided: ${input.hasLogo ? "yes" : "no"}\nScope: ${input.scope === "home" ? "homepage preview (plan all pages anyway)" : "full site"}\n\nClient's description:\n"""\n${input.description}\n"""`,
      },
    ],
    schema: briefJsonSchema(),
  }, (d) => Brief.parse(d));
  return verifyBriefFacts(data, input.description);
}

// ---------- 2. Design direction ----------

const DesignChoice = z.strictObject({
  direction: z.enum(DIRECTIONS.map((d) => d.id) as [string, ...string[]]),
  fontPair: z.string(),
  primary: z.string().regex(/^#[0-9a-f]{6}$/),
  accent: z.string().regex(/^#[0-9a-f]{6}$/).nullable(),
  radius: z.number(),
  baseFontSize: z.number(),
  scale: z.number(),
  headingWeight: z.number(),
  headingCase: z.enum(["normal", "uppercase"]),
  headingTracking: z.number(),
  density: z.enum(["compact", "regular", "airy"]),
  shadow: z.enum(["none", "subtle"]),
  reason: z.string().max(300),
});

/** What the design step hears about pictures: generated mood pictures count, so a photo-less site still gets a photo-led direction. */
export function photoLine(photoCount: number, generatedCount: number): string {
  const has = `Photos: ${photoCount} from the client${generatedCount ? `, plus ${generatedCount} generated mood picture(s) on the way` : ""}.`;
  return `${has} ${photoCount + generatedCount ? "Prefer a direction whose heroes and imagery show pictures." : "No pictures: prefer a typography-led direction and heroes."}`;
}

/**
 * The hand-made trade template for this business type (docs/design/templates), named to the design step as
 * the first choice when the business fits it. Empty when the trade has none or the photos don't allow it.
 */
export function templateLine(businessType: BusinessType, photoCount: number): string {
  const t = templateFor(businessType, photoCount);
  if (!t) return "";
  const draws = drawsInsteadOfPhotos(t) ? " It draws the trade instead of showing pictures; with it no generated pictures are made." : "";
  return `Trade template: ${t.id} (${t.name}) is hand-made for this trade. Choose it whenever the business fits its description.${draws}`;
}

/** "hero-signature:<variant>" with a photo (photo, arch, label), as opposed to one that draws (drawing, receipt). */
function signatureWithPhoto(hero: string): boolean {
  const [type, variant] = hero.split(":");
  return type === "hero-signature" && SIGNATURE_PHOTO_VARIANTS.includes(variant ?? "");
}

/** A direction whose heroes all draw the trade (templates S and R): generated mood pictures would go unused. */
export function drawsInsteadOfPhotos(dir: Direction): boolean {
  return dir.layout.heroes.every((h) => h.startsWith("hero-signature:") && !signatureWithPhoto(h));
}

export async function chooseDesign(
  client: ModelClient,
  input: { brief: Brief; swatches: Swatch[]; photoCount: number; generatedCount: number },
): Promise<{ design: Design; reason: string }> {
  const { data } = await client.callJson({
    stage: "design",
    system: [DESIGN_SYSTEM, directionsCatalogue()],
    messages: [
      {
        role: "user",
        content: `Business: ${input.brief.name} (${input.brief.businessType}), tone ${input.brief.tone}.\nSummary: ${input.brief.summary}\n${photoLine(input.photoCount, input.generatedCount)}\n${templateLine(input.brief.businessType, input.photoCount)}\nBrand colours extracted in code (hex, share, source): ${
          input.swatches.length ? input.swatches.map((s) => `${s.hex} ${(s.weight * 100).toFixed(0)}% ${s.source}`).join(", ") : "none"
        }`,
      },
    ],
    schema: toModelJsonSchema(DesignChoice),
  }, (d) => DesignChoice.parse(d));
  const choice = data;
  return { design: designFromChoice(choice), reason: choice.reason };
}

/** Builds full tokens from the direction's fallback palette and the chosen brand colours; code enforces ranges and contrast. */
export function designFromChoice(choice: z.infer<typeof DesignChoice>): Design {
  const dir = directionById(choice.direction);
  // A trade template keeps its own palette (it comes from the trade: asphalt and signal yellow, hot and cold pipes, roast and wheat).
  const colors = dir.template ? { ...dir.palette.fallback } : { ...dir.palette.fallback, primary: choice.primary, accent: choice.accent ?? choice.primary };
  if (!dir.template) colors.onPrimary = contrast("#ffffff", colors.primary) >= contrast("#111111", colors.primary) ? "#ffffff" : "#111111";
  const draft: Design = {
    direction: dir.id,
    fontPair: choice.fontPair,
    colors,
    radius: Math.round(choice.radius),
    baseFontSize: Math.round(choice.baseFontSize),
    scale: choice.scale,
    headingWeight: Math.round(choice.headingWeight),
    headingCase: choice.headingCase,
    headingTracking: choice.headingTracking,
    density: choice.density,
    shadow: choice.shadow,
    imagery: dir.imagery,
  };
  // Never the colours and fonts of a site on the landing page's trade showcase.
  return Design.parse(awayFromShowcases(enforceDesign(clampToSchema(draft), dir), dir));
}

function clampToSchema(d: Design): Design {
  const c = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    ...d,
    radius: c(d.radius, 0, 12),
    baseFontSize: c(d.baseFontSize, 16, 19),
    scale: c(d.scale, 1.125, 1.414),
    headingWeight: c(d.headingWeight, 400, 900),
    headingTracking: c(d.headingTracking, -0.04, 0.08),
  };
}

// ---------- 3. Images: alt text ----------

const AltOutput = z.strictObject({
  images: z.array(
    z.strictObject({
      index: z.number().int().min(0),
      alt: z.string().max(180),
      focalX: z.number().min(0).max(1),
      focalY: z.number().min(0).max(1),
      heroSuitable: z.boolean(),
    }),
  ),
});
export type AltText = { alt: string; focal: { x: number; y: number }; heroSuitable: boolean };

export async function altTexts(client: ModelClient, photos: { jpegBase64: string; name?: string }[]): Promise<AltText[]> {
  if (photos.length === 0) return [];
  const content: Anthropic.ContentBlockParam[] = [];
  photos.forEach((p, i) => {
    content.push({ type: "text", text: `Photo ${i}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: p.jpegBase64 } });
  });
  content.push({ type: "text", text: `Write alt text for photos 0–${photos.length - 1}.` });
  const { data } = await client.callJson({
    stage: "altText",
    system: [ALT_SYSTEM],
    messages: [{ role: "user", content }],
    schema: toModelJsonSchema(AltOutput),
  }, (d) => AltOutput.parse(d));
  const out = data;
  return photos.map((_, i) => {
    const r = out.images.find((x) => x.index === i);
    return { alt: r?.alt ?? "", focal: { x: r?.focalX ?? 0.5, y: r?.focalY ?? 0.5 }, heroSuitable: r?.heroSuitable ?? false };
  });
}

// ---------- 4. Content and assembly ----------

export interface ContentInput {
  slug: string;
  brief: Brief;
  design: Design;
  assets: SiteSpec["assets"];
  scope: "home" | "full";
  heroImageIds: string[];
  structuredOutput: boolean;
  retries: number;
  corpus: string;
}

export interface ContentResult {
  spec: SiteSpec;
  attempts: number;
  /** Issues left after the last attempt (empty when valid). */
  issues: string[];
  /** True when the API rejected the content schema for structured output and plain JSON was used. */
  structuredFallback: boolean;
  /** Mechanical fixes made to the answer that produced `spec` before validation (see repairContentOutput). */
  repairs: string[];
}

/**
 * The envelope only; each section's props schema is already in the cached section catalogue, so the
 * full content schema (~15k tokens) isn't repeated in the uncached prompt.
 */
function plainJsonInstruction(): string {
  return `Return only one JSON object, no prose:
{"chrome": {"header": {"variant": "bar"|"split-cta"|"stacked", "cta": "call"|"booking"|"directions"|"none", "tone"?: "default"|"alt"|"inverse"}, "footer": {"variant": "columns"|"compact"}, "mobileActionBar": boolean},
 "pages": [{"id": "p_<word>", "kind": "home"|"standard", "slug": ""|"<ascii-kebab>", "nav": {"label": string ≤24, "show": boolean}, "seo": {"title": string ≤60, "description": string ≤160},
   "sections": [{"id": "s_<word>", "type": <section type from the catalogue>, "variant": <one of its variants>, "tone"?: "default"|"alt"|"inverse", "props": <exactly its props schema>}]}]}
The homepage has kind "home" and slug "". Use only section types, variants and props from the catalogue; respect every length limit.`;
}

/** How a generated picture may be used; validation enforces the slots. */
const GENERATED_NOTE = `, AI-generated mood picture: use it only in ${GENERATED_IMAGE_SECTIONS.join(", ")}, never presented as the business's own place, people, products or work`;

function imageList(assets: SiteSpec["assets"], heroIds: string[]): string {
  if (!assets.images.length) return "No photos. Use typography-led sections only (hero-type, page-header plain); never reference an image id.";
  return assets.images
    .map((i: ImageAsset) => `${i.id} (${i.width}×${i.height}${heroIds.includes(i.id) ? ", hero-suitable" : ""}${i.origin === "generated" ? GENERATED_NOTE : ""}): ${i.alt}`)
    .join("\n");
}

/**
 * With a hero-suitable picture the homepage opens on it (a text-only hero wastes the picture), in one of the
 * direction's own picture heroes. A typographic direction (no picture hero) keeps its type hero.
 */
export function heroRule(heroImageIds: string[], directionHeroes: string[]): string {
  const pictureHeroes = directionHeroes.filter((h) => h.startsWith("hero-split:") || h.startsWith("hero-image:") || signatureWithPhoto(h));
  if (!heroImageIds.length || !pictureHeroes.length) return "";
  return `Homepage hero: ${pictureHeroes.join(" or ")} with one of the hero-suitable pictures (${heroImageIds.join(", ")}), not hero-type. Put the other pictures in image-text or page-header with-image sections.`;
}

/** The template's homepage outline for the content step; empty for other directions. */
export function templateOutline(dir: Direction): string {
  if (!dir.template) return "";
  return `Homepage outline of the ${dir.name} template, top to bottom. Follow it: these sections in this order, with these variants and tones, and no others on the homepage; leave a section out only when the facts it needs are missing. A closing contact section in the outline is allowed although the top already shows contact facts.\n${dir.template.homepage.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
}

export async function generateContent(client: ModelClient, input: ContentInput): Promise<ContentResult> {
  const dir = directionById(input.design.direction);
  const schema = contentOutputSchema();
  const pages = input.scope === "home" ? input.brief.pages.filter((p) => p.kind === "home") : input.brief.pages;
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        `Build the ${input.scope === "home" ? "homepage only (other pages come later; nav may list only the homepage)" : "full site"} for this brief.`,
        `Brief (facts are verified; anything null is missing and must be a placeholder or left out):\n${JSON.stringify(input.brief)}`,
        `Pages to produce (page ids p_<slug or "home">):\n${pages.map((p) => `- ${p.kind} "${p.slug}" nav "${p.navLabel}": ${p.purpose}`).join("\n")}`,
        `Design direction: ${dir.id}. Header ${dir.layout.header}, footer ${dir.layout.footer}. Preferred heroes: ${dir.layout.heroes.join(", ")}. Section rhythm: ${dir.layout.rhythm} (use the tone field: default/alt/inverse/band; band is the direction's saturated colour). Preferred variants: ${dir.layout.prefer.join(", ")}.`,
        templateOutline(dir),
        `Photos (use each at most twice; alt text is already written):\n${imageList(input.assets, input.heroImageIds)}`,
        heroRule(input.heroImageIds, dir.layout.heroes),
        `Business facts available to components: phone ${input.brief.facts.phone ? "yes" : "missing"}, address ${input.brief.facts.address ? "yes" : "missing"}, hours ${input.brief.facts.hours ? "yes" : "missing"}, booking URL ${input.brief.facts.bookingUrl ? "yes" : "no — never use the booking action"}.`,
        input.structuredOutput ? "" : plainJsonInstruction(),
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];

  let attempts = 0;
  let lastIssues: string[];
  let spec: SiteSpec | undefined;
  // The issues of the attempt that produced `spec`; a later answer that didn't parse doesn't replace them.
  let specIssues: string[] = [];
  let specRepairs: string[] = [];
  let structured = input.structuredOutput;
  let structuredFallback = false;
  for (;;) {
    attempts++;
    let res;
    try {
      res = await client.call({
        stage: "content",
        system: [sectionCatalogue(), CONTENT_SYSTEM],
        messages,
        ...(structured ? { schema: contentJsonSchema() } : {}),
      });
    } catch (e) {
      // The content schema is large (a union of every section). If the API rejects it for structured
      // output, fall back to plain JSON with the schema in the prompt; validation catches the rest.
      if (structured && isSchemaRejection(e)) {
        structured = false;
        structuredFallback = true;
        attempts--;
        messages[0] = { role: "user", content: `${messages[0]!.content as string}\n\n${plainJsonInstruction()}` };
        continue;
      }
      throw e;
    }
    let issues: string[];
    try {
      const data: unknown = JSON.parse(extractJson(res.text));
      const repairs = repairContentOutput(data);
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        issues = parsed.error.issues.slice(0, 25).map((i) => `/${i.path.join("/")}: ${i.message}`);
      } else {
        spec = assembleSpec({ slug: input.slug, brief: input.brief, design: input.design, assets: input.assets, content: parsed.data as ContentOutput, hoursWithheld: clientWithholdsHours(input.corpus) });
        // Copy rules fixed in code rather than by a paid retry: em dashes become en dashes.
        repairs.push(...repairSiteCopy(spec));
        const v = validateSite(spec);
        issues = v.ok ? [] : v.issues.map(issueLine);
        const facts = checkFacts(spec, input.corpus);
        issues.push(...facts.map(factLine));
        specIssues = issues;
        specRepairs = repairs;
      }
    } catch {
      issues = ["Output is not valid JSON."];
    }
    lastIssues = issues;
    if (issues.length === 0 && spec) return { spec, attempts, issues: [], structuredFallback, repairs: specRepairs };
    if (attempts > input.retries) break;
    messages.push({ role: "assistant", content: res.text });
    messages.push({
      role: "user",
      content: `The output failed validation. Fix every issue and return the complete corrected JSON (not a diff):\n${issues.map((i) => `- ${i}`).join("\n")}`,
    });
  }
  if (!spec) throw new Error(`Content generation failed after ${attempts} attempts: ${lastIssues.slice(0, 5).join("; ")}`);
  return { spec, attempts, issues: specIssues, structuredFallback, repairs: specRepairs };
}

const issueLine = (i: Issue) => `${i.path}: ${i.message}`;
const factLine = (f: FactViolation) => `${f.path}: ${f.kind} "${f.value}" ${f.detail ?? "is not in the client's input"} — remove it or use a placeholder`;

// ---------- Patches (critique and chat edits) ----------

/** enforceDesign for a patched design; left as is when it no longer parses, so validation reports why. */
function repairDesign(design: unknown): SiteSpec["design"] {
  const parsed = Design.safeParse(design);
  const dir = parsed.success ? DIRECTIONS.find((d) => d.id === parsed.data.direction) : undefined;
  return parsed.success && dir ? enforceDesign(parsed.data, dir) : (design as SiteSpec["design"]);
}

export interface PatchResult {
  spec: SiteSpec;
  applied: number;
  issues: string[];
}

/** Applies RFC 6902 operations to a copy, then validates. Never mutates the input. */
export function applyPatches(spec: SiteSpec, ops: Operation[], corpus: string): PatchResult {
  if (ops.length === 0) return { spec, applied: 0, issues: [] };
  const result = applyOps(spec, ops);
  if ("reason" in result) {
    const issue =
      result.reason === "protected"
        ? result.issues.map((i) => `${i.path}: ${i.message}`)
        : result.reason === "invalid"
          ? [`invalid patch: ${result.message} (${result.op} ${result.path})`]
          : [`patch failed: ${result.message}`];
    return { spec, applied: 0, issues: issue };
  }
  let next = result.next;
  repairSiteCopy(next);
  // Design edits get the same repair as generation: banned backgrounds replaced, contrast fixed in code.
  if (ops.some((o) => o.path === "/design" || o.path.startsWith("/design/"))) next = { ...next, design: repairDesign(next.design) };
  const v = validateSite(next);
  // Fact checks walk the spec's structure, so they only run on a spec that validates. A violation the
  // site already had (left after generation's retries) doesn't block an unrelated edit; publishing
  // still lists it. Matched by kind and value, so a moved section doesn't make it "new".
  const known = new Set<string>();
  if (v.ok && validateSite(spec).ok) for (const f of checkFacts(spec, corpus)) known.add(`${f.kind}|${f.value}`);
  const issues = v.ok ? checkFacts(v.spec, corpus).filter((f) => !known.has(`${f.kind}|${f.value}`)).map(factLine) : v.issues.map(issueLine);
  return { spec: v.ok && issues.length === 0 ? v.spec : next, applied: ops.length, issues };
}

// ---------- 5. Critique ----------
/** Screenshot slices for the critique: ≤ 1568 px long edge and ~1.15 MP each, the sizes the API keeps legible. */
const CRITIQUE_SLICES = { mobile: { height: 1560, max: 6 }, desktop: { height: 900, max: 2 } } as const;


export async function critique(
  client: ModelClient,
  input: { spec: SiteSpec; mobilePng: Uint8Array; desktopPng: Uint8Array; failures: string[]; corpus: string },
): Promise<{ issues: string[]; patches: Operation[] }> {
  const image = (b: Uint8Array) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: Buffer.from(b).toString("base64") } });
  // Legible slices: the whole mobile page (it's what most visitors see), the top of the desktop page.
  const [mobile, desktop] = await Promise.all([
    sliceScreenshot(await fitImageForModel(input.mobilePng), CRITIQUE_SLICES.mobile.height, CRITIQUE_SLICES.mobile.max),
    sliceScreenshot(await fitImageForModel(input.desktopPng), CRITIQUE_SLICES.desktop.height, CRITIQUE_SLICES.desktop.max),
  ]);
  const label = (what: string, s: { tiles: unknown[]; truncated: boolean }) =>
    `${what}${s.tiles.length > 1 ? `, top to bottom in ${s.tiles.length} consecutive slices` : ""}${s.truncated ? " (the page continues below the last slice)" : ""}:`;
  const res = await client.call({
    stage: "critique",
    system: [sectionCatalogue(), CRITIQUE_SYSTEM],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: label("Mobile homepage (360 px)", mobile) },
          ...mobile.tiles.map(image),
          { type: "text", text: label("Desktop homepage (1280 px)", desktop) },
          ...desktop.tiles.map(image),
          {
            type: "text",
            text: [
              input.spec.chrome.mobileActionBar ? "On phones a fixed bar with call and directions buttons stays at the bottom of the screen (hidden in the slices above)." : "",
              `Automated checks reported:\n${input.failures.length ? input.failures.map((f) => `- ${f}`).join("\n") : "- nothing"}`,
              `The client's own text (every fact on the site comes from here):\n"""\n${input.corpus}\n"""`,
              `Current spec:\n${JSON.stringify(input.spec)}`,
              `Return JSON: {"issues": [...], "patches": [...]}`,
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
      },
    ],
  });
  try {
    const out = CritiqueOutput.parse(JSON.parse(extractJson(res.text)));
    return { issues: out.issues, patches: out.patches as Operation[] };
  } catch (e) {
    throw new ModelOutputError(`Critique output is not valid: ${(e as Error).message.slice(0, 200)}`, res);
  }
}

// ---------- Chat edits ----------

export interface EditResult {
  reply: string;
  spec: SiteSpec;
  changed: boolean;
  attempts: number;
  issues: string[];
}

/** Shown when the model's patches never validated: its own reply would claim a change that wasn't saved. */
export const EDIT_FAILED_REPLY = "Te spremembe nismo mogli shraniti, stran je ostala nespremenjena. Poskusite jo opisati drugače ali jo uredite neposredno.";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function editSpec(
  client: ModelClient,
  input: { spec: SiteSpec; message: string; corpus: string; retries?: number; history?: ChatTurn[] },
): Promise<EditResult> {
  // Earlier turns give follow-ups ("še krajše", "vrni prejšnje") their meaning; their changes are already in the spec.
  const history = (input.history ?? []).map((t) => `${t.role === "user" ? "Client" : "We"}: ${t.content}`).join("\n");
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        `Current site spec:\n${JSON.stringify(input.spec)}`,
        history ? `Earlier messages in this conversation (their changes are already in the spec above):\n"""\n${history}\n"""` : "",
        `Client's request:\n"""\n${input.message}\n"""`,
        PATCH_FORMAT,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
  const retries = input.retries ?? client.limits.editRetries;
  let attempts = 0;
  for (;;) {
    attempts++;
    const res = await client.call({ stage: "edit", system: [sectionCatalogue(), `${EDIT_SYSTEM}\n\n${businessSchema()}`], messages });
    let issues: string[];
    try {
      const out = EditOutput.parse(JSON.parse(extractJson(res.text)));
      const r = applyPatches(input.spec, out.patches as Operation[], input.corpus);
      issues = r.issues;
      if (issues.length === 0) return { reply: out.reply, spec: r.spec, changed: r.applied > 0, attempts, issues: [] };
    } catch (e) {
      issues = [`Output is not valid: ${(e as Error).message.slice(0, 200)}`];
    }
    if (attempts > retries) return { reply: EDIT_FAILED_REPLY, spec: input.spec, changed: false, attempts, issues };
    messages.push({ role: "assistant", content: res.text });
    messages.push({ role: "user", content: `Applying your patches failed validation. Return corrected JSON:\n${issues.map((i) => `- ${i}`).join("\n")}` });
  }
}
