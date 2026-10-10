import Anthropic from "@anthropic-ai/sdk";
import type { AppConfig, ModelStageName } from "@sb/config";
import { messageParams, toModelResponse, type ModelRequest, type ModelResponse, type ModelTransport } from "./client.ts";

/** The part of the SDK's `messages.batches` this transport uses (a fake in unit tests). */
export type BatchApi = Pick<Anthropic["messages"]["batches"], "create" | "retrieve" | "results">;

interface Queued {
  id: string;
  params: Anthropic.MessageCreateParamsNonStreaming;
  stage: AppConfig["models"][ModelStageName];
  resolve: (r: ModelResponse) => void;
  reject: (e: Error) => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Message Batches API transport, eval only (the app never batches): every token at config `batchPriceFactor` (50 %
 * off), answered within minutes to hours. `send` only queues the request; `drain` submits the queue as one batch,
 * polls until it has ended and hands each answer to its caller, and repeats while the callers' work queues more (a
 * `callJson` retry after an invalid answer). Field names checked against @anthropic-ai/sdk 0.129: batches.create
 * ({requests: [{custom_id, params}]}), retrieve(id).processing_status "ended", results(id) → {custom_id, result:
 * {type: "succeeded", message} | errored | canceled | expired}, results in any order.
 */
export class BatchTransport implements ModelTransport {
  private queue: Queued[] = [];
  private n = 0;
  /** Batches submitted, for the report. */
  readonly batches: string[] = [];

  constructor(
    private readonly api: BatchApi = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 }).messages.batches,
    private readonly pollMs = 30_000,
  ) {}

  send(req: ModelRequest, stage: AppConfig["models"][ModelStageName]): Promise<ModelResponse> {
    // Tool loops need every answer block back (toolUses, content); batch results carry text only. Refuse rather than
    // end a loop after one turn without saying why.
    if (req.tools?.length) return Promise.reject(new Error(`BatchTransport can't run tool requests (stage ${req.stage}); use the direct transport`));
    return new Promise((resolve, reject) => this.queue.push({ id: `${req.stage}-${this.n++}`, params: messageParams(req, stage), stage, resolve, reject }));
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Submits everything queued as one batch and settles each request with its result. */
  async flush(): Promise<void> {
    const batch = this.queue;
    this.queue = [];
    if (!batch.length) return;
    try {
      const created = await this.api.create({ requests: batch.map((q) => ({ custom_id: q.id, params: q.params })) });
      this.batches.push(created.id);
      let status = created.processing_status;
      while (status !== "ended") {
        await sleep(this.pollMs);
        status = (await this.api.retrieve(created.id)).processing_status;
      }
      const byId = new Map(batch.map((q) => [q.id, q]));
      for await (const r of await this.api.results(created.id)) {
        const q = byId.get(r.custom_id);
        if (!q) continue;
        byId.delete(r.custom_id);
        if (r.result.type === "succeeded") q.resolve({ ...toModelResponse(r.result.message, q.stage), batch: true });
        else q.reject(new Error(`Batch request ${r.custom_id} ${r.result.type}${r.result.type === "errored" ? `: ${JSON.stringify(r.result.error).slice(0, 300)}` : ""}`));
      }
      for (const q of byId.values()) q.reject(new Error(`Batch ${created.id} returned no result for ${q.id}`));
    } catch (e) {
      for (const q of batch) q.reject(e as Error);
    }
  }

  /** Flushes until `work` has settled: its callers may queue new requests after their answers (retries). */
  async drain(work: Promise<unknown>[]): Promise<void> {
    let done = false;
    const all = Promise.allSettled(work).then(() => void (done = true));
    for (;;) {
      if (this.queue.length) {
        // Callers still preparing their request (reading and slicing screenshots) join this batch, not the next one.
        await Promise.race([all, sleep(500)]);
        await this.flush();
      }
      else if (done) return;
      else await Promise.race([all, sleep(50)]);
    }
  }
}
