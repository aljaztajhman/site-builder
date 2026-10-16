/**
 * How the outside reviewers (outside-review.ts) reach their models: OpenRouter's chat completions API, or a directory of
 * recorded answers (the tests and `--replay` use that; `--record` writes it). Eval only. A request is identified by
 * its model and messages, never by the key or the other settings.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { AnthropicTransport, BatchTransport, type ModelRequest, type ModelTransport } from "@sb/engine";

export type ChatPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ChatMessage = { role: "system"; content: string } | { role: "user" | "assistant"; content: string | ChatPart[] };

export interface ChatBody {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  response_format?: { type: "json_object" } | { type: "json_schema"; json_schema: { name: string; strict: boolean; schema: Record<string, unknown> } };
}

export interface ChatResult {
  /** The answer's text; empty when the model returned none. */
  content: string;
  /** Answered from a recording (`record-missing`): nothing was paid for it. */
  replayed?: boolean;
  /** Answered through Anthropic's Message Batches API: priced at config `batchPriceFactor`. */
  batch?: boolean;
  usage?: { prompt_tokens?: number; completion_tokens?: number; /** OpenRouter's own cost of the call, in credits (≈ USD). */ cost?: number };
}

export interface OutsideTransport {
  /** Whether an answer costs money (live OpenRouter, recording); a replay is free and its calls are booked at € 0. */
  readonly paid: boolean;
  complete(body: ChatBody): Promise<ChatResult>;
  /**
   * A batching transport only queues in `complete`; `drain` sends the queue and settles the answers until `work` has
   * settled (its callers may queue retries). runReview then asks for a reviewer's pages together, not one by one.
   */
  drain?(work: Promise<unknown>[]): Promise<void>;
}

/**
 * The provider (OpenRouter, Anthropic) answered with an error status. A 4xx other than 408 (timeout) is refused before
 * the model runs (no credit, bad request, rate limit) and costs nothing; a 408 or 5xx may come after the model ran.
 */
export class ReviewHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ReviewHttpError";
  }

  get refusedBeforeRun(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 408;
  }
}

/** sha256 of the model and messages: the same page asked of the same model has the same hash whatever the key. */
export function requestHash(body: Pick<ChatBody, "model" | "messages">): string {
  return createHash("sha256").update(JSON.stringify({ model: body.model, messages: body.messages })).digest("hex");
}

const ApiResponse = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.union([z.string(), z.null()]).optional() }) })).min(1),
  usage: z.object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional(), cost: z.number().optional() }).optional(),
});

export class OpenRouterTransport implements OutsideTransport {
  readonly paid = true;
  constructor(
    private readonly baseUrl: string,
    private readonly key: string | undefined = process.env.OPENROUTER_API_KEY,
  ) {
    if (!key) throw new Error("OPENROUTER_API_KEY is not set (put it in .env; a live outside-review run needs it, --dry-run and --replay do not)");
  }

  async complete(body: ChatBody): Promise<ChatResult> {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json", "X-OpenRouter-Title": "Stranko eval" },
        // usage.include asks OpenRouter to report the call's cost in the answer.
        body: JSON.stringify({ ...body, usage: { include: true } }),
        signal: AbortSignal.timeout(300_000),
      });
      if (res.ok) {
        const parsed = ApiResponse.parse(await res.json());
        return { content: parsed.choices[0]!.message.content ?? "", ...(parsed.usage ? { usage: parsed.usage } : {}) };
      }
      const text = (await res.text()).slice(0, 300);
      if (res.status >= 500 && attempt < 2) continue;
      throw new ReviewHttpError(res.status, `${body.model}: HTTP ${res.status} ${text}`);
    }
  }
}

/**
 * `replay`: answers from `<dir>/<hash>.json`, throws for a request nobody recorded. `record`: asks `inner`, saves the
 * answer under the request's hash, returns it.
 */
export class RecordedTransport implements OutsideTransport {
  readonly paid: boolean;
  constructor(
    private readonly dir: string,
    private readonly mode: "replay" | "record" | "record-missing",
    private readonly inner?: OutsideTransport,
  ) {
    if (mode !== "replay" && !inner) throw new Error(`RecordedTransport: ${mode} mode needs a transport to record`);
    this.paid = mode !== "replay" && inner!.paid;
    if (inner?.drain) this.drain = (work) => inner.drain!(work);
  }

  drain?: (work: Promise<unknown>[]) => Promise<void>;

