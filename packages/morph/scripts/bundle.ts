/**
 * The drop-in build: the whole engine as one ES module (dist/morph.js) for projects that don't compile
 * TypeScript. Readable, not minified, so an agent can read and adapt it. Committed; a test keeps it equal
 * to a fresh build.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DIST = path.join(root, "dist", "morph.js");

const BANNER = `/* @sb/morph: part-by-part screen morphs, a self-building page reveal and a text decode. No dependencies.
 * Generated from packages/morph/src by \`pnpm --filter @sb/morph build\`; don't edit. Guide: packages/morph/README.md. */`;

export async function bundle(): Promise<string> {
  const r = await build({
    // Paths in the output's comments are relative to the package, wherever the build runs from.
    absWorkingDir: root,
    entryPoints: ["src/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    target: "es2022",
    legalComments: "none",
    banner: { js: BANNER },
  });
  return r.outputFiles[0]!.text;
}
