import sharp from "sharp";
import type { AppConfig } from "@sb/config";
import { ledgerOf, type SpendLedger, type SpendSource } from "./llm/client.ts";

/**
 * AI images from an image model on fal.ai: eval fixture photos (development) and, for client sites
 * with too few photos, a few generated mood images (pipeline). Prices, model and limits come from
 * config `imageGen`; every call is logged with its € cost and counts against the daily spend cap.
 */

export type ImageGenModelConfig = AppConfig["imageGen"]["models"][string];

/** Output size: the configured landscape size, or the same rotated for portrait. */
export function outputSize(config: AppConfig, portrait: boolean): { width: number; height: number } {
  const { width, height } = config.imageGen.landscape;
  return portrait ? { width: height, height: width } : { width, height };
}

/** Request body for fal's model endpoint. */
export function requestBody(config: AppConfig, model: ImageGenModelConfig, prompt: string, portrait: boolean): Record<string, unknown> {
  const size = outputSize(config, portrait);
  const shape = model.sizeParam === "aspect_ratio" ? { aspect_ratio: ratio(size.width, size.height) } : { image_size: size };
  return { ...model.params, ...shape, prompt, num_images: 1 };
}

function ratio(w: number, h: number): string {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

/** € cost of one image from config prices; per-megapixel models use the delivered size. */
export function imageCostEur(config: AppConfig, model: ImageGenModelConfig, width: number, height: number): number {
  const usd = model.usdPerImage ?? (model.usdPerMegapixel ?? 0) * ((width * height) / 1_000_000);
  return usd * config.eurPerUsd;
}

/** Anything that turns a prompt into image bytes: fal's API, or stand-ins for tests and replays. */
export interface ImageTransport {
  generate(model: ImageGenModelConfig, body: Record<string, unknown>): Promise<Uint8Array>;
}

/**
 * The provider made the image (and billed it), but we didn't get it: its answer had no usable image URL,
 * or the download failed. Booked at the image's price, unlike a failed request.
 */
export class ImageBilledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageBilledError";
  }
}

export class FalImageTransport implements ImageTransport {
  constructor(private readonly key = process.env.FAL_KEY) {
    if (!key) throw new Error("FAL_KEY is not set");
  }

  async generate(model: ImageGenModelConfig, body: Record<string, unknown>): Promise<Uint8Array> {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`https://fal.run/${model.endpoint}`, {
        method: "POST",
        headers: { Authorization: `Key ${this.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
      });
      if (res.ok) return this.download(model, res);
      const text = (await res.text()).slice(0, 300);
      if (res.status >= 500 && attempt < 2) continue;
      throw new Error(`${model.endpoint}: HTTP ${res.status} ${text}`);
    }
  }

  /** fal answered: the image exists and is billed. The download is tried twice before it counts as lost. */
  private async download(model: ImageGenModelConfig, res: Response): Promise<Uint8Array> {
    let url: string | undefined;
    try {
      url = ((await res.json()) as { images?: { url: string }[] }).images?.[0]?.url;
    } catch (e) {
      throw new ImageBilledError(`${model.endpoint}: unreadable response (${(e as Error).message.slice(0, 200)})`);
    }
    if (!url) throw new ImageBilledError(`${model.endpoint}: response has no image`);
    let problem = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const img = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (img.ok) return new Uint8Array(await img.arrayBuffer());
        problem = `HTTP ${img.status}`;
      } catch (e) {
        problem = (e as Error).message.slice(0, 200);
      }
    }
    throw new ImageBilledError(`${model.endpoint}: image download failed (${problem})`);
  }
}

/** A flat, softly shaded image of the requested size: unit tests and replayed evals, no network. */
export class StandInImageTransport implements ImageTransport {
  calls = 0;
  async generate(_model: ImageGenModelConfig, body: Record<string, unknown>): Promise<Uint8Array> {
    this.calls++;
    const size = (body.image_size as { width: number; height: number } | undefined) ?? { width: 1536, height: 1024 };
    const hue = (this.calls * 67) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 30% 55%)"/><stop offset="1" stop-color="hsl(${hue} 35% 35%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
    return new Uint8Array(await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer());
  }
}

/**
 * `ledger` reserves each image's price under the daily cap (Claude and images share it) and books its €
 * (stage "imageGen", no tokens). Or, for a local ledger: `spentToday` and `onCall`.
 */
export type ImageGeneratorOptions = { config: AppConfig; transport: ImageTransport } & SpendSource;

const NO_TOKENS = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

/** Generates images with the pipeline model from config, under the daily spend cap, logging each call. */
export class ImageGenerator {
  private readonly ledger: SpendLedger;

  constructor(private readonly opts: ImageGeneratorOptions) {
    this.ledger = ledgerOf(opts);
  }

  get model(): { name: string; config: ImageGenModelConfig } {
    const name = this.opts.config.imageGen.pipeline.model;
    const m = this.opts.config.imageGen.models[name];
    if (!m) throw new Error(`config: imageGen.pipeline.model ${name} is not in imageGen.models`);
    return { name, config: m };
  }

  /**
   * One landscape image for `prompt` (the pipeline style is appended). Returns JPEG bytes and size.
   * Its price is reserved under the daily cap first. `signal` (the job stopped) is checked before the
   * reservation and again once it is made; a request already sent is not cut off, since fal would bill it anyway.
   */
  async generate(prompt: string, opts: { signal?: AbortSignal } = {}): Promise<{ data: Uint8Array; width: number; height: number; costEur: number }> {
    const { config } = this.opts;
    const { name, config: model } = this.model;
    const requested = outputSize(config, false);
    const price = imageCostEur(config, model, requested.width, requested.height);
    opts.signal?.throwIfAborted();
    const reservation = await this.ledger.reserve({ stage: "imageGen", model: name, estimateEur: price, capEur: config.limits.dailyModelSpendCapEur });
    if (opts.signal?.aborted) {
      await reservation.release();
      throw opts.signal.reason;
    }
    const started = Date.now();
    const book = (costEur: number, ok: boolean) => reservation.settle({ stage: "imageGen", model: name, usage: NO_TOKENS, costEur, durationMs: Date.now() - started, ok });
    let raw: Uint8Array;
    try {
      raw = await this.opts.transport.generate(model, requestBody(config, model, `${prompt} ${config.imageGen.pipeline.style}`, false));
    } catch (e) {
      // A failed request is logged at no cost (fal bills only delivered images); an image fal made but we
      // couldn't fetch is booked at its price, because we were billed for it.
      await book(e instanceof ImageBilledError ? price : 0, false);
      throw e;
    }
    // From here the image was delivered, so billed, whatever happens to it next.
    let out: { data: Uint8Array; width: number; height: number; costEur: number };
    try {
      // Re-encode: no provider metadata, at most 1600 px on the long edge, like an uploaded photo.
      const data = new Uint8Array(await sharp(raw).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer());
      const meta = await sharp(raw).metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      out = { data, width, height, costEur: width && height ? imageCostEur(config, model, width, height) : price };
    } catch (e) {
      await book(price, false);
      throw e;
    }
    await book(out.costEur, true);
    return out;
  }
}
