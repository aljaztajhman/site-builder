import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { costEur, type AppConfig, type ModelStageName } from "@sb/config";

/** The request shape the pipeline sends; a subset of the Messages API. */
export interface ModelRequest {
  stage: ModelStageName;
  /** Static, cacheable system blocks first (prompt, catalogue, directions); cached with cache_control. */
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

  /** Calls with a JSON schema and parses the JSON text. Validation against zod is the caller's job. */
  async callJson<T = unknown>(req: ModelRequest & { schema: Record<string, unknown> }): Promise<{ data: T; response: ModelResponse }> {
    const response = await this.call(req);
    try {
      return { data: JSON.parse(extractJson(response.text)) as T, response };
    } catch {
      throw new ModelOutputError(`Model output for ${req.stage} is not valid JSON`, response);
    }
  }
}

/** Tolerates a fenced block when structured output is off. */
export function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) return fenced[1]!.trim();
  const start = text.search(/[[{]/);
  return start > 0 ? text.slice(start) : text;
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
    if (req.schema) outputConfig.format = { type: "json_schema", schema: req.schema };
    const system: Anthropic.TextBlockParam[] = req.system.map((text, i) => ({
      type: "text",
      text,
      // One breakpoint after the last static block caches the whole static prefix.
      ...(i === req.system.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
    }));
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
