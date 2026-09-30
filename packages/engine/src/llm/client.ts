import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { costEur, type AppConfig, type ModelStageName } from "@sb/config";
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
  stage: ModelStageName;
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
    super(`Daily model spend cap reached: €${spent.toFixed(2)} of €${cap.toFixed(2)}. Generation is paused until tomorrow (UTC).`);
    this.name = "SpendCapError";
  }
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

export interface ModelClientOptions {
  config: AppConfig;
  transport: ModelTransport;
  /** € already spent today (from the database). Checked before every call. */
  spentToday: () => Promise<number>;
  /** Persist one call's tokens and cost (per stage). Called for failed calls too when usage is known. */
  onCall: (record: CallRecord) => Promise<void>;
}

/**
 * The one entry point for model calls. Enforces the daily spend cap, logs tokens and € per stage,
 * and resolves the model/effort for each stage from config.
 */
export class ModelClient {
  constructor(private readonly opts: ModelClientOptions) {}

  stageConfig(stage: ModelStageName) {
    const { config } = this.opts;
    if (config.useFullBuildModel && (stage === "content" || stage === "brief")) {
      return { ...config.models[stage], model: config.models.fullBuild.model, effort: config.models.fullBuild.effort };
    }
    return config.models[stage];
  }

  async call(req: ModelRequest): Promise<ModelResponse> {
    const cap = this.opts.config.limits.dailyModelSpendCapEur;
    const spent = await this.opts.spentToday();
    if (spent >= cap) throw new SpendCapError(spent, cap);
    const stage = this.stageConfig(req.stage);
    const started = Date.now();
    const res = await this.opts.transport.send(req, stage);
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
    await this.opts.onCall(record);
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
    retries = 2,
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
