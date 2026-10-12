import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Optional cache for processPhoto results. Tests install one (test-setup.ts) so the same fixture photos are not
 * re-encoded to AVIF/WebP in every test file; production never installs one and processPhoto then always encodes.
 *
 * This module has no sharp or render dependency on purpose: test-setup.ts loads it into every test file.
 */

/** One encoded photo, independent of the caller's image id (file names are rebuilt from width + format on a hit). */
export interface CachedPhoto {
  width: number;
  height: number;
  variants: { width: number; format: "avif" | "webp"; data: Uint8Array }[];
}

export interface ProcessPhotoCache {
  get(key: string): Promise<CachedPhoto | null>;
  put(key: string, value: CachedPhoto): Promise<void>;
}

let installed: ProcessPhotoCache | null = null;

/** Installs (or with null removes) the cache processPhoto consults. Tests only. */
export function setProcessPhotoCache(cache: ProcessPhotoCache | null): void {
  installed = cache;
}

export function getProcessPhotoCache(): ProcessPhotoCache | null {
  return installed;
}

/** Bump when the stored layout or the encode settings inside processPhoto change. */
export const PHOTO_CACHE_FORMAT = 1;

/** Cache key: the input bytes plus every setting that changes the output. */
export function photoCacheKey(data: Uint8Array, settings: unknown): string {
  return createHash("sha256").update(JSON.stringify([PHOTO_CACHE_FORMAT, settings])).update("\0").update(data).digest("hex");
}

/**
 * A cache of one file per key in `dir`: a u32 header length, a JSON header (width, height, variant widths, formats and
 * byte lengths), then the variant bytes. Written to a temp file and renamed, so parallel test processes never read a
 * half-written entry. An unreadable entry counts as a miss.
 */
export function diskPhotoCache(dir: string): ProcessPhotoCache {
  const file = (key: string) => path.join(dir, `${key}.bin`);
  return {
    async get(key) {
      let buf: Buffer;
      try {
        buf = await readFile(file(key));
      } catch {
        return null;
      }
      try {
        const headerLength = buf.readUInt32BE(0);
        const header = JSON.parse(buf.subarray(4, 4 + headerLength).toString("utf8")) as {
          width: number;
          height: number;
          variants: { width: number; format: "avif" | "webp"; length: number }[];
        };
        let offset = 4 + headerLength;
        const variants: CachedPhoto["variants"] = [];
        for (const v of header.variants) {
          if (offset + v.length > buf.length) return null;
          variants.push({ width: v.width, format: v.format, data: Buffer.from(buf.subarray(offset, offset + v.length)) });
          offset += v.length;
        }
        if (offset !== buf.length) return null;
        return { width: header.width, height: header.height, variants };
      } catch {
        return null;
      }
    },
    async put(key, value) {
      const header = Buffer.from(
        JSON.stringify({ width: value.width, height: value.height, variants: value.variants.map((v) => ({ width: v.width, format: v.format, length: v.data.byteLength })) }),
        "utf8",
      );
      const length = Buffer.alloc(4);
      length.writeUInt32BE(header.length, 0);
      await mkdir(dir, { recursive: true });
      const tmp = `${file(key)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
      try {
        await writeFile(tmp, Buffer.concat([length, header, ...value.variants.map((v) => v.data)]));
        await rename(tmp, file(key));
      } catch {
        // A cache that cannot be written only costs speed.
        await rm(tmp, { force: true });
      }
    },
  };
}
