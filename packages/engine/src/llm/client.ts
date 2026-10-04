import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { costEur, type AppConfig, type ModelStageConfig, type ModelStageName } from "@sb/config";
import { toStructuredOutputSchema } from "./structured-schema.ts";

/** The request shape the pipeline sends; a subset of the Messages API. */
export interface ModelRequest {
  stage: ModelStageName;
  /**
   * Static, cacheable system blocks, most shared first: each block ends with a cache breakpoint
   * (max 3), so stages that start with the same block (the section catalogue) share its cache entry.
   */
  system: string[];
  messages: Anthropic.MessageParam[];
  /** JSON Schema for structured output. Omit for free text. */
  schema?: Record<string, unknown>;
}

export interface ModelUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface ModelResponse {
  text: string;
  stopReason: string | null;
  usage: ModelUsage;
  model: string;
}

export interface CallRecord {
  /** A model stage, or "imageGen" for a generated image (no tokens, priced per image). */
  stage: ModelStageName | "imageGen";
  model: string;
  usage: ModelUsage;
  costEur: number;
  durationMs: number;
  ok: boolean;
}

/** Anything that can answer a ModelRequest: the real API, or a replay of recorded responses. */
export interface ModelTransport {
  send(req: ModelRequest, stage: AppConfig["models"][ModelStageName]): Promise<ModelResponse>;
}

export class SpendCapError extends Error {
  constructor(spent: number, cap: number) {
    super(`Daily model spend cap reached: €${spent.toFixed(2)} of €${cap.toFixed(2)} spent or reserved. Generation is paused until tomorrow (UTC).`);
    this.name = "SpendCapError";
  }
}

/**
 * A paid plan's generated pictures for this allowance month are used up (config plans.*.site.generatedPicturesPerMonth,
 * checked at each picture's reservation). The pipeline builds the site without that picture; nothing else stops.
 */
export class PictureLimitError extends Error {
  constructor(used: number, max: number) {
    super(`The plan's generated pictures for this month are used up (${used} of ${max}); building without this one`);
    this.name = "PictureLimitError";
  }
}

/** A paid call's estimated cost, reserved under the daily cap until the call is over. */
export interface SpendReservation {
  /** The provider billed the call: book `record` (its real cost, tokens, stage) in place of the estimate. */
  settle(record: CallRecord): Promise<void>;
  /** The call cost nothing (it failed before the provider billed it): free the estimate, log nothing. */
  release(): Promise<void>;
}

/**
 * Where paid calls book their cost. `reserve` is atomic: two calls near the cap can't both take the last
 * room, so parallel stages and jobs no longer overshoot it by what they had in flight.
 */
export interface SpendLedger {
  /** Reserves `estimateEur` under `capEur` (today, UTC). Throws SpendCapError when it doesn't fit. */
  reserve(call: { stage: CallRecord["stage"]; model: string; estimateEur: number; capEur: number }): Promise<SpendReservation>;
}

/**
 * A ledger over a spend reading and a call log, atomic within this process only (eval runs, tests):
 * reservations in flight are counted in memory. The worker uses the database's ledger instead.
 */
export function localLedger(spentToday: () => Promise<number>, onCall: (record: CallRecord) => Promise<void>): SpendLedger {
  let pending = 0;
  return {
    async reserve({ estimateEur, capEur }) {
      const spent = await spentToday();
      // No await from here to `pending +=`: a reservation made meanwhile is already counted.
      if (spent + pending + estimateEur > capEur) throw new SpendCapError(spent + pending, capEur);
      pending += estimateEur;
      let open = true;
      const close = () => {
        if (open) pending -= estimateEur;
        open = false;
      };
      return {
        // Logged before the estimate is freed, so the call is never counted at zero in between.
        settle: async (record) => {
          await onCall(record);
          close();
        },
        release: async () => close(),
      };
    },
  };
}

/** A ledger, or the spend reading and call log a local one is built from. */
export type SpendSource = { ledger: SpendLedger } | { spentToday: () => Promise<number>; onCall: (record: CallRecord) => Promise<void> };

export const ledgerOf = (s: SpendSource): SpendLedger => ("ledger" in s ? s.ledger : localLedger(s.spentToday, s.onCall));

/**
 * What a model call may cost, reserved before it is sent: the request's text at
 * `limits.spendReservation.charsPerToken` plus a fixed count per image, all at the uncached input price,
 * and the stage's whole maxTokens of output (thinking included), the most it can bill.
 */