  async complete(body: ChatBody): Promise<ChatResult> {
    const file = path.join(this.dir, `${requestHash(body)}.json`);
    if (this.mode === "replay") {
      if (!existsSync(file)) throw new Error(`No recording for ${body.model} request ${requestHash(body).slice(0, 12)} in ${this.dir}`);
      return JSON.parse(readFileSync(file, "utf8")) as ChatResult;
    }
    // record-missing: an answer recorded earlier is reused (and booked at € 0); only new requests are paid for.
    if (this.mode === "record-missing" && existsSync(file)) return { ...(JSON.parse(readFileSync(file, "utf8")) as ChatResult), replayed: true };
    const result = await this.inner!.complete(body);
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
}

/**
 * The transport a run needs. Replay needs no key; a live run needs OPENROUTER_API_KEY and says so when it is missing.
 * `--record` wraps the live one.
 */
export function makeTransport(opts: {
  baseUrl: string;
  env: Record<string, string | undefined>;
  replay?: string;
  record?: string;
  /** Reuse the answers recorded in this dir, record the new ones (only those are paid). */
  recordMissing?: string;
  /** The reviewer this transport serves: an Anthropic reviewer gets ClaudeReviewTransport. */
  reviewer?: ClaudeReviewer;
  /** Tests: the engine transport an Anthropic reviewer sends through. */
  claudeInner?: ModelTransport & { drain?(work: Promise<unknown>[]): Promise<void> };
}): OutsideTransport {
  if (opts.replay) return new RecordedTransport(opts.replay, "replay");
  const live: OutsideTransport =
    opts.reviewer?.provider === "anthropic" ? new ClaudeReviewTransport(opts.reviewer, opts.claudeInner ?? claudeEngineTransport(opts.reviewer, opts.env.ANTHROPIC_API_KEY)) : new OpenRouterTransport(opts.baseUrl, opts.env.OPENROUTER_API_KEY);
  if (opts.recordMissing) return new RecordedTransport(opts.recordMissing, "record-missing", live);
  return opts.record ? new RecordedTransport(opts.record, "record", live) : live;
}

export interface ClaudeReviewer {
  provider?: "openrouter" | "anthropic";
  model: string;
  maxTokens: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  batch?: boolean;
}

function claudeEngineTransport(r: ClaudeReviewer, key: string | undefined): ModelTransport & { drain?(work: Promise<unknown>[]): Promise<void> } {
  if (!key) throw new Error(`ANTHROPIC_API_KEY is not set (the ${r.model} reviewer runs on Anthropic's API; --dry-run and --replay do not need it)`);
  // The batch transport's own client reads ANTHROPIC_API_KEY from the environment, like the eval's judge batches.
  return r.batch ? new BatchTransport() : new AnthropicTransport(key);
}

const dataUrlPart = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.*)$/s;

/**
 * An Anthropic reviewer (config `provider: "anthropic"`) through the engine's own transports: the live one
 * (AnthropicTransport) or, with `batch`, the Message Batches one (BatchTransport, at batchPriceFactor), so the request
 * body is built by the same verified code as the pipeline's (output_config.effort, output_config.format json_schema
 * via toStructuredOutputSchema). The OpenRouter-shaped request is translated: the system prompt as one uncached block,
 * images as base64 image blocks, the schema from response_format. An error status becomes a ReviewHttpError.
 */
export class ClaudeReviewTransport implements OutsideTransport {
  readonly paid = true;
  drain?: (work: Promise<unknown>[]) => Promise<void>;

  constructor(
    private readonly reviewer: ClaudeReviewer,
    private readonly inner: ModelTransport & { drain?(work: Promise<unknown>[]): Promise<void>; batches?: readonly string[] },
  ) {
    if (inner.drain) this.drain = (work) => inner.drain!(work);
  }

  /** The Message Batches sent so far (ids, for the Console when a run is interrupted). */
  get batches(): readonly string[] {
    return this.inner.batches ?? [];
  }

  async complete(body: ChatBody): Promise<ChatResult> {
    const system = body.messages.filter((m) => m.role === "system").map((m) => m.content as string);
    type Block = Exclude<ModelRequest["messages"][number]["content"], string>[number];
    const messages: ModelRequest["messages"] = body.messages
      .filter((m): m is Exclude<ChatMessage, { role: "system" }> => m.role !== "system")
      .map((m) => ({
        role: m.role,
        content:
          typeof m.content === "string"
            ? m.content
            : m.content.map((p): Block => {
                if (p.type === "text") return { type: "text", text: p.text };
                const d = dataUrlPart.exec(p.image_url.url);
                if (!d) throw new Error("ClaudeReviewTransport sends images as data URLs only");
                return { type: "image", source: { type: "base64", media_type: d[1] as "image/png" | "image/jpeg", data: d[2]! } };
              }),
      }));
    const schema = body.response_format?.type === "json_schema" ? body.response_format.json_schema.schema : undefined;
    const req: ModelRequest = { stage: "judge", system, cache: false, messages, ...(schema ? { schema } : {}) };
    const stage = { model: body.model, maxTokens: body.max_tokens, ...(this.reviewer.effort ? { effort: this.reviewer.effort } : {}) };
    let res;
    try {
      res = await this.inner.send(req, stage);
    } catch (e) {
      // Only a direct call's error status means the request was refused before the model ran. In a batch, an error
      // status can come from polling or reading results after the batch was created and billed: a plain Error, so
      // runReview books it at its worst case.
      const status = (e as { status?: unknown }).status;
      if (typeof status === "number" && !this.drain) throw new ReviewHttpError(status, `${body.model}: HTTP ${status} ${(e as Error).message.slice(0, 300)}`);
      throw e;
    }
    const u = res.usage;
    return {
      content: res.text,
      usage: { prompt_tokens: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), completion_tokens: u.output_tokens },
      ...(res.batch ? { batch: true } : {}),
    };
  }
}
