/**
 * How the outside reviewers (outside-review.ts) reach their models: OpenRouter's chat completions API, or a directory of
 * recorded answers (the tests and `--replay` use that; `--record` writes it). Eval only. A request is identified by
 * its model and messages, never by the key or the other settings.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

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
  usage?: { prompt_tokens?: number; completion_tokens?: number; /** OpenRouter's own cost of the call, in credits (≈ USD). */ cost?: number };
}

export interface OutsideTransport {
  /** Whether an answer costs money (live OpenRouter, recording); a replay is free and its calls are booked at € 0. */
  readonly paid: boolean;
  complete(body: ChatBody): Promise<ChatResult>;
}

/**
 * OpenRouter answered with an error status. A 4xx other than 408 (timeout) is refused before the model runs (no
 * credit, bad request, rate limit) and costs nothing; a 408 or 5xx may come after the model ran.
 */
export class OpenRouterHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "OpenRouterHttpError";
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
      throw new OpenRouterHttpError(res.status, `${body.model}: HTTP ${res.status} ${text}`);
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
    private readonly mode: "replay" | "record",
    private readonly inner?: OutsideTransport,
  ) {
    if (mode === "record" && !inner) throw new Error("RecordedTransport: record mode needs a transport to record");
    this.paid = mode === "record" && inner!.paid;
  }

  async complete(body: ChatBody): Promise<ChatResult> {
    const file = path.join(this.dir, `${requestHash(body)}.json`);
    if (this.mode === "replay") {
      if (!existsSync(file)) throw new Error(`No recording for ${body.model} request ${requestHash(body).slice(0, 12)} in ${this.dir}`);
      return JSON.parse(readFileSync(file, "utf8")) as ChatResult;
    }
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
export function makeTransport(opts: { baseUrl: string; env: Record<string, string | undefined>; replay?: string; record?: string }): OutsideTransport {
  if (opts.replay) return new RecordedTransport(opts.replay, "replay");
  const live = new OpenRouterTransport(opts.baseUrl, opts.env.OPENROUTER_API_KEY);
  return opts.record ? new RecordedTransport(opts.record, "record", live) : live;
}
