import type { Hono } from "hono";
import type { AppConfig } from "@sb/config";
import {
  DomainStartError,
  OwnDomainError,
  REGISTRANT_LABEL,
  cleanRegistrant,
  domainState,
  domainSuggestions,
  planOwnDomain,
  registrantFromSpec,
  registrantMissing,
  startDomain,
} from "@sb/engine";
import { normaliseHostname, type DomainProviders, type Queue, type Repo } from "@sb/platform";
import { formatPhone } from "@sb/spec";
import { publishRefusal, refusalJson, type AppEnv } from "./access.ts";

/**
 * The domain step of publishing (it-domain-flow): names to buy from the business name with their price
 * (config), the holder's details prefilled from the site's facts, "Že imam domeno" with the exact record
 * to add, and each domain's progress in Slovene. Provisioning itself runs in the worker (queue "domain").
 * Registering and connecting are publishing rights (paid plans and the admin).
 */

export interface DomainRouteDeps {
  repo: Repo;
  queue: Queue;
  config: AppConfig;
  providers: DomainProviders;
  platformDomain: string | null;
  /** The app's own hostnames: never connectable as a site's domain. */
  appHosts: readonly string[];
}

/** "Ponudbe domen trenutno ne moremo preveriti" and the like: the registrar didn't answer. */
export const SUGGESTIONS_UNAVAILABLE = "Prostih domen trenutno ne moremo preveriti. Poskusite znova čez nekaj minut ali povežite domeno, ki jo že imate.";

/** The site's domains as the owner reads them, and whether the step is on. Also part of the editor's state. */
export async function domainsInfo(d: Pick<DomainRouteDeps, "repo" | "config" | "platformDomain">, siteId: string, slug: string) {
  const rows = await d.repo.domains.forSite(siteId);
  const platform = d.platformDomain ? normaliseHostname(d.platformDomain) : null;
  return {
    enabled: d.config.domains.enabled,
    // Only the names that serve the site on their own; a registered domain's www redirects to it.
    domains: rows.filter((r) => !(r.status === "active" && !r.is_primary && typeof r.detail.redirectsTo === "string")).map((r) => domainState(r, d.config)),
    platformAddress: platform ? `https://${slug}.${platform}/` : null,
  };
}

export function registerDomainRoutes(app: Hono<AppEnv>, d: DomainRouteDeps): void {
  const { repo, queue, config, providers } = d;

  app.get("/api/sites/:id/domains", async (c) => {
    const site = await repo.getSite(c.req.param("id"));
    if (!site) return c.json({ error: "not found" }, 404);
    const spec = (await repo.getSpec(site.id))?.spec;
    const registrant = spec ? registrantFromSpec(spec, await repo.siteOwnerEmail(site.id)) : {};
    return c.json({
      ...(await domainsInfo(d, site.id, site.slug)),
      // The holder's details from the site's facts; the confirm sheet shows them with "Uredi".
      registrant,
      // The same details as one line, written the way the site writes them (+386 41 123 456).
      holder: [
        registrant.kind === "company" && registrant.companyName ? registrant.companyName : null,
        [registrant.firstName, registrant.lastName].filter(Boolean).join(" ") || null,
        registrant.street ? `${registrant.street}, ${[registrant.postalCode, registrant.city].filter(Boolean).join(" ")}` : null,
        registrant.phone ? formatPhone(registrant.phone) : null,
        registrant.email ?? null,
      ].filter(Boolean).join(" · "),
      missing: registrantMissing(registrant),
      labels: REGISTRANT_LABEL,
      years: config.domains.registrationYears,
    });
  });

  app.get("/api/sites/:id/domains/suggestions", async (c) => {
    if (!config.domains.enabled) return c.json({ suggestions: [] });
    try {
      return c.json({ suggestions: await domainSuggestions({ repo, config, providers }, c.req.param("id")) });
    } catch (e) {
      console.error("[domains] suggestions:", (e as Error).message);
      return c.json({ suggestions: [], message: SUGGESTIONS_UNAVAILABLE });
    }
  });

  const refuse = () => [...(d.platformDomain ? [d.platformDomain] : []), ...d.appHosts];

  // "Že imam domeno": the record to add at the owner's DNS host. DNS is only read.
  app.post("/api/sites/:id/domains/inspect", async (c) => {
    const denied = publishRefusal(c.get("viewer"), config);
    if (denied) return refusalJson(c, denied);
    if (!config.domains.enabled) return c.json({ error: "disabled", message: "Lastne domene še niso na voljo." }, 409);
    const body = (await c.req.json().catch(() => ({}))) as { hostname?: unknown };
    try {
      return c.json(await planOwnDomain({ providers }, String(body.hostname ?? ""), { refuse: refuse() }));
    } catch (e) {
      if (e instanceof OwnDomainError) return c.json({ error: "invalid", message: e.message }, 400);
      throw e;
    }
  });

  app.post("/api/sites/:id/domains", async (c) => {
    const denied = publishRefusal(c.get("viewer"), config);
    if (denied) return refusalJson(c, denied);
    if (!config.domains.enabled) return c.json({ error: "disabled", message: "Lastne domene še niso na voljo." }, 409);
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { kind?: unknown; hostname?: unknown; registrant?: unknown };
    const hostname = String(body.hostname ?? "");
    try {
      const row =
        body.kind === "connected"
          ? await startDomain({ repo, config, providers }, id, { kind: "connected", hostname, refuse: refuse() })
          : await startDomain({ repo, config, providers }, id, { kind: "registered", hostname, registrant: cleanRegistrant(body.registrant) });
      await queue.send("domain", { hostname: row.hostname });
      return c.json({ ok: true, domain: domainState(row, config) });
    } catch (e) {
      if (e instanceof DomainStartError || e instanceof OwnDomainError) return c.json({ error: "refused", message: e.message }, 400);
      throw e;
    }
  });

  // "Preveri zdaj" (a connected domain waiting for its record) and "Poskusi znova" (a failed one).
  app.post("/api/sites/:id/domains/:hostname/check", async (c) => {
    const denied = publishRefusal(c.get("viewer"), config);
    if (denied) return refusalJson(c, denied);
    const row = await repo.domains.get(c.req.param("hostname"));
    if (!row || row.site_id !== c.req.param("id")) return c.json({ error: "not found" }, 404);
    if (row.status === "failed") await repo.domains.retry(row.hostname);
    if (row.status !== "active") await queue.send("domain", { hostname: row.hostname, force: true });
    return c.json({ ok: true });
  });
}
