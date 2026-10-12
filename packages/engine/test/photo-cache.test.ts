import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { crc32 } from "node:zlib";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  diskPhotoCache,
  getProcessPhotoCache,
  processPhoto,
  processPhotoCacheKey,
  setProcessPhotoCache,
  type CachedPhoto,
  type ProcessPhotoCache,
} from "../src/index.ts";

const jpeg = (width: number, height: number, background = "#3a6") =>
  sharp({ create: { width, height, channels: 3, background } }).jpeg().toBuffer().then((b) => new Uint8Array(b));

const quality = { avif: 40, webp: 60 };

/** In-memory cache that records every call. */
function memoryCache() {
  const store = new Map<string, CachedPhoto>();
  const calls = { get: 0, hits: 0, put: 0 };
  const cache: ProcessPhotoCache = {
    async get(key) {
      calls.get++;
      const v = store.get(key) ?? null;
      if (v) calls.hits++;
      return v;
    },
    async put(key, value) {
      calls.put++;
      store.set(key, value);
    },
  };
  return { cache, store, calls };
}

let previous: ProcessPhotoCache | null = null;
beforeEach(() => {
  previous = getProcessPhotoCache();
});
afterEach(() => {
  setProcessPhotoCache(previous);
});

describe("processPhoto with a cache installed", () => {
  it("encodes and stores on a miss, and serves the same bytes under the caller's id on a hit", async () => {
    const { cache, store, calls } = memoryCache();
    setProcessPhotoCache(cache);
    const photo = await jpeg(800, 600);
    const first = await processPhoto("img_01", photo, [360, 720], quality);
    expect(calls).toEqual({ get: 1, hits: 0, put: 1 });
    expect(first.variants.map((v) => v.file)).toEqual(["img_01-360.avif", "img_01-360.webp", "img_01-720.avif", "img_01-720.webp"]);

    const second = await processPhoto("img_09", photo, [360, 720], quality);
    expect(calls).toEqual({ get: 2, hits: 1, put: 1 });
    expect([second.width, second.height]).toEqual([800, 600]);
    expect(second.variants.map((v) => v.file)).toEqual(first.variants.map((v) => v.file.replace("img_01", "img_09")));
    second.variants.forEach((v, i) => expect(Buffer.compare(v.data, first.variants[i]!.data)).toBe(0));

    // A hit does not encode: whatever the cache holds is what comes back.
    const key = processPhotoCacheKey(photo, [360, 720], quality);
    expect([...store.keys()]).toEqual([key]);
    store.set(key, { width: 7, height: 5, variants: [{ width: 7, format: "webp", data: new Uint8Array([1, 2, 3]) }] });
    const planted = await processPhoto("img_02", photo, [360, 720], quality);
    expect(planted).toEqual({ width: 7, height: 5, variants: [{ file: "img_02-7.webp", data: new Uint8Array([1, 2, 3]) }] });
  });

  it("gives the same result as encoding without a cache", async () => {
    const photo = await jpeg(500, 900, "#c42");
    setProcessPhotoCache(null);
    const plain = await processPhoto("img_03", photo, [360], quality);
    setProcessPhotoCache(memoryCache().cache);
    const miss = await processPhoto("img_03", photo, [360], quality);
    const hit = await processPhoto("img_03", photo, [360], quality);
    for (const r of [miss, hit]) {
      expect([r.width, r.height]).toEqual([plain.width, plain.height]);
      expect(r.variants.map((v) => v.file)).toEqual(plain.variants.map((v) => v.file));
      r.variants.forEach((v, i) => expect(Buffer.compare(v.data, plain.variants[i]!.data)).toBe(0));
    }
  });

  it("misses when the bytes, widths or qualities differ", async () => {
    const a = await jpeg(400, 300);
    const b = await jpeg(400, 300, "#123");
    const key = processPhotoCacheKey(a, [360], quality);
    expect(processPhotoCacheKey(a, [360], quality)).toBe(key);
    expect(new Set([key, processPhotoCacheKey(b, [360], quality), processPhotoCacheKey(a, [360, 720], quality), processPhotoCacheKey(a, [360], { avif: 41, webp: 60 }), processPhotoCacheKey(a, [360], { avif: 40, webp: 61 })]).size).toBe(5);

    const { cache, calls } = memoryCache();
    setProcessPhotoCache(cache);
    await processPhoto("x", a, [360], quality);
    await processPhoto("x", b, [360], quality);
    await processPhoto("x", a, [360, 720], quality);
    await processPhoto("x", a, [360], { avif: 41, webp: 60 });
    expect(calls).toEqual({ get: 4, hits: 0, put: 4 });
  });

  it("never stores an input that fails, and still refuses a decompression bomb", async () => {
    const { cache, calls } = memoryCache();
    setProcessPhotoCache(cache);
    await expect(processPhoto("img_01", new Uint8Array([1, 2, 3, 4]), [360], quality)).rejects.toThrow();
    // A 1×1 PNG whose header claims 12000×12000 px (as in images.test.ts).
    const bomb = Buffer.from(await sharp({ create: { width: 1, height: 1, channels: 3, background: "#888" } }).png().toBuffer());
    bomb.writeUInt32BE(12000, 16);
    bomb.writeUInt32BE(12000, 20);
    bomb.writeUInt32BE(crc32(bomb.subarray(12, 29)), 29);
    await expect(processPhoto("img_01", new Uint8Array(bomb), [480], { avif: 50, webp: 75 })).rejects.toThrow();
    await expect(processPhoto("img_01", new Uint8Array(bomb), [480], { avif: 50, webp: 75 })).rejects.toThrow();
    expect(calls.put).toBe(0);
    expect(calls.hits).toBe(0);
  });
});

