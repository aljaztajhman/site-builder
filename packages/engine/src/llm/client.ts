import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { costEur, priceCard, type AppConfig, type ModelStageConfig, type ModelStageName } from "@sb/config";
import { toStructuredOutputSchema } from "./structured-schema.ts";

/** The request shape the pipeline sends; a subset of the Messages API. */
export interface ModelRequest {
  stage: ModelStageName;
  /**
   * Static, cacheable system blocks, most shared first: each block ends with a cache breakpoint
   * (max 3), so stages that start with the same block (the section catalogue) share its cache entry.
   */
  system: string[];
  /**
   * false: no cache breakpoints. For stages whose blocks nobody reads back within the cache's 5 minutes (brief,
   * design, alt text run once per job), where a breakpoint only adds the 1.25× write. Not part of `requestHash`.
   */
  cache?: boolean;
  messages: Anthropic.MessageParam[];
  /** JSON Schema for structured output. Omit for free text. */
  schema?: Record<string, unknown>;
  /** Tools the model may call: client tools (`name`, `description`, `input_schema`) and the server-side advisor. */
  tools?: ModelTool[];
  /** How the model picks tools. Use `auto`: Opus and Sonnet 5.5 reject forced `any` / `tool` (400). */
  toolChoice?: Anthropic.ToolChoice;
  /** Extra Messages API beta headers. The advisor beta is added by itself when `tools` has an advisor. */
  betas?: string[];
}

/** Beta header of the server-side advisor tool. */
export const ADVISOR_BETA = "advisor-tool-2026-03-01";

/**
 * The advisor tool (a fast executor consults a stronger model). `max_uses` and `max_tokens` are required here: they
 * bound the advisor's share of the cost, which the spend reservation prices as max_uses × (input + max_tokens of
 * output) at the advisor model's configured price. Without max_tokens the advisor would use its own model's default
 * output cap, which the reservation can't know.
 */
export type AdvisorToolSpec = Anthropic.Beta.BetaAdvisorTool20260301 & { max_uses: number; max_tokens: number };

export type ModelTool = Anthropic.Tool | AdvisorToolSpec;

export const isAdvisorTool = (t: ModelTool): t is AdvisorToolSpec => (t as { type?: string }).type === "advisor_20260301";

/** A client `tool_use` block of an answer. */
export type ModelToolUse = Pick<Anthropic.ToolUseBlock, "id" | "name" | "input">;

/** Answer blocks as the API returns them (the beta ones carry advisor results). Pass them back unchanged. */
export type ModelContentBlock = Anthropic.ContentBlock | Anthropic.Beta.BetaContentBlock;

/** Tokens an advisor sub-inference used, billed at the advisor model's price. */
export interface AdvisorUsage {
  model: string;
  usage: ModelUsage;
}

const needsBeta = (req: ModelRequest): boolean => !!req.betas?.length || !!req.tools?.some(isAdvisorTool);
export const betasOf = (req: ModelRequest): string[] => [...new Set([...(req.betas ?? []), ...(req.tools?.some(isAdvisorTool) ? [ADVISOR_BETA] : [])])];

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
  /** Answered through the Message Batches API: priced at config `batchPriceFactor`. */
  batch?: boolean;
  /** Every content block (thinking, tool_use, advisor results, ...), in order. Only kept for requests with `tools`. */
  content?: ModelContentBlock[];
  /** The client `tool_use` blocks of `content`. Only set when there are some. */
  toolUses?: ModelToolUse[];
  /** Advisor sub-inferences of this call (their tokens are not in `usage`). */
  advisorUsage?: AdvisorUsage[];
}

