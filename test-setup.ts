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
