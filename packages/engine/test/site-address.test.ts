import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import type { Repo, SiteDomainRow } from "@sb/platform";
import { shareImageOf, variantFile } from "@sb/render";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { addShareImage, siteAddress } from "../src/index.ts";

const repoWith = (rows: Partial<SiteDomainRow>[]) => ({ domains: { forSite: async () => rows as SiteDomainRow[] } }) as unknown as Repo;

describe("siteAddress (canonical URLs and the sitemap)", () => {
  it("is the active primary domain, else the platform subdomain, else none", async () => {
    expect(await siteAddress(repoWith([{ hostname: "pekarnakvas.si", is_primary: true, status: "active" }]), "s", "pekarna", "stranko.si")).toBe("https://pekarnakvas.si/");
    // A domain still being set up doesn't count yet.
    expect(await siteAddress(repoWith([{ hostname: "pekarnakvas.si", is_primary: true, status: "pending" }]), "s", "pekarna", "Stranko.si")).toBe("https://pekarna.stranko.si/");
    expect(await siteAddress(repoWith([]), "s", "pekarna", null)).toBeNull();
  });
});

describe("addShareImage", () => {
  it("adds the share picture og:image names, made from the largest variant", async () => {
    const spec = migrateSpec(JSON.parse(readFileSync(new URL("../../../tools/eval/golden/pekarna-kvas.json", import.meta.url), "utf8"))) as SiteSpec;
    const share = shareImageOf(spec)!;
    const asset = spec.assets.images.find((i) => i.id === share.image)!;
    const webp = await sharp({ create: { width: 1080, height: 720, channels: 3, background: "#a63" } }).webp().toBuffer();
    const media = new Map([[variantFile(asset.id, 1080, "webp"), new Uint8Array(webp)]]);
    await addShareImage({ ...spec, assets: { ...spec.assets, images: [{ ...asset, width: 1080, height: 720 }] } }, media, [360, 720, 1080, 1600]);
    const m = await sharp(media.get(share.file)!).metadata();
    expect([m.format, m.width, m.height]).toEqual(["jpeg", 1200, 630]);
  });
});