describe("diskPhotoCache", () => {
  let dir = "";
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "sb-photo-cache-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const entry: CachedPhoto = {
    width: 1080,
    height: 720,
    variants: [
      { width: 360, format: "avif", data: new Uint8Array([9, 8, 7]) },
      { width: 360, format: "webp", data: new Uint8Array([]) },
      { width: 720, format: "webp", data: new Uint8Array(Array.from({ length: 5000 }, (_, i) => i % 251)) },
    ],
  };

  it("round-trips an entry and leaves no temp files", async () => {
    const cache = diskPhotoCache(path.join(dir, "nested"));
    expect(await cache.get("k1")).toBeNull();
    await cache.put("k1", entry);
    const back = await cache.get("k1");
    expect(back).not.toBeNull();
    expect([back!.width, back!.height]).toEqual([1080, 720]);
    expect(back!.variants.map((v) => [v.width, v.format, [...v.data]])).toEqual(entry.variants.map((v) => [v.width, v.format, [...v.data]]));
    expect(await readdir(path.join(dir, "nested"))).toEqual(["k1.bin"]);
  });

  it("treats a truncated or garbled entry as a miss", async () => {
    const cache = diskPhotoCache(dir);
    await cache.put("k2", entry);
    const file = path.join(dir, "k2.bin");
    const full = await readFile(file);
    await writeFile(file, full.subarray(0, full.length - 10));
    expect(await cache.get("k2")).toBeNull();
    await writeFile(file, Buffer.from("not a cache entry"));
    expect(await cache.get("k2")).toBeNull();
  });

  it("survives concurrent writers of the same key", async () => {
    const cache = diskPhotoCache(dir);
    await Promise.all(Array.from({ length: 8 }, () => cache.put("k3", entry)));
    expect((await cache.get("k3"))?.variants.length).toBe(3);
    expect(await readdir(dir)).toEqual(["k3.bin"]);
  });

  it("serves processPhoto across cache instances (as across test processes)", async () => {
    const photo = await jpeg(640, 480);
    setProcessPhotoCache(diskPhotoCache(dir));
    const first = await processPhoto("img_01", photo, [360], quality);
    setProcessPhotoCache(diskPhotoCache(dir));
    const second = await processPhoto("img_04", photo, [360], quality);
    expect(second.variants.map((v) => v.file)).toEqual(["img_04-360.avif", "img_04-360.webp"]);
    second.variants.forEach((v, i) => expect(Buffer.compare(v.data, first.variants[i]!.data)).toBe(0));
  });
});
