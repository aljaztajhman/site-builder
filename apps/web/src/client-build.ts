/**
 * pnpm --filter @sb/web build — builds what the web service builds at start in production, so a broken
 * editor or landing bundle fails CI instead of the deploy: both dashboard scripts (esbuild, minified as in
 * production) and the UI assets under /assets/ui/<hash>/. Writes nothing; prints sizes; exits 1 on failure.
 */
import { uiAssets } from "./ui/assets.ts";

process.env.NODE_ENV = "production";
const { clientBundle } = await import("./client-bundle.ts");

let failed = false;
for (const name of ["editor", "home"] as const) {
  try {
    const b = await clientBundle(name);
    if (!b.text.trim()) throw new Error("empty bundle");
    console.log(`${name}.js  ${(b.text.length / 1024).toFixed(1)} KB  ${b.hash}`);
  } catch (e) {
    failed = true;
    console.error(`${name}.js failed: ${(e as Error).message}`);
  }
}
try {
  const ui = uiAssets();
  console.log(`ui assets  ${ui.files.size} files  ${ui.hash}`);
} catch (e) {
  failed = true;
  console.error(`ui assets failed: ${(e as Error).message}`);
}
process.exitCode = failed ? 1 : 0;
