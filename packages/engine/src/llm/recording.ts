import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AppConfig, ModelStageName } from "@sb/config";
import { requestHash, type ModelRequest, type ModelResponse, type ModelTransport } from "./client.ts";

export interface Recording {
  /** Order of the call within the run, from 0. */
  seq: number;
  stage: ModelStageName;
  model: string;
  hash: string;
  /** "recorded" from a real API call, or "synthetic" when written by hand for a unit test. */
  origin: "recorded" | "synthetic";
  response: ModelResponse;
}

/** Wraps a real transport and writes every exchange to `dir` as NNN-stage.json. */
export class RecordingTransport implements ModelTransport {
  private seq = 0;
  constructor(
    private readonly inner: ModelTransport,
    private readonly dir: string,
  ) {
    mkdirSync(dir, { recursive: true });
  }

  async send(req: ModelRequest, stage: AppConfig["models"][ModelStageName]): Promise<ModelResponse> {
    const response = await this.inner.send(req, stage);
    const rec: Recording = { seq: this.seq, stage: req.stage, model: stage.model, hash: requestHash(req, stage.model), origin: "recorded", response };
    writeFileSync(path.join(this.dir, `${String(this.seq).padStart(3, "0")}-${req.stage}.json`), JSON.stringify(rec, null, 2));
    this.seq += 1;
    return response;
  }
}

/**
 * Replays recordings in order. Each call must match the next recording's stage; when `strict`,
 * the request hash must match too (a prompt change then needs a re-record).
 */
export class ReplayTransport implements ModelTransport {
  private readonly recordings: Recording[];
  private next = 0;
  readonly hashMismatches: { seq: number; stage: string }[] = [];

  constructor(
    source: string | Recording[],
    private readonly strict = false,
  ) {
    this.recordings = typeof source === "string" ? loadRecordings(source) : source;
  }

  async send(req: ModelRequest, stage: AppConfig["models"][ModelStageName]): Promise<ModelResponse> {
    const rec = this.recordings[this.next];
    if (!rec) throw new Error(`No recording left for stage ${req.stage} (call ${this.next})`);
    if (rec.stage !== req.stage) throw new Error(`Recording ${rec.seq} is for stage ${rec.stage}, got ${req.stage}`);
    const hash = requestHash(req, stage.model);
    if (hash !== rec.hash) {
      if (this.strict) throw new Error(`Request for ${req.stage} changed since recording ${rec.seq}; re-record with pnpm eval --record`);
      this.hashMismatches.push({ seq: rec.seq, stage: rec.stage });
    }
    this.next += 1;
    return rec.response;
  }

  get remaining(): number {
    return this.recordings.length - this.next;
  }
}

export function loadRecordings(dir: string): Recording[] {
  if (!existsSync(dir)) throw new Error(`No recordings in ${dir}`);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Recording);
}