export interface CallRecord {
  /** A model stage, or "imageGen" for a generated image (no tokens, priced per image). */
  stage: ModelStageName | "imageGen";
  model: string;
  usage: ModelUsage;
  costEur: number;
  durationMs: number;
  ok: boolean;
  /** Advisor sub-inferences, already included in `costEur` (priced per advisor model). Only set when there were some. */
  advisor?: AdvisorUsage[];
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
 * and the stage's whole maxTokens of output (thinking included), the most it can bill. A model with a long-prompt
 * card is priced at it when that estimated input is over its threshold.
 */
export function estimateCallEur(config: AppConfig, stage: ModelStageConfig, req: ModelRequest): number {
  if (!config.pricesUsdPerMTok[stage.model]) throw new Error(`No price configured for model ${stage.model}`);
  const { charsPerToken, tokensPerImage } = config.limits.spendReservation;
  let chars = req.system.reduce((n, s) => n + s.length, 0) + (req.schema ? JSON.stringify(req.schema).length : 0) + (req.tools?.length ? JSON.stringify(req.tools).length : 0);
  let images = 0;
  const count = (b: { type: string } & Record<string, unknown>): void => {
    if (b.type === "text") chars += String(b.text).length;
    // Base64 data says nothing about an image's tokens.
    else if (b.type === "image" || b.type === "document") images++;
    else if (b.type === "tool_result" && typeof b.content === "string") chars += b.content.length;
    // A tool result's pictures are priced like any other picture, not by their base64 text.
    else if (b.type === "tool_result" && Array.isArray(b.content)) for (const c of b.content as ({ type: string } & Record<string, unknown>)[]) count(c);
    else chars += JSON.stringify(b).length;
  };
  for (const m of req.messages) {
    if (typeof m.content === "string") chars += m.content.length;
    else for (const b of m.content) count(b as unknown as { type: string } & Record<string, unknown>);
  }
  const input = Math.ceil(chars / charsPerToken) + images * tokensPerImage;
  const price = priceCard(config, stage.model, input);
  let usd = (input * price.input + stage.maxTokens * price.output) / 1_000_000;
  // Each advisor use reads the transcript and writes up to its max_tokens, at the advisor model's price.
  for (const tool of req.tools ?? []) {
    if (!isAdvisorTool(tool)) continue;
    if (!config.pricesUsdPerMTok[tool.model]) throw new Error(`No price configured for advisor model ${tool.model}`);
    const advisor = priceCard(config, tool.model, input);
    usd += (tool.max_uses * (input * advisor.input + tool.max_tokens * advisor.output)) / 1_000_000;
  }
  return usd * config.eurPerUsd;
}

/**
 * A stage's settings as they are sent, after its model's config `modelTraits`: max_tokens at least the model's
 * `minMaxTokens` (thinking counts toward it), and the model's `defaultEffort` when the stage sets none. A model without
 * traits gets its stage's settings unchanged.
 */
export function effectiveStage(config: Pick<AppConfig, "modelTraits">, stage: ModelStageConfig): ModelStageConfig {
  const traits = config.modelTraits?.[stage.model];
  if (!traits) return stage;
  const effort = stage.effort ?? traits.defaultEffort;
  return { ...stage, maxTokens: Math.max(stage.maxTokens, traits.minMaxTokens ?? 0), ...(effort ? { effort } : {}) };
}

export class ModelOutputError extends Error {
  constructor(
    message: string,
    readonly response: ModelResponse,
    /** What the unusable call cost (it was billed and logged). */
    readonly costEur = 0,
  ) {
    super(message);
    this.name = "ModelOutputError";
  }
}

/** What a tool handler returns: text, or content blocks (images allowed), or the `{ content, isError, done }` form. */
export type AgentToolContent = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>;
export interface AgentToolResult {
  content: AgentToolContent;
  /** Sent as `is_error: true`, so the model sees the tool failed. */
  isError?: boolean;
  /** Stop the loop after this turn's results are appended (e.g. a "finish" tool). */
  done?: boolean;
}
export type AgentHandler = (input: unknown, ctx: { id: string; turn: number }) => Promise<AgentToolContent | AgentToolResult> | AgentToolContent | AgentToolResult;

export interface AgentOptions {
  stage: ModelStageName;
  system: string[];
  messages: Anthropic.MessageParam[];
  tools: ModelTool[];
  /** By tool name. A tool_use for a name with no handler is answered with an error result. */
  handlers: Record<string, AgentHandler>;
  /** Model calls at most. */
  maxTurns: number;
  /** € this loop may spend, checked after each turn. */
  maxEur: number;
  toolChoice?: Anthropic.ToolChoice;
  betas?: string[];
  cache?: boolean;
  /** Hears each turn and why the loop stopped (default: cap stops go to console.warn). */
  log?: (event: AgentLogEvent) => void;
}

export type AgentStopReason = "end_turn" | "handler" | "maxTurns" | "maxEur" | "spendCap" | "refusal" | "max_tokens" | "context_window";

export type AgentLogEvent =
  | { type: "turn"; stage: ModelStageName; turn: number; stopReason: string | null; tools: string[]; costEur: number }
  | { type: "stop"; stage: ModelStageName; stopped: AgentStopReason; turns: number; costEur: number; message?: string };

export interface AgentResult {
  stopped: AgentStopReason;
  turns: number;
  /** € booked by this loop's turns (advisor included). */
  costEur: number;
  /** The transcript: the input messages, then each turn's assistant message and tool results. */
  messages: Anthropic.MessageParam[];
  responses: ModelResponse[];
  /** The last answer's text. */
  text: string;
  /** The cap error or unusable answer that stopped the loop. */
  error?: Error;
}

const CAP_STOPS = new Set<AgentStopReason>(["maxTurns", "maxEur", "spendCap"]);
function defaultAgentLog(e: AgentLogEvent): void {
  if (e.type === "stop" && CAP_STOPS.has(e.stopped)) console.warn(`[agent] ${e.stage} stopped by ${e.stopped} after ${e.turns} turns, €${e.costEur.toFixed(4)}${e.message ? `: ${e.message}` : ""}`);
}

/** Content for an answer a transport returned without `content` (a scripted one): its text and tool_use blocks. */
function fallbackContent(r: ModelResponse): Anthropic.ContentBlockParam[] {
  return [...(r.text ? [{ type: "text" as const, text: r.text }] : []), ...(r.toolUses ?? []).map((t) => ({ type: "tool_use" as const, id: t.id, name: t.name, input: t.input }))];
}

async function runHandler(handler: AgentHandler | undefined, use: ModelToolUse, turn: number): Promise<AgentToolResult> {
  if (!handler) return { content: `Unknown tool: ${use.name}`, isError: true };
  try {
    const out = await handler(use.input, { id: use.id, turn });
    return typeof out === "string" || Array.isArray(out) ? { content: out } : out;
  } catch (e) {
    return { content: `Tool ${use.name} failed: ${(e as Error).message.slice(0, 500)}`, isError: true };
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

  /** The audit's prompt fixes (config promptFixes), for the stages that build prompts. */
  get promptFixes(): AppConfig["promptFixes"] {
    return this.opts.config.promptFixes;
  }

  /** Config prompts.compactCatalogue: the section catalogue and business schema in the compact notation. */
  get catalogueOptions(): { compact?: boolean } {
    return this.opts.config.prompts.compactCatalogue ? { compact: true } : {};
  }

  /** The settings a stage's calls are sent with (config models, then the model's traits: see `effectiveStage`). */
  stageConfig(stage: ModelStageName): ModelStageConfig {
    const { config } = this.opts;
    if (config.useFullBuildModel && (stage === "content" || stage === "brief")) {
      return effectiveStage(config, { ...config.models[stage], model: config.models.fullBuild.model, effort: config.models.fullBuild.effort });
    }
    return effectiveStage(config, config.models[stage]);
  }

  async call(req: ModelRequest): Promise<ModelResponse> {
    return (await this.callRecorded(req)).response;
  }

  /**
   * `call`, also returning the last record that was booked and `costEur`, what the call cost in all. A refusal on a
   * model with a config `modelTraits` refusalRetryModel (no server-side fallback) is sent once more on that model: the
   * refused call is billed and logged too, and counts in `costEur`.
   */
  private async callRecorded(req: ModelRequest): Promise<{ response: ModelResponse; record: CallRecord; costEur: number }> {
    // An answer can't be prefilled: the 5.5 models reject an assistant message last (400). A tool loop's paused
    // server-tool turn (pause_turn) is the one exception: it is sent back as is, to be continued.
    if (!req.tools?.length && req.messages.at(-1)?.role === "assistant") throw new Error(`The ${req.stage} request ends with an assistant message (prefill), which the API rejects`);
    const stage = this.stageConfig(req.stage);
    let { response: res, record } = await this.sendBilled(req, stage);
    let total = record.costEur;
    const retryModel = res.stopReason === "refusal" ? this.opts.config.modelTraits?.[stage.model]?.refusalRetryModel : undefined;
    if (retryModel && retryModel !== stage.model) {
      console.warn(`[model] ${req.stage}: ${res.model} declined (stop_reason refusal, €${record.costEur.toFixed(4)}); sending it once more on ${retryModel}`);
      ({ response: res, record } = await this.sendBilled(req, effectiveStage(this.opts.config, { ...stage, model: retryModel })));
      total += record.costEur;
    }
    if (res.stopReason === "refusal") throw new ModelOutputError(`Model declined the ${req.stage} request`, res, total);
    if (res.stopReason === "max_tokens") throw new ModelOutputError(`Model output for ${req.stage} hit max_tokens`, res, total);
    return { response: res, record, costEur: total };
  }

  /** One request on `stage`: reserved under the daily cap, sent, and its tokens and € booked (also when unusable). */
  private async sendBilled(req: ModelRequest, stage: ModelStageConfig): Promise<{ response: ModelResponse; record: CallRecord }> {
    const { config } = this.opts;
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
    const priced = config.pricesUsdPerMTok[res.model] ? res.model : stage.model;
    // Advisor sub-inferences are billed at the advisor's price and are not in `usage`. A model with no configured
    // price (a dated alias) is priced as the advisor model the request named.
    const requested = req.tools?.find(isAdvisorTool)?.model;
    const advisorEur = (res.advisorUsage ?? []).reduce((n, a) => n + costEur(config, config.pricesUsdPerMTok[a.model] ? a.model : (requested ?? stage.model), a.usage), 0);
    const record: CallRecord = {
      stage: req.stage,
      model: res.model,
      usage: res.usage,
      costEur: costEur(config, priced, res.usage, res.batch) + advisorEur,
      durationMs: Date.now() - started,
      ok: res.stopReason !== "refusal" && res.stopReason !== "max_tokens",
      ...(res.advisorUsage?.length ? { advisor: res.advisorUsage } : {}),
    };
    await reservation.settle(record);
    return { response: res, record };
  }

  /**
   * A tool-use loop: every turn goes through `call`'s path (reservation under the daily cap, per-stage log of tokens
   * and €), runs the `handlers` for the answer's `tool_use` blocks and sends all their results back in one user
   * message, until the model stops calling tools, a handler says `done`, or a cap is hit. A cap never throws: the loop
   * returns what it has with `stopped` saying why, and `log` hears which cap. Only transport errors propagate.
   * Caps: `maxTurns` model calls; `maxEur` of spend in this loop, checked after each turn (the last turn may overshoot
   * it by one call); the daily cap (SpendCapError from the ledger), checked before each turn.
   */
  async runAgent(opts: AgentOptions): Promise<AgentResult> {
    const { handlers, maxTurns, maxEur, log = defaultAgentLog } = opts;
    // A missing config value (NaN, undefined) would switch both caps off; the daily cap would be the only brake.
    if (!Number.isInteger(maxTurns) || maxTurns < 1) throw new Error(`runAgent: maxTurns must be a positive integer, got ${maxTurns}`);
    if (!Number.isFinite(maxEur) || maxEur <= 0) throw new Error(`runAgent: maxEur must be a positive number, got ${maxEur}`);
    const messages: Anthropic.MessageParam[] = [...opts.messages];
    const responses: ModelResponse[] = [];
    let costTotal = 0;
    const result = (stopped: AgentStopReason, error?: Error): AgentResult => {
      log({ type: "stop", stage: opts.stage, stopped, turns: responses.length, costEur: costTotal, ...(error ? { message: error.message } : {}) });
      return { stopped, turns: responses.length, costEur: costTotal, messages, responses, text: responses.at(-1)?.text ?? "", ...(error ? { error } : {}) };
    };
    for (;;) {
      if (responses.length >= maxTurns) return result("maxTurns");
      if (costTotal >= maxEur) return result("maxEur");
      const req: ModelRequest = {
        stage: opts.stage,
        system: opts.system,
        // A copy: the loop keeps growing `messages`, a transport may keep the request.
        messages: [...messages],
        tools: opts.tools,
        ...(opts.toolChoice ? { toolChoice: opts.toolChoice } : {}),
        ...(opts.betas ? { betas: opts.betas } : {}),
        ...(opts.cache === false ? { cache: false } : {}),
      };
      let response: ModelResponse;
      try {
        const done = await this.callRecorded(req);
        response = done.response;
        costTotal += done.costEur;
      } catch (e) {
        if (e instanceof SpendCapError) return result("spendCap", e);
        if (e instanceof ModelOutputError) {
          // Billed but unusable: refusal or max_tokens. Its cost counts; the answer is not added to the transcript.
          responses.push(e.response);
          costTotal += e.costEur;
          return result(e.response.stopReason === "refusal" ? "refusal" : "max_tokens", e);
        }
        throw e;
      }
      responses.push(response);
      log({ type: "turn", stage: opts.stage, turn: responses.length, stopReason: response.stopReason, tools: (response.toolUses ?? []).map((t) => t.name), costEur: costTotal });
      // All returned blocks go back unchanged (thinking, advisor results included).
      messages.push({ role: "assistant", content: (response.content ?? fallbackContent(response)) as Anthropic.ContentBlockParam[] });
      // The context window ran out mid-answer: any tool input may be cut off and the next turn would be longer still.
      if (response.stopReason === "model_context_window_exceeded") return result("context_window");
      const uses = response.toolUses ?? [];
      if (response.stopReason === "pause_turn" && !uses.length) continue; // a paused server-tool turn: ask again as is
      if (!uses.length) return result("end_turn");
      const results: Anthropic.ToolResultBlockParam[] = [];
      let finished = false;
      for (const use of uses) {
        const out = await runHandler(handlers[use.name], use, responses.length);
        results.push({ type: "tool_result", tool_use_id: use.id, content: out.content, ...(out.isError ? { is_error: true } : {}) });
        if (out.done) finished = true;
      }
      messages.push({ role: "user", content: results });
      if (finished) return result("handler");
    }
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

/**
 * A site's id (`site_` + 16 hex, platform `newId`) inside a storage key: `sites/<id>/uploads/…`, `…/generated/…`.
 * The edit request carries the whole spec, so its picture and logo `src` hold the run's random site id.
 */
const SITE_ID_IN_KEY = /\bsites\/site_[0-9a-f]{16}\//g;

/**
 * Stable hash of a request, for recordings. Any prompt change invalidates a recording, except the site id inside
 * storage keys: every run creates a new site, so without this an edit request never matched between two runs
 * (`--record-missing` re-paid every edit). Only the hash input is normalised; the request sent is untouched. A
 * request without such a key hashes exactly as before, so recordings of the other stages keep matching.
 *
 * A request with `tools` / `toolChoice` / `betas` also hashes those, and its messages (tool_use and tool_result
 * blocks included) with every base64 picture replaced by the hash of its bytes, so a loop's turns each get their own
 * hash. A request without them hashes exactly as before (the keys are not added, pictures stay inline).
 */
export function requestHash(req: ModelRequest, model: string): string {
  const withTools = !!req.tools?.length || !!req.toolChoice || !!req.betas?.length;
  const json = JSON.stringify({
    model,
    stage: req.stage,
    system: req.system,
    messages: withTools ? req.messages.map(hashableMessage) : req.messages,
    schema: req.schema ?? null,
    ...(withTools ? { tools: req.tools ?? null, toolChoice: req.toolChoice ?? null, betas: req.betas ?? null } : {}),
  });
  return createHash("sha256").update(json.replace(SITE_ID_IN_KEY, "sites/site_*/")).digest("hex").slice(0, 16);
}

/** The message with base64 picture data (also inside tool results) replaced by `sha256:<hash of the data>`. */
function hashableMessage<T>(value: T): T {
  if (Array.isArray(value)) return value.map(hashableMessage) as T;
  if (!value || typeof value !== "object") return value;
  const o = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === "data" && typeof v === "string" && o.type === "base64") out[k] = `sha256:${createHash("sha256").update(v).digest("hex")}`;
    else out[k] = hashableMessage(v);
  }
  return out as T;
}

/** The body fields both Messages endpoints share. */
function baseParams(req: ModelRequest, stage: AppConfig["models"][ModelStageName]) {
  const outputConfig: Anthropic.OutputConfig = {};
  // Haiku 4.5 does not accept effort; the config simply omits it for that stage. A model with config modelTraits
  // (Haiku 5.5) always has one by now (ModelClient.stageConfig). No temperature, top_p, top_k, thinking budget or
  // `fallbacks` is ever sent: the 5.5 models reject the first four (400), and Haiku 5.5 has no server-side fallback.
  if (stage.effort) outputConfig.effort = stage.effort;
  if (req.schema) outputConfig.format = { type: "json_schema", schema: toStructuredOutputSchema(req.schema) as Record<string, unknown> };
  // A breakpoint after every static block: content, critique and edit all start with the section
  // catalogue, so they read one cache entry for it instead of each writing their own (API max: 4).
  if (req.system.length > 3) throw new Error(`At most 3 system blocks (cache breakpoints), got ${req.system.length}`);
  const cache = req.cache === false ? {} : { cache_control: { type: "ephemeral" as const } };
  const system: Anthropic.TextBlockParam[] = req.system.map((text) => ({ type: "text", text, ...cache }));
  return {
    model: stage.model,
    max_tokens: stage.maxTokens,
    system,
    messages: req.messages,
    ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
    ...(req.toolChoice ? { tool_choice: req.toolChoice } : {}),
  };
}

/**
 * The Messages API body for a request. Parameter names checked against the current SDK (@anthropic-ai/sdk 0.129:
 * output_config.effort, output_config.format {type:"json_schema"}, cache_control on system blocks, tools,
 * tool_choice). Shared by the live transport and the eval's batch transport (a batch request's params are the same
 * body). A request that needs a beta (the advisor tool) has no such body: see `betaMessageParams`.
 */
export function messageParams(req: ModelRequest, stage: AppConfig["models"][ModelStageName]): Anthropic.MessageCreateParamsNonStreaming {
  if (needsBeta(req)) throw new Error("This request needs a beta header (advisor tool); build it with betaMessageParams and send it through AnthropicTransport");
  return { ...baseParams(req, stage), ...(req.tools?.length ? { tools: req.tools as Anthropic.Tool[] } : {}) };
}

/**
 * The beta Messages API body (`client.beta.messages`): the same fields plus `betas` (the `anthropic-beta` header)
 * and tools that include the advisor, `{ type: "advisor_20260301", name: "advisor", model, max_uses?, max_tokens?,
 * caching? }`.
 */
export function betaMessageParams(req: ModelRequest, stage: AppConfig["models"][ModelStageName]): Anthropic.Beta.Messages.MessageCreateParamsNonStreaming {
  const betas = betasOf(req);
  return {
    ...(baseParams(req, stage) as Omit<Anthropic.Beta.Messages.MessageCreateParamsNonStreaming, "betas" | "tools">),
    ...(req.tools?.length ? { tools: req.tools as Anthropic.Beta.BetaToolUnion[] } : {}),
    ...(betas.length ? { betas } : {}),
  };
}

/**
 * A Messages API answer as the pipeline reads it. `opts.content` keeps every content block (thinking, tool_use,
 * advisor results) plus the client `tool_use` blocks and the advisor sub-inferences' usage: for tool requests.
 */
export function toModelResponse(msg: Anthropic.Message | Anthropic.Beta.BetaMessage, stage: AppConfig["models"][ModelStageName], opts: { content?: boolean } = {}): ModelResponse {
  const blocks: ModelContentBlock[] = msg.content;
  const text = blocks
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const res: ModelResponse = {
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
  if (!opts.content) return res;
  res.content = blocks;
  const toolUses = blocks.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, input: b.input }));
  if (toolUses.length) res.toolUses = toolUses;
  // The advisor's tokens are billed at its own model's price and are listed apart from the top-level usage.
  const iterations = "iterations" in msg.usage ? (msg.usage.iterations ?? []) : [];
  const advisorUsage = iterations
    .filter((i): i is Anthropic.Beta.BetaAdvisorMessageIterationUsage => i.type === "advisor_message")
    .map((i) => ({
      model: i.model as string,
      usage: { input_tokens: i.input_tokens, output_tokens: i.output_tokens, cache_creation_input_tokens: i.cache_creation_input_tokens, cache_read_input_tokens: i.cache_read_input_tokens },
    }));
  if (advisorUsage.length) res.advisorUsage = advisorUsage;
  return res;
}

/** Real Messages API transport. Streaming avoids HTTP timeouts on long outputs. */
export class AnthropicTransport implements ModelTransport {
  private readonly client: Anthropic;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  async send(req: ModelRequest, stage: AppConfig["models"][ModelStageName]): Promise<ModelResponse> {
    const content = !!req.tools?.length;
    if (needsBeta(req)) return toModelResponse(await this.client.beta.messages.stream(betaMessageParams(req, stage)).finalMessage(), stage, { content });
    return toModelResponse(await this.client.messages.stream(messageParams(req, stage)).finalMessage(), stage, { content });
  }
}
