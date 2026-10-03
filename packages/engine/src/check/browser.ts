import { createServer } from "node:net";
import type { Browser } from "playwright";

export interface CheckBrowser {
  browser: Browser;
  /** Remote debugging port, for Lighthouse. */
  port: number;
  close(): Promise<void>;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** One Chromium for axe, screenshots and Lighthouse (which attaches over the debugging port). */
export async function launchCheckBrowser(args: string[] = []): Promise<CheckBrowser> {
  // Imported on first use, like Lighthouse: only the worker and the eval launch a browser.
  const { chromium } = await import("playwright");
  const port = await freePort();
  const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`, ...args] });
  return { browser, port, close: () => browser.close() };
}
