import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
 * Records only what changed (`pnpm eval --record-missing`): a call whose request hash matches a recording of the
 * same stage in `dir` is answered from it; any other call goes to `inner` (the API) and is recorded. Stages
 * downstream of a changed prompt get different inputs, so they miss and are recorded again too. The fixture's
 * files are rewritten in place in this run's call order (NNN-stage.json), each as soon as it is answered, so a
 * paid answer is never lost; `finish` removes the files this run didn't write (leftovers of a longer earlier run).
 */
export class RecordMissingTransport implements ModelTransport {
  private seq = 0;
  private readonly old: Recording[];
  private readonly used = new Set<number>();
  private readonly written = new Set<string>();
  /** Calls answered from a recording, and calls sent to `inner` (paid) and recorded. */
  readonly stats = { replayed: 0, recorded: 0 };

  constructor(
    private readonly inner: ModelTransport,
    private readonly dir: string,
  ) {
    this.old = existsSync(dir) ? loadRecordings(dir) : [];
    mkdirSync(dir, { recursive: true });
  }

  async send(req: ModelRequest, stage: AppConfig["models"][ModelStageName]): Promise<ModelResponse> {
    const hash = requestHash(req, stage.model);
    const i = this.old.findIndex((r, n) => !this.used.has(n) && r.stage === req.stage && r.hash === hash);
    // The number is taken before the call: parallel stages keep the order in which they asked.
    const seq = this.seq++;
    let rec: Recording;
    if (i >= 0) {
      this.used.add(i);
      this.stats.replayed++;
      rec = { ...this.old[i]!, seq };
    } else {
      const response = await this.inner.send(req, stage);
      this.stats.recorded++;
      rec = { seq, stage: req.stage, model: stage.model, hash, origin: "recorded", response };
    }
    const file = `${String(seq).padStart(3, "0")}-${req.stage}.json`;
    writeFileSync(path.join(this.dir, file), JSON.stringify(rec, null, 2));
    this.written.add(file);
    return rec.response;
  }

  /** Removes the recordings this run didn't write. Call once the fixture's last call is answered. */
  finish(): void {
    for (const f of readdirSync(this.dir)) if (f.endsWith(".json") && !this.written.has(f)) rmSync(path.join(this.dir, f));
  }
}

/**
 * Replays recordings per stage, in order within each stage: some stages run side by side (images
 * next to brief and design), so the order across stages isn't fixed. When `strict`, the request
 * hash must match too (a prompt change then needs a re-record). Requests with `tools` (agent loops) always match by hash.
 */
export class ReplayTransport implements ModelTransport {
  private readonly recordings: Recording[];
  private readonly used = new Set<number>();
  readonly hashMismatches: { seq: number; stage: string }[] = [];

  constructor(
    source: string | Recording[],
    private readonly strict = false,
  ) {
    this.recordings = typeof source === "string" ? loadRecordings(source) : source;
  }

  async send(req: ModelRequest, stage: AppConfig["models"][ModelStageName]): Promise<ModelResponse> {
    const hash = requestHash(req, stage.model);
    // A tool loop's turns share a stage, and each turn's request (tools, tool results) has its own hash: those
    // are matched by hash, so a loop replays deterministically whatever the order. Others replay in stage order.
    const byHash = !!req.tools?.length;
    const i = this.recordings.findIndex((r, n) => !this.used.has(n) && r.stage === req.stage && (!byHash || r.hash === hash));
    const rec = this.recordings[i];
    if (!rec) throw new Error(byHash ? `No recording matches this ${req.stage} tool request (hash ${hash}); re-record with pnpm eval --record` : `No recording left for stage ${req.stage} (call ${this.used.size})`);
    if (hash !== rec.hash) {
      if (this.strict) throw new Error(`Request for ${req.stage} changed since recording ${rec.seq}; re-record with pnpm eval --record`);
      this.hashMismatches.push({ seq: rec.seq, stage: rec.stage });
    }
    this.used.add(i);
    return rec.response;
  }

  get remaining(): number {
    return this.recordings.length - this.used.size;
  }
}

export function loadRecordings(dir: string): Recording[] {
  if (!existsSync(dir)) throw new Error(`No recordings in ${dir}`);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Recording);
}
