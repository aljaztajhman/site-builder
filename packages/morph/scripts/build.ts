/** pnpm --filter @sb/morph build: writes dist/morph.js (see bundle.ts). */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { bundle, DIST } from "./bundle.ts";

const text = await bundle();
await mkdir(path.dirname(DIST), { recursive: true });
await writeFile(DIST, text);
console.log(`dist/morph.js  ${(text.length / 1024).toFixed(1)} KB`);
