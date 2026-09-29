import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), "client", "editor.ts");
let cached: Promise<string> | undefined;

/** Bundles the dashboard editor (TypeScript) in memory on first request. */
export function clientBundle(): Promise<string> {
  if (!cached || process.env.NODE_ENV !== "production") {
    cached = build({ entryPoints: [entry], bundle: true, write: false, format: "esm", target: "es2022", minify: process.env.NODE_ENV === "production" }).then(
      (r) => r.outputFiles[0]!.text,
    );
  }
  return cached;
}