export function estimateCallEur(config: AppConfig, stage: ModelStageConfig, req: ModelRequest): number {
  const price = config.pricesUsdPerMTok[stage.model];
  if (!price) throw new Error(`No price configured for model ${stage.model}`);
  const { charsPerToken, tokensPerImage } = config.limits.spendReservation;
  let chars = req.system.reduce((n, s) => n + s.length, 0) + (req.schema ? JSON.stringify(req.schema).length : 0);
  let images = 0;
  for (const m of req.messages) {
    if (typeof m.content === "string") chars += m.content.length;
    else
      for (const b of m.content) {
        if (b.type === "text") chars += b.text.length;
        // Base64 data says nothing about an image's tokens.
        else if (b.type === "image" || b.type === "document") images++;
        else chars += JSON.stringify(b).length;
      }
  }
  const input = Math.ceil(chars / charsPerToken) + images * tokensPerImage;
  return ((input * price.input + stage.maxTokens * price.output) / 1_000_000) * config.eurPerUsd;
}

export class ModelOutputError extends Error {
  constructor(
    message: string,
    readonly response: ModelResponse,
  ) {
    super(message);
    this.name = "ModelOutputError";
  }
}

/**
 * `ledger` reserves each call's estimate under the daily cap and books its tokens and € per stage (also
 * for calls whose answer is unusable, when usage is known). Or, for a local ledger: `spentToday` (€ already
 * spent today) and `onCall` (persist one call's record).
 */
export type ModelClientOptions = { config: AppConfig; transport: ModelTransport } & SpendSource;

/**
 * The one entry point for model calls. Enforces the daily spend cap, logs tokens and € per stage,
 * and resolves the model/effort for each stage from config.
 */
export class ModelClient {
  private readonly ledger: SpendLedger;

  constructor(private readonly opts: ModelClientOptions) {
    this.ledger = ledgerOf(opts);
  }

  /** Retry limits from config, for stages that loop over `call` themselves. */
  get limits(): AppConfig["limits"] {
    return this.opts.config.limits;
  }

  stageConfig(stage: ModelStageName) {
    const { config } = this.opts;
    if (config.useFullBuildModel && (stage === "content" || stage === "brief")) {
      return { ...config.models[stage], model: config.models.fullBuild.model, effort: config.models.fullBuild.effort };
    }
    return config.models[stage];
  }

  async call(req: ModelRequest): Promise<ModelResponse> {
    const { config } = this.opts;
    const stage = this.stageConfig(req.stage);
    const reservation = await this.ledger.reserve({ stage: req.stage, model: stage.model, estimateEur: estimateCallEur(config, stage, req), capEur: config.limits.dailyModelSpendCapEur });
    const started = Date.now();
    let res: ModelResponse;
    try {
      res = await this.opts.transport.send(req, stage);
    } catch (e) {
      // No answer, so no usage to book.
      await reservation.release();
      throw e;
    }
    // Price by the model the API reports; if it reports an ID we have no price for (e.g. a dated
    // alias), use the requested model's price so the call is still logged and counted against the cap.
    const priced = this.opts.config.pricesUsdPerMTok[res.model] ? res.model : stage.model;
    const record: CallRecord = {
      stage: req.stage,
      model: res.model,
      usage: res.usage,
      costEur: costEur(this.opts.config, priced, res.usage),
      durationMs: Date.now() - started,
      ok: res.stopReason !== "refusal" && res.stopReason !== "max_tokens",
    };
    await reservation.settle(record);
    if (res.stopReason === "refusal") throw new ModelOutputError(`Model declined the ${req.stage} request`, res);
    if (res.stopReason === "max_tokens") throw new ModelOutputError(`Model output for ${req.stage} hit max_tokens`, res);
    return res;
  }

  /** Stages whose schema the API refused for structured output (too many unions etc.); they use plain JSON. */
  private readonly plainJsonStages = new Set<ModelStageName>();

  /**
   * Calls with a JSON schema and returns the parsed, validated value. Uses structured output; if the
   * API rejects the schema, falls back to plain JSON with the schema in the prompt (remembered per
   * stage). Output that fails `parse` is retried with the errors, at most `retries` times (PRODUCT.md: max 2).
   */
  async callJson<T>(
    req: ModelRequest & { schema: Record<string, unknown> },
    parse: (data: unknown) => T,
    retries = this.opts.config.limits.jsonRetries,
  ): Promise<{ data: T; response: ModelResponse }> {
    let failures = 0;
    let messages = req.messages;
    const plainInstruction = `Answer with a single JSON object only, matching this JSON Schema:\n${JSON.stringify(req.schema)}`;
    if (this.plainJsonStages.has(req.stage)) messages = appendToLastUser(messages, plainInstruction);
    for (;;) {
      const structured = !this.plainJsonStages.has(req.stage);
      let response: ModelResponse;
      try {
        response = await this.call({ ...req, messages, ...(structured ? {} : { schema: undefined }) });
      } catch (e) {
        if (structured && isSchemaRejection(e)) {
          this.plainJsonStages.add(req.stage);
          messages = appendToLastUser(messages, plainInstruction);
          continue;
        }
        throw e;
      }
      let problem: string;
      try {
        return { data: parse(JSON.parse(extractJson(response.text))), response };
      } catch (e) {
        problem = e instanceof SyntaxError ? "The answer was not valid JSON." : `The answer did not match the schema: ${(e as Error).message.slice(0, 1500)}`;
      }
      if (++failures > retries) throw new ModelOutputError(`Model output for ${req.stage} is invalid: ${problem.slice(0, 300)}`, response);
      messages = [...messages, { role: "assistant", content: response.text }, { role: "user", content: `${problem}\nReturn the corrected JSON object only.` }];
    }
  }
}

