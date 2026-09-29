import { createDb, type Db } from "./db.ts";
import { migrate } from "./migrations.ts";
import { createQueue, type Queue } from "./queue.ts";
import { createFsStorage, createS3Storage, type Storage } from "./storage.ts";
import { Repo } from "./repo.ts";

export interface Platform {
  db: Db;
  repo: Repo;
  storage: Storage;
  queue: Queue;
  close(): Promise<void>;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return v;
}

/**
 * Storage from env. STORAGE_DRIVER=fs uses STORAGE_DIR; otherwise S3 settings.
 * Railway buckets expose BUCKET/ENDPOINT/ACCESS_KEY_ID/SECRET_ACCESS_KEY/REGION; those names are accepted too.
 */
export function storageFromEnv(): Storage {
  if ((process.env.STORAGE_DRIVER ?? "s3") === "fs") return createFsStorage(process.env.STORAGE_DIR ?? ".data/storage");
  return createS3Storage({
    endpoint: process.env.S3_ENDPOINT ?? required("ENDPOINT"),
    region: process.env.S3_REGION ?? process.env.REGION ?? "auto",
    bucket: process.env.S3_BUCKET ?? required("BUCKET"),
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? required("ACCESS_KEY_ID"),
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? required("SECRET_ACCESS_KEY"),
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
  });
}

export async function platformFromEnv(opts: { queue?: boolean } = {}): Promise<Platform> {
  const url = required("DATABASE_URL");
  const db = await createDb(url);
  await migrate(db);
  const storage = storageFromEnv();
  const queue = opts.queue === false ? nullQueue() : await createQueue(db, url);
  return {
    db,
    repo: new Repo(db),
    storage,
    queue,
    async close() {
      await queue.stop();
      await db.close();
    },
  };
}

function nullQueue(): Queue {
  const fail = async () => {
    throw new Error("Queue disabled");
  };
  return { send: fail, work: fail, ping: fail, stop: async () => undefined };
}
