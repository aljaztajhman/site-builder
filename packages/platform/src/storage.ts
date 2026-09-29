import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
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
      await client.send(new PutObjectCommand({ Bucket: s.bucket, Key: key, Body: data, ContentType: contentType }));
    },
    async get(key) {
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
    async ping() {
      await client.send(new HeadBucketCommand({ Bucket: s.bucket }));
    },
  };
}

export function createFsStorage(root: string): Storage {
  const abs = path.resolve(root);
  const file = (key: string) => {
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
      await writeFile(p, data);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(file(key)));
      } catch {
        return null;
      }
    },
    async list(prefix) {
      const all = await walk(abs);
      return all.map((p) => path.relative(abs, p).split(path.sep).join("/")).filter((k) => k.startsWith(prefix)).sort();
    },
    async deletePrefix(prefix) {
      for (const k of await this.list(prefix)) await rm(file(k), { force: true });
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
};

export function contentType(key: string): string {
  return TYPES[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}
