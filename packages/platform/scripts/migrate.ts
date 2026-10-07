/**
 * pnpm db:migrate — runs the pending database migrations (ours, then pg-boss's, as web and worker do at
 * start) against DATABASE_URL and exits. CI runs it on an empty Postgres (the migration smoke).
 */
import { loadConfig } from "@sb/config";
import { MIGRATIONS, createDb, createQueue, migrate } from "../src/index.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (see .env.example)");
  process.exit(2);
}
const db = await createDb(url);
try {
  const t0 = Date.now();
  const ran = await migrate(db);
  const names = new Map(MIGRATIONS.map((m) => [m.id, m.name]));
  console.log(`migrations: ${ran.length} ran${ran.length ? ` (${ran.map((id) => `${id} ${names.get(id)}`).join(", ")})` : ""}, ${MIGRATIONS.length} known, ${Date.now() - t0} ms`);
  const queue = await createQueue(db, url, { heartbeatSeconds: loadConfig().worker.heartbeatSeconds });
  await queue.ping();
  await queue.stop();
  console.log("pg-boss: schema ready, queues created");
} finally {
  await db.close();
}
