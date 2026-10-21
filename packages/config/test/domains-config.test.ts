import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AppConfigSchema, domainModes, loadConfig, migrateDomainsConfig, repoRoot } from "../src/index.ts";

/**
 * Own domains have two switches (owner, 2026-10-19): connecting a domain the owner already has, and buying
 * one through us. In the free beta only connecting is on; an older file's single `enabled` still reads.
 */
const raw = () => JSON.parse(readFileSync(path.join(repoRoot, "config/app.config.json"), "utf8")) as { domains: Record<string, unknown> };

describe("config domains", () => {
  it("connects through Cloudflare for SaaS at povezava.postavi.si; registering is off and the registrar stays the fake", () => {
    const c = loadConfig();
    expect(domainModes(c)).toEqual({ connect: true, register: false, any: true });
    expect(c.domains.connect.cnameTarget).toBe("povezava.postavi.si");
    expect(c.domains.providers).toEqual({ registrar: "fake", edge: "cloudflare-saas", dns: "system" });
  });

  it("reads an old file's single switch as both switches", () => {
    for (const enabled of [true, false]) {
      const r = raw();
      delete r.domains.connect;
      delete r.domains.register;
      r.domains.enabled = enabled;
      const c = AppConfigSchema.parse(r);
      expect(domainModes(c)).toEqual({ connect: enabled, register: enabled, any: enabled });
      expect(c.domains.connect.cnameTarget).toBe("povezava.postavi.example");
      expect("enabled" in c.domains).toBe(false);
    }
  });

  it("leaves a new-shape value alone and keeps new keys over the old switch", () => {
    const now = { connect: { enabled: true, cnameTarget: "x.postavi.si" }, register: { enabled: false } };
    expect(migrateDomainsConfig(now)).toBe(now);
    expect(migrateDomainsConfig({ ...now, enabled: true })).toEqual(now);
    expect(migrateDomainsConfig(null)).toBe(null);
  });

  it("refuses an unknown edge, a registrar other than the fake, and a CNAME target that isn't a hostname", () => {
    const bad = (patch: (d: Record<string, unknown>) => void) => {
      const r = raw();
      patch(r.domains);
      return AppConfigSchema.safeParse(r).success;
    };
    expect(bad(() => undefined)).toBe(true);
    expect(bad((d) => ((d.providers as Record<string, unknown>).edge = "railway"))).toBe(false);
    expect(bad((d) => ((d.providers as Record<string, unknown>).registrar = "openprovider"))).toBe(false);
    expect(bad((d) => (d.connect = { enabled: true, cnameTarget: "https://povezava.postavi.si/" }))).toBe(false);
    expect(bad((d) => (d.register = { enabled: false, extra: 1 }))).toBe(false);
  });
});
