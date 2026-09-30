import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "client");
const cached = new Map<string, Promise<string>>();

/** Bundles a dashboard script (TypeScript, `client/<name>.ts`) in memory on first request. */
export function clientBundle(name: "editor" | "home"): Promise<string> {
  let out = cached.get(name);
  if (!out || process.env.NODE_ENV !== "production") {
    out = build({ entryPoints: [path.join(dir, `${name}.ts`)], bundle: true, write: false, format: "esm", target: "es2022", minify: process.env.NODE_ENV === "production" }).then(
      (r) => r.outputFiles[0]!.text,
    );
    cached.set(name, out);
  }
  return out;
}
