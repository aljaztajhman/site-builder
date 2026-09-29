import { z } from "zod";
import jsonpatch, { type Operation } from "fast-json-patch";
import type Anthropic from "@anthropic-ai/sdk";
import {
  DIRECTIONS,
  Design,
  direction as directionById,
  enforceDesign,
  contrast,
  migrateSpec,
  toModelJsonSchema,
  validateSite,
  type ImageAsset,
  type Issue,
  type SiteSpec,
} from "@sb/spec";
import type { ModelClient } from "./llm/client.ts";
import { ModelOutputError, extractJson, isSchemaRejection } from "./llm/client.ts";
import { Brief, Classification, briefJsonSchema, classificationJsonSchema, verifyBriefFacts, type Dropped } from "./brief.ts";
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
import type { Swatch } from "./palette.ts";
import { fitImageForModel, sliceScreenshot } from "./images.ts";
import { checkFacts, type FactViolation } from "./facts.ts";
import { protectedPathIssues } from "./editor.ts";

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
  input: { description: string; businessType: string; photoCount: number; hasLogo: boolean; scope: "home" | "full" },
): Promise<{ brief: Brief; dropped: Dropped[] }> {
  const { data } = await client.callJson({
    stage: "brief",
    system: [BRIEF_SYSTEM],
    messages: [
      {
        role: "user",
        content: `Business type (classified): ${input.businessType}\nPhotos provided: ${input.photoCount}\nLogo provided: ${input.hasLogo ? "yes" : "no"}\nScope: ${input.scope === "home" ? "homepage preview (plan all pages anyway)" : "full site"}\n\nClient's description:\n"""\n${input.description}\n"""`,
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

export async function chooseDesign(
  client: ModelClient,
  input: { brief: Brief; swatches: Swatch[]; photoCount: number },
): Promise<{ design: Design; reason: string }> {
  const { data } = await client.callJson({
    stage: "design",
    system: [DESIGN_SYSTEM, directionsCatalogue()],
    messages: [
      {
        role: "user",
        content: `Business: ${input.brief.name} (${input.brief.businessType}), tone ${input.brief.tone}.\nSummary: ${input.brief.summary}\nPhotos: ${input.photoCount}${input.photoCount < 2 ? " (few photos: prefer a typography-led direction and heroes)" : ""}.\nBrand colours extracted in code (hex, share, source): ${
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
  const colors = { ...dir.palette.fallback, primary: choice.primary, accent: choice.accent ?? choice.primary };
  colors.onPrimary = contrast("#ffffff", colors.primary) >= contrast("#111111", colors.primary) ? "#ffffff" : "#111111";
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
  return Design.parse(enforceDesign(clampToSchema(draft), dir));
}

function clampToSchema(d: Design): Design {
  const c = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    ...d,
    radius: c(d.radius, 0, 12),
    baseFontSize: c(d.baseFontSize, 16, 19),
    scale: c(d.scale, 1.125, 1.414),
    headingWeight: c(d.headingWeight, 400, 850),
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

function imageList(assets: SiteSpec["assets"], heroIds: string[]): string {
  if (!assets.images.length) return "No photos. Use typography-led sections only (hero-type, page-header plain); never reference an image id.";
  return assets.images
    .map((i: ImageAsset) => `${i.id} (${i.width}×${i.height}${heroIds.includes(i.id) ? ", hero-suitable" : ""}): ${i.alt}`)
    .join("\n");
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
        `Design direction: ${dir.id}. Header ${dir.layout.header}, footer ${dir.layout.footer}. Preferred heroes: ${dir.layout.heroes.join(", ")}. Section rhythm: ${dir.layout.rhythm} (use the tone field: default/alt/inverse). Preferred variants: ${dir.layout.prefer.join(", ")}.`,
        `Photos (use each at most twice; alt text is already written):\n${imageList(input.assets, input.heroImageIds)}`,
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
  let structured = input.structuredOutput;
  let structuredFallback = false;
  for (;;) {
    attempts++;
    let res;
    try {
      res = await client.call({
        stage: "content",
        system: [CONTENT_SYSTEM, sectionCatalogue()],
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
      const parsed = schema.safeParse(JSON.parse(extract(res.text)));
      if (!parsed.success) {
        issues = parsed.error.issues.slice(0, 25).map((i) => `/${i.path.join("/")}: ${i.message}`);
      } else {
        spec = assembleSpec({ slug: input.slug, brief: input.brief, design: input.design, assets: input.assets, content: parsed.data as ContentOutput });
        const v = validateSite(spec);
        issues = v.ok ? [] : v.issues.map(issueLine);
        const facts = checkFacts(spec, input.corpus);
        issues.push(...facts.map(factLine));
      }
    } catch {
      issues = ["Output is not valid JSON."];
    }
    lastIssues = issues;
    if (issues.length === 0 && spec) return { spec, attempts, issues: [], structuredFallback };
    if (attempts > input.retries) break;
    messages.push({ role: "assistant", content: res.text });
    messages.push({
      role: "user",
      content: `The output failed validation. Fix every issue and return the complete corrected JSON (not a diff):\n${issues.map((i) => `- ${i}`).join("\n")}`,
    });
  }
  if (!spec) throw new Error(`Content generation failed after ${attempts} attempts: ${lastIssues.slice(0, 5).join("; ")}`);
  return { spec, attempts, issues: lastIssues, structuredFallback };
}

const extract = extractJson;

const issueLine = (i: Issue) => `${i.path}: ${i.message}`;
const factLine = (f: FactViolation) => `${f.path}: ${f.kind} "${f.value}" is not in the client's input — remove it or use a placeholder`;

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
  const guarded = protectedPathIssues(ops);
  if (guarded.length) return { spec, applied: 0, issues: guarded.map((i) => `${i.path}: ${i.message}`) };
  const errors = jsonpatch.validate(ops, spec);
  if (errors) return { spec, applied: 0, issues: [`invalid patch: ${errors.message} (${errors.operation?.op} ${errors.operation?.path})`] };
  let next: SiteSpec;
  try {
    next = jsonpatch.applyPatch(structuredClone(spec), ops, true, false).newDocument;
  } catch (e) {
    return { spec, applied: 0, issues: [`patch failed: ${(e as Error).message}`] };
  }
  next = migrateSpec(next);
  // Design edits get the same repair as generation: banned backgrounds replaced, contrast fixed in code.
  if (ops.some((o) => o.path === "/design" || o.path.startsWith("/design/"))) next = { ...next, design: repairDesign(next.design) };
  const v = validateSite(next);
  // Fact checks walk the spec's structure, so they only run on a spec that validates.
  const issues = v.ok ? checkFacts(v.spec, corpus).map(factLine) : v.issues.map(issueLine);
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
    system: [CRITIQUE_SYSTEM, sectionCatalogue()],
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
            text: `Automated checks reported:\n${input.failures.length ? input.failures.map((f) => `- ${f}`).join("\n") : "- nothing"}\n\nCurrent spec:\n${JSON.stringify(input.spec)}\n\nReturn JSON: {"issues": [...], "patches": [...]}`,
          },
        ],
      },
    ],
  });
  try {
    const out = CritiqueOutput.parse(JSON.parse(extract(res.text)));
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

export async function editSpec(
  client: ModelClient,
  input: { spec: SiteSpec; message: string; corpus: string; retries?: number },
): Promise<EditResult> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Current site spec:\n${JSON.stringify(input.spec)}\n\nClient's request:\n"""\n${input.message}\n"""\n\n${PATCH_FORMAT}`,
    },
  ];
  const retries = input.retries ?? 1;
  let attempts = 0;
  for (;;) {
    attempts++;
    const res = await client.call({ stage: "edit", system: [EDIT_SYSTEM, sectionCatalogue(), businessSchema()], messages });
    let issues: string[];
    let reply = "";
    try {
      const out = EditOutput.parse(JSON.parse(extract(res.text)));
      reply = out.reply;
      const r = applyPatches(input.spec, out.patches as Operation[], input.corpus);
      issues = r.issues;
      if (issues.length === 0) return { reply, spec: r.spec, changed: r.applied > 0, attempts, issues: [] };
    } catch (e) {
      issues = [`Output is not valid: ${(e as Error).message.slice(0, 200)}`];
    }
    if (attempts > retries) return { reply: reply || "Sprememba ni uspela.", spec: input.spec, changed: false, attempts, issues };
    messages.push({ role: "assistant", content: res.text });
    messages.push({ role: "user", content: `Applying your patches failed validation. Return corrected JSON:\n${issues.map((i) => `- ${i}`).join("\n")}` });
  }
}
