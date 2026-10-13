import { fileURLToPath } from "node:url";
import { diskPhotoCache, setProcessPhotoCache } from "./packages/engine/src/photo-cache.ts";

// Unit tests never call the real model API or any other remote host.
// Block outbound HTTP(S) at the fetch level; localhost is allowed for in-process servers.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error(`Network access blocked in unit tests: ${url.href}`);
  }
  return realFetch(input, init);
}) as typeof fetch;
process.env.ANTHROPIC_API_KEY = "";
process.env.FAL_KEY = "";
process.env.RESEND_API_KEY = "";

// Re-encoding the same fixture photos to AVIF/WebP in every test file took ~10 s per fixture. Cache processPhoto's
// output on disk across test processes, keyed by input bytes + settings + sharp build (packages/engine/src/photo-cache.ts).
// SB_TEST_MEDIA_CACHE=off encodes for real every time.
if (process.env.SB_TEST_MEDIA_CACHE !== "off") {
  setProcessPhotoCache(diskPhotoCache(fileURLToPath(new URL("./node_modules/.cache/sb-test-media/", import.meta.url))));
}
