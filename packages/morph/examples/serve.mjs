// Serves the package folder so the example can import ../dist/morph.js (browsers refuse modules from file://).
// node packages/morph/examples/serve.mjs  ->  http://localhost:3092/examples/
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css" };
const port = Number(process.env.PORT ?? 3092);

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const file = path.normalize(path.join(root, url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname));
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`http://localhost:${port}/examples/`));
