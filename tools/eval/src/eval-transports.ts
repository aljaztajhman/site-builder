/**
 * The eval's wrappers around the paid transports: fal pictures cached by request, and meters that count what a run
 * really paid (replayed answers and cached pictures cost nothing, though the report still prices them like
 * production, so per-site € numbers stay comparable between modes).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { costEur, type AppConfig } from "@sb/config";
import { imageCostEur, outputSize, type ImageGenModelConfig, type ImageTransport, type ModelTransport } from "@sb/engine";

/** What a run paid the providers, € (Claude calls through the API, fal pictures that weren't cached). */
export interface Meter {
  eur: number;
}

/** Counts each answered API call at its config price. Wraps the live transport only, below any replay or recording. */
export function meteredModel(inner: ModelTransport, config: AppConfig, meter: Meter): ModelTransport {
  return {
    async send(req, stage) {
      const res = await inner.send(req, stage);
      meter.eur += costEur(config, config.pricesUsdPerMTok[res.model] ? res.model : stage.model, res.usage, res.batch);
      return res;
    },
  };
}

/** Counts each delivered picture at its config price (the requested size). Wraps fal, below the cache. */
export function meteredImages(inner: ImageTransport, config: AppConfig, meter: Meter): ImageTransport {
  return {
    async generate(model, body) {
      const data = await inner.generate(model, body);
      const size = (body.image_size as { width: number; height: number } | undefined) ?? outputSize(config, false);
      meter.eur += imageCostEur(config, model, size.width, size.height);
      return data;
    },
  };
}

/** The cache key of a picture request: the model's endpoint and the whole body (prompt with its style, size, quality). */
export function pictureKey(model: ImageGenModelConfig, body: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify({ endpoint: model.endpoint, body })).digest("hex").slice(0, 24);
}

/**
 * fal pictures cached by request in `dir` (tools/eval/image-cache, committed so cloud runs share it): a run whose
 * brief is replayed asks for the same prompts and pays for none of them again (≈ €0.54 of a full run). A changed
 * prompt, style, size or quality is a new key. Files are the provider's bytes as delivered.
 *
 * With `fixture`, the keys each fixture got are listed in `dir/by-fixture/<id>.json`; with `reuse` too (eval
 * --reuse-pictures), a request the cache doesn't know takes the fixture's earlier picture at the same position instead
 * of paying fal, so a run that changes the brief or design (the variety switches) keeps the pictures fixed and measures
 * only what it changed.
 */
export class CachedImageTransport implements ImageTransport {
  readonly stats = { cached: 0, made: 0, reused: 0 };
  private requests = 0;

  constructor(
    private readonly inner: ImageTransport,
    private readonly dir: string,
    private readonly o: { fixture?: string; reuse?: boolean } = {},
  ) {}

  private file(key: string): string | undefined {
    return ["jpg", "png", "webp"].map((ext) => path.join(this.dir, `${key}.${ext}`)).find((f) => existsSync(f));
  }

  private indexFile(): string | undefined {
    return this.o.fixture ? path.join(this.dir, "by-fixture", `${this.o.fixture}.json`) : undefined;
  }

  /** The keys this fixture got in earlier runs, in the order it first got them. */
  fixtureKeys(): string[] {
    const f = this.indexFile();
    return f && existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as string[]) : [];
  }

  private remember(key: string): void {
    const f = this.indexFile();
    if (!f) return;
    const keys = this.fixtureKeys();
    if (keys.includes(key)) return;
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, JSON.stringify([...keys, key], null, 2));
  }

  async generate(model: ImageGenModelConfig, body: Record<string, unknown>): Promise<Uint8Array> {
    const slot = this.requests++;
    const key = pictureKey(model, body);
    const hit = this.file(key);
    if (hit) {
      this.stats.cached++;
      this.remember(key);
      return new Uint8Array(readFileSync(hit));
    }
    if (this.o.reuse) {
      const earlier = this.fixtureKeys().flatMap((k) => (this.file(k) ? [this.file(k)!] : []));
      const pick = earlier[slot % Math.max(1, earlier.length)];
      if (pick) {
        this.stats.reused++;
        return new Uint8Array(readFileSync(pick));
      }
    }
    const data = await this.inner.generate(model, body);
    this.stats.made++;
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(path.join(this.dir, `${key}.${extension(data)}`), data);
    this.remember(key);
    return data;
  }
}

function extension(data: Uint8Array): string {
  if (data[0] === 0x89 && data[1] === 0x50) return "png";
  if (data[0] === 0x52 && data[1] === 0x49 && data[8] === 0x57) return "webp";
  return "jpg";
}
