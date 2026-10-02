import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createFsStorage, type Storage } from "@sb/platform";
import { liveRelease, livePointerKey, newReleaseId, publishedBase, releasesPrefix, writeRelease } from "../src/index.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();
let dir: string;
let storage: Storage;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-published-"));
  storage = createFsStorage(dir);
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const site = (slug: string, html: string) =>
  new Map<string, Uint8Array>([
    [`${slug}/index.html`, enc.encode(html)],
    [`${slug}/404.html`, enc.encode("<h1>Ni</h1>")],
    [`${slug}/media/img_01-360.webp`, enc.encode("img")],
    ["_shared/abc123/site.css", enc.encode("body{}")],
  ]);

/** What a visitor gets for /s/{slug}/{rest}, resolved like the web app does. */
async function served(slug: string, rest = "index.html"): Promise<string | null> {
  const data = await storage.get(`${await publishedBase(storage, slug)}${rest}`);
  return data ? dec.decode(data) : null;
}

describe("publishing a release", () => {
  it("serves a site published before releases from its old place, then moves it on the next publish", async () => {
    await storage.put("published/stara/index.html", enc.encode("staro"), "text/html");
    expect(await served("stara")).toBe("staro");
    await writeRelease(storage, "stara", newReleaseId(1), site("stara", "novo"));
    expect(await served("stara")).toBe("novo");
    expect(await storage.list("published/stara/")).toEqual([]);
  });

  it("keeps the live site whole until every file of the new release is written, then switches", async () => {
    await writeRelease(storage, "kvas", "v1-a", site("kvas", "prva"));
    const seen: string[] = [];
    const watching: Storage = {
      ...storage,
      async put(key, data, type) {
        // Every file of the new release lands while visitors still get the old one.
        if (key.startsWith(releasesPrefix("kvas"))) seen.push((await served("kvas")) ?? "missing");
        await storage.put(key, data, type);
      },
    };
    await writeRelease(watching, "kvas", "v2-b", site("kvas", "druga"));
    expect(seen.length).toBe(3);
    expect(new Set(seen)).toEqual(new Set(["prva"]));
    expect(await served("kvas")).toBe("druga");
    expect(await served("kvas", "media/img_01-360.webp")).toBe("img");
  });

  it("keeps the release it replaced for pages still loading and removes older ones", async () => {
    await writeRelease(storage, "salon", "v1-a", site("salon", "1"));
    await writeRelease(storage, "salon", "v2-b", site("salon", "2"));
    const releases = async () => [...new Set((await storage.list(releasesPrefix("salon"))).map((k) => k.slice(releasesPrefix("salon").length).split("/")[0]))].sort();
    expect(await releases()).toEqual(["v1-a", "v2-b"]);
    const r = await writeRelease(storage, "salon", "v3-c", site("salon", "3"));
    expect(r.previous).toBe("v2-b");
    expect(await releases()).toEqual(["v2-b", "v3-c"]);
    expect(await liveRelease(storage, "salon")).toBe("v3-c");
    expect(await served("salon")).toBe("3");
  });

  it("writes the shared bundle once and refuses files outside the site or a bad release id", async () => {
    expect(await storage.list("published/_shared/abc123/")).toEqual(["published/_shared/abc123/site.css"]);
    await expect(writeRelease(storage, "a", "v1-x", new Map([["b/index.html", enc.encode("x")]]))).rejects.toThrow(/outside site a/);
    await expect(writeRelease(storage, "a", "../x", site("a", "x"))).rejects.toThrow(/Bad release id/);
    // A pointer that isn't a release id is ignored rather than followed.
    await storage.put(livePointerKey("b"), enc.encode("../../sites/x"), "text/plain");
    expect(await liveRelease(storage, "b")).toBeNull();
  });

  it("completes a shared bundle that an interrupted publish left half-written", async () => {
    await storage.put("published/_shared/half01/site.css", enc.encode("body{}"), "text/css");
    const files = new Map<string, Uint8Array>([
      ["c/index.html", enc.encode("c")],
      ["_shared/half01/site.css", enc.encode("body{}")],
      ["_shared/half01/nav.js", enc.encode("1")],
    ]);
    await writeRelease(storage, "c", newReleaseId(1), files);
    expect((await storage.list("published/_shared/half01/")).sort()).toEqual(["published/_shared/half01/nav.js", "published/_shared/half01/site.css"]);
  });

  it("makes release ids that sort by version and never repeat", () => {
    const a = newReleaseId(7, 1_000);
    const b = newReleaseId(7, 1_000);
    expect(a).toMatch(/^v7-[a-z0-9]+-[a-z0-9]+$/);
    expect(a).not.toBe(b);
  });
});
