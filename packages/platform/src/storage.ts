import { mkdir, readFile, readdir, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * Object storage. One interface for MinIO (local Docker), the Railway bucket (S3-compatible)
 * and a plain directory (tests and Docker-less dev).
 */
export interface Storage {
  kind: "s3" | "fs";
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  list(prefix: string): Promise<string[]>;
  deletePrefix(prefix: string): Promise<void>;
  /** Deletes exactly these keys; missing ones are ignored. */
  delete(keys: string[]): Promise<void>;
  /** Throws when the backend is unreachable. Used by /health. */
  ping(): Promise<void>;
}

export interface S3Settings {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/** Keys are relative paths of plain segments: no "..", ".", empty segments, backslashes or leading "/". */
export function assertSafeKey(key: string): void {
  if (!key || key.startsWith("/") || key.includes("\\") || key.split("/").some((seg, i, all) => seg === ".." || seg === "." || (seg === "" && i < all.length - 1))) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
}

export function createS3Storage(s: S3Settings): Storage {
  const client = new S3Client({
    endpoint: s.endpoint,
    region: s.region,
    forcePathStyle: s.forcePathStyle,
    credentials: { accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey },
  });
  return {
    kind: "s3",
    async put(key, data, contentType) {
      assertSafeKey(key);
      await client.send(new PutObjectCommand({ Bucket: s.bucket, Key: key, Body: data, ContentType: contentType }));
    },
    async get(key) {
      assertSafeKey(key);
      try {
        const r = await client.send(new GetObjectCommand({ Bucket: s.bucket, Key: key }));
        return r.Body ? new Uint8Array(await r.Body.transformToByteArray()) : null;
      } catch (e) {
        if (e instanceof NoSuchKey || (e as { name?: string }).name === "NoSuchKey") return null;
        throw e;
      }
    },
    async list(prefix) {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const r = await client.send(new ListObjectsV2Command({ Bucket: s.bucket, Prefix: prefix, ContinuationToken: token }));
        for (const o of r.Contents ?? []) if (o.Key) keys.push(o.Key);
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token);
      return keys;
    },
    async deletePrefix(prefix) {
      const keys = await this.list(prefix);
      for (let i = 0; i < keys.length; i += 1000) {
        await client.send(
          new DeleteObjectsCommand({ Bucket: s.bucket, Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) } }),
        );
      }
    },
    async delete(keys) {
      keys.forEach(assertSafeKey);
      for (let i = 0; i < keys.length; i += 1000) {
        await client.send(
          new DeleteObjectsCommand({ Bucket: s.bucket, Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) } }),
        );
      }
    },
    async ping() {
      await client.send(new HeadBucketCommand({ Bucket: s.bucket }));
    },
  };
}

/** A put in progress (createFsStorage writes to a temporary file first). */
const TMP_FILE = /\.\d+-[a-z0-9]+\.tmp$/;

export function createFsStorage(root: string): Storage {
  const abs = path.resolve(root);
  const file = (key: string) => {
    assertSafeKey(key);
    const p = path.resolve(abs, key);
    if (!p.startsWith(abs + path.sep)) throw new Error(`Key escapes storage root: ${key}`);
    return p;
  };
  async function walk(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const out: string[] = [];
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...(await walk(p)));
      else out.push(p);
    }
    return out;
  }
  return {
    kind: "fs",
    async put(key, data) {
      const p = file(key);
      await mkdir(path.dirname(p), { recursive: true });
      // Write, then rename into place: a reader never sees a half-written file (S3 PUTs are atomic too).
      const tmp = `${p}.${process.pid}-${Math.random().toString(36).slice(2, 8)}.tmp`;
      await writeFile(tmp, data);
      await rename(tmp, p);
    },
    async get(key) {
      const p = file(key);
      try {
        return new Uint8Array(await readFile(p));
      } catch {
        return null;
      }
    },
    async list(prefix) {
      const all = await walk(abs);
      return all
        .map((p) => path.relative(abs, p).split(path.sep).join("/"))
        .filter((k) => k.startsWith(prefix) && !TMP_FILE.test(k))
        .sort();
    },
    async deletePrefix(prefix) {
      const dirs = new Set<string>();
      for (const k of await this.list(prefix)) {
        await rm(file(k), { force: true });
        for (let d = path.dirname(file(k)); d.startsWith(abs + path.sep); d = path.dirname(d)) dirs.add(d);
      }
      // Remove the folders left empty, deepest first (S3 has no folders to leave behind).
      for (const d of [...dirs].sort((a, b) => b.length - a.length)) await rmdir(d).catch(() => undefined);
    },
    async delete(keys) {
      // Folders stay: a put may be about to write into one (deletePrefix removes whole trees instead).
      for (const k of keys) await rm(file(k), { force: true });
    },
    async ping() {
      await mkdir(abs, { recursive: true });
      await stat(abs);
    },
  };
}

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json",
  woff2: "font/woff2",
  avif: "image/avif",
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  zip: "application/zip",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml; charset=utf-8",
};

export function contentType(key: string): string {
  return TYPES[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}
