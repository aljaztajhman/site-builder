#!/usr/bin/env node
// Serves Stranko HQ at http://localhost:4747 for the T3 Code preview (it opens http URLs, not files).
// The page comes from this folder; the data from .hq/data.js in the main checkout, so it is the same from any worktree.
// Usage: node tools/hq/serve.mjs [--port 4747]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const commonDir = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: here, encoding: "utf8" }).trim();
const mainCheckout = path.dirname(commonDir);
const argi = process.argv.indexOf("--port");
const port = argi > 0 ? Number(process.argv[argi + 1]) : 4747;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost").pathname;
  if (url === "/") { res.writeHead(302, { location: "/tools/hq/index.html" }); res.end(); return; }
  let file = null;
  if (url === "/.hq/data.js") file = path.join(mainCheckout, ".hq", "data.js");
  else if (url.startsWith("/tools/hq/")) {
    const name = path.basename(url);
    if (["index.html", "data.example.js"].includes(name)) file = path.join(here, name);
  }
  if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "text/plain", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`Stranko HQ: http://localhost:${port}  (data: ${path.join(mainCheckout, ".hq", "data.js")})`));
