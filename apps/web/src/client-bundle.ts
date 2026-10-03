import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "client");
type Name = "editor" | "home";
export interface ClientBundle {
  text: string;
  /** Content hash: the script's URL carries it, so a cached copy is never stale. */
  hash: string;
}
const cached = new Map<Name, Promise<ClientBundle>>();
const ready = new Map<Name, ClientBundle>();
const production = () => process.env.NODE_ENV === "production";

/**
 * Bundles a dashboard script (TypeScript, `client/<name>.ts`) in memory: once in production (warmed at
 * start), on every request in development. A failed build isn't kept, so the next request tries again.
 */
export function clientBundle(name: Name): Promise<ClientBundle> {
  let out = cached.get(name);
  if (!out || !production()) {
    out = build({ entryPoints: [path.join(dir, `${name}.ts`)], bundle: true, write: false, format: "esm", target: "es2022", minify: production() }).then((r) => {
      const text = r.outputFiles[0]!.text;
      const b = { text, hash: createHash("sha256").update(text).digest("hex").slice(0, 10) };
      ready.set(name, b);
      return b;
    });
    out.catch(() => {
      if (cached.get(name) === out) cached.delete(name);
    });
    cached.set(name, out);
  }
  return out;
}

/** Builds both scripts now, so the first visitor doesn't wait for esbuild (production). */
export function warmClientBundles(): void {
  if (!production()) return;
  for (const name of ["editor", "home"] as const) clientBundle(name).catch((e: unknown) => console.error(`[web] building ${name}.js failed:`, (e as Error).message));
}

/** The script's URL: with its content hash once built (cached for good), plain before that and in development. */
export function clientScriptUrl(name: Name): string {
  const b = production() ? ready.get(name) : undefined;
  return b ? `/assets/${name}.js?v=${b.hash}` : `/assets/${name}.js`;
}