/** A 400 from the API refusing the JSON schema for structured output. */
export function isSchemaRejection(e: unknown): boolean {
  const err = e as { status?: number; message?: string };
  return err.status === 400 && /schema|output_config|format|grammar|union/i.test(err.message ?? "");
}

function appendToLastUser(messages: Anthropic.MessageParam[], text: string): Anthropic.MessageParam[] {
  const out = [...messages];
  const last = out[out.length - 1];
  if (!last || last.role !== "user") return [...out, { role: "user", content: text }];
  const content: Anthropic.ContentBlockParam[] = typeof last.content === "string" ? [{ type: "text", text: last.content }] : [...last.content];
  content.push({ type: "text", text });
  out[out.length - 1] = { role: "user", content };
  return out;
}

/** Tolerates a fenced block when structured output is off. */
/**
 * The JSON value in a model answer. Models sometimes add prose, or answer twice ("Wait: … Corrected
 * output: {…}"), so this takes the last complete top-level JSON value that parses and has the same
 * shape (top-level keys) as the main answer, ignoring fragments quoted in prose. Falls back to the text
 * from the first bracket, so parse errors still say why.
 */
export function extractJson(text: string): string {
  const parsed = topLevelJson(text).flatMap((raw) => {
    try {
      return [{ raw, shape: shapeOf(JSON.parse(raw)) }];
    } catch {
      return [];
    }
  });
  if (parsed.length) {
    const main = parsed.reduce((a, b) => (b.raw.length > a.raw.length ? b : a));
    return parsed.filter((c) => c.shape === main.shape).at(-1)!.raw;
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) return fenced[1]!.trim();
  const start = text.search(/[[{]/);
  return start > 0 ? text.slice(start) : text;
}

const shapeOf = (v: unknown): string => (Array.isArray(v) ? "[]" : v && typeof v === "object" ? Object.keys(v).sort().join(",") : typeof v);

/** Balanced top-level {…} / […] spans, string- and escape-aware. */
function topLevelJson(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (depth > 0 && ch === '"') inString = true;
    else if (ch === "{" || ch === "[") {
      if (depth === 0) start = i;
      depth++;
    } else if ((ch === "}" || ch === "]") && depth > 0) {
      depth--;
      if (depth === 0) out.push(text.slice(start, i + 1));
    }
  }
  return out;
}

/** Stable hash of a request, for recordings. Ignores nothing: any prompt change invalidates a recording. */
export function requestHash(req: ModelRequest, model: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ model, stage: req.stage, system: req.system, messages: req.messages, schema: req.schema ?? null }))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Real Messages API transport. Parameter names checked against the current SDK
 * (@anthropic-ai/sdk 0.129: output_config.effort, output_config.format {type:"json_schema"},
 * cache_control on system blocks). Streaming avoids HTTP timeouts on long outputs.
 */
export class AnthropicTransport implements ModelTransport {
  private readonly client: Anthropic;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  async send(req: ModelRequest, stage: AppConfig["models"][ModelStageName]): Promise<ModelResponse> {
    const outputConfig: Anthropic.OutputConfig = {};
    // Haiku 4.5 does not accept effort; the config simply omits it for that stage.
    if (stage.effort) outputConfig.effort = stage.effort;
    if (req.schema) outputConfig.format = { type: "json_schema", schema: toStructuredOutputSchema(req.schema) as Record<string, unknown> };
    // A breakpoint after every static block: content, critique and edit all start with the section
    // catalogue, so they read one cache entry for it instead of each writing their own (API max: 4).
    if (req.system.length > 3) throw new Error(`At most 3 system blocks (cache breakpoints), got ${req.system.length}`);
    const system: Anthropic.TextBlockParam[] = req.system.map((text) => ({ type: "text", text, cache_control: { type: "ephemeral" as const } }));
    const stream = this.client.messages.stream({
      model: stage.model,
      max_tokens: stage.maxTokens,
      system,
      messages: req.messages,
      ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
    });
    const msg = await stream.finalMessage();
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return {
      text,
      stopReason: msg.stop_reason,
      model: msg.model || stage.model,
      usage: {
        input_tokens: msg.usage.input_tokens,
        output_tokens: msg.usage.output_tokens,
        cache_creation_input_tokens: msg.usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: msg.usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}
