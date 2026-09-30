import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppConfig } from "@sb/config";
import {
  PublishBlockedError,
  siteBlockers,
  applyDirectEdit,
  defaultSection,
  editorCatalogue,
  exportSite,
  mediaKey,
  publishSite,
  publishedPrefix,
  switchDirection,
  uploadKey,
  imageMeta,
  type Operation,
} from "@sb/engine";
import { VersionConflictError, contentType, type Platform } from "@sb/platform";
import { renderPage, sharedBundle, pageFile } from "@sb/render";
import { collectPlaceholders, type SiteSpec } from "@sb/spec";
import { issueSession, clearSession, hasSession, passwordMatches, requireAuth, loginThrottle, type AuthSettings } from "./auth.ts";
import { slugify } from "./slug.ts";
import { DASHBOARD, loginPage, sitesPage, sitePage, intakePage } from "./pages.tsx";
import { homePage } from "./home.tsx";
import { clientBundle } from "./client-bundle.ts";
import { uiAssets } from "./ui/assets.ts";
import { registerFormRoutes } from "./forms.tsx";
import { createHash } from "node:crypto";
import { JS_FLAG } from "@sb/components";

/** CSP source for the one inline script sites contain, so script-src needs no 'unsafe-inline'. */
const JS_FLAG_HASH = `sha256-${createHash("sha256").update(JS_FLAG).digest("base64")}`;

export interface AppOptions {
  platform: Platform;
  config: AppConfig;
  auth: AuthSettings;
}

/** Same-origin path only: "/x" but not "//host", "/\host" or anything with whitespace. Default: the sites list. */
export function safeNext(v: unknown): string {
  return typeof v === "string" && /^\/(?![/\\])[^\s\\]*$/.test(v) ? v : DASHBOARD;
}

const SAFE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SAFE_HASH = /^[0-9a-f]{10}$/;
const SAFE_ID = /^site_[0-9a-f]{16}$/;
/** One or more path segments of plain file names: no "..", no empty segments. */
const SAFE_REST = /^([a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*$/i;

// The UI stylesheet and fonts are public: the login and landing pages need them. "/" is the landing
// page for everyone; the dashboard is /sites.
const PUBLIC = (path: string) =>
  path === "/" || path === "/health" || path === "/login" || path.startsWith("/s/") || path.startsWith("/assets/ui/") || path === "/assets/home.js" || path === "/favicon.ico";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const LOGO_TYPES = new Set([...IMAGE_TYPES, "image/svg+xml"]);
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/svg+xml": "svg" };

export function createApp({ platform, config, auth }: AppOptions): Hono {
  const { repo, storage, queue, db } = platform;
  const app = new Hono();
  const throttle = loginThrottle();

  // Deployed environments are public URLs: nothing here may be indexed, published sites included in phase 1.
  app.use("*", async (c, next) => {
    // Encoded slashes or backslashes never belong in our paths; they are how params escape their prefix.
    // Only the path: the query legitimately carries them (login?next=%2F).
    if (/%2f|%5c/i.test(c.req.url.split("?")[0]!)) return c.text("Bad request", 400);
    await next();
    c.header("X-Robots-Tag", "noindex, nofollow");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    // Published sites share the dashboard's origin: only our own scripts, and map embeds after consent.
    c.header(
      "Content-Security-Policy",
      c.req.path.startsWith("/s/") || c.req.path.startsWith("/preview/")
        ? `default-src 'self'; script-src 'self' '${JS_FLAG_HASH}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; frame-src https://www.google.com https://maps.google.com; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'`
        : `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors ${
            // The landing page frames its example site (/assets/ui/<hash>/example-home.html).
            c.req.path.startsWith("/assets/ui/") ? "'self'" : "'none'"
          }`,
    );
  });
  app.use("*", requireAuth(auth, PUBLIC));
  app.use("/login", bodyLimit({ maxSize: 16 * 1024 }));
  app.use("/api/sites", bodyLimit({ maxSize: (config.limits.maxPhotos + 1) * config.limits.maxUploadBytes + 64 * 1024 }));
  app.use("/api/sites/*", bodyLimit({ maxSize: 1024 * 1024 }));
  // Contact forms: public submit next to published sites, owner's messages in the dashboard.
  registerFormRoutes(app, { repo, config, secret: auth.secret });

  // ---------- Health ----------
  app.get("/health", async (c) => {
    const checks: Record<string, string> = {};
    const run = async (name: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
        checks[name] = "ok";
      } catch (e) {
        checks[name] = `error: ${(e as Error).message.slice(0, 120)}`;
      }
    };
    await run("database", () => db.query("select 1"));
    await run("storage", () => storage.ping());
    await run("queue", () => queue.ping());
    const ok = Object.values(checks).every((v) => v === "ok");
    return c.json({ status: ok ? "ok" : "degraded", checks }, ok ? 200 : 503);
  });

  // ---------- Auth ----------
  app.get("/login", (c) => c.html(loginPage({ next: safeNext(c.req.query("next")) })));
  app.post("/login", async (c) => {
    // The rightmost X-Forwarded-For entry is the one our proxy added; the left ones are client-controlled.
    const ip = c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "local";
    const body = await c.req.parseBody();
    const next = safeNext(body.next);
    if (!throttle(ip)) return c.html(loginPage({ next, error: "Preveč poskusov. Poskusite čez nekaj minut." }), 429);
    if (typeof body.password !== "string" || !passwordMatches(body.password, auth.password)) {
      return c.html(loginPage({ next, error: "Napačno geslo." }), 401);
    }
    issueSession(c, auth);
    return c.redirect(next);
  });
  app.post("/logout", (c) => {
    clearSession(c);
    return c.redirect("/");
  });

  for (const name of ["editor", "dashboard", "home"] as const) {
    app.get(`/assets/${name}.js`, async (c) => {
      c.header("content-type", "text/javascript; charset=utf-8");
      return c.body(await clientBundle(name));
    });
  }
  app.get("/assets/ui/:hash/*", (c) => {
    const { hash, files } = uiAssets();
    const file = files.get(c.req.path.slice(`/assets/ui/${c.req.param("hash")}/`.length));
    if (!file) return c.notFound();
    // An old hash still gets the current file, just not cached for good.
    c.header("cache-control", c.req.param("hash") === hash ? "public, max-age=31536000, immutable" : "no-cache");
    c.header("content-type", file.type);
    return c.body(file.data as Uint8Array<ArrayBuffer>);
  });
  app.get("/favicon.ico", (c) => c.redirect(`/assets/ui/${uiAssets().hash}/icon.svg`, 301));

  // ---------- Landing page ----------
  app.get("/", (c) => c.html(homePage({ config, signedIn: hasSession(c, auth) })));

  // ---------- Dashboard ----------
  app.get(DASHBOARD, async (c) => {
    const sites = await repo.listSites();
    return c.html(sitesPage({ sites, spendToday: await repo.spendToday(), cap: config.limits.dailyModelSpendCapEur, maxPhotos: config.limits.maxPhotos }));
  });
  app.get("/new", async (c) =>
    c.html(intakePage({ spendToday: await repo.spendToday(), cap: config.limits.dailyModelSpendCapEur, maxPhotos: config.limits.maxPhotos, hasSites: (await repo.listSites()).length > 0 })),
  );

  app.post("/api/sites", async (c) => {
    const body = await c.req.parseBody({ all: true });
    const description = typeof body.description === "string" ? body.description.trim() : "";
    // The intake again, with the description kept and the reason on top.
    const refuse = async (error: string) =>
      c.html(
        intakePage({ spendToday: await repo.spendToday(), cap: config.limits.dailyModelSpendCapEur, maxPhotos: config.limits.maxPhotos, hasSites: (await repo.listSites()).length > 0, error, description }),
        400,
      );
    if (description.length < 30) return refuse("Opis mora imeti vsaj 30 znakov.");
    const scope = body.scope === "full" ? "full" : "home";
    const photos = ([] as unknown[]).concat(body["photos"] ?? []).filter((f): f is File => f instanceof File && f.size > 0);
    const logo = body.logo instanceof File && body.logo.size > 0 ? body.logo : undefined;
    if (photos.length > config.limits.maxPhotos) return refuse(`Največ ${config.limits.maxPhotos} fotografij. Izberite jih znova.`);
    for (const f of [...photos, ...(logo ? [logo] : [])]) {
      if (f.size > config.limits.maxUploadBytes) return refuse(`Datoteka ${f.name} je prevelika. Izberite fotografije znova.`);
    }
    for (const f of photos) if (!IMAGE_TYPES.has(f.type)) return refuse(`Nepodprta vrsta slike: ${f.name}. Izberite fotografije znova.`);
    if (logo && !LOGO_TYPES.has(logo.type)) return refuse("Logotip mora biti SVG, PNG, JPEG, WebP ali AVIF.");

    const slug = await repo.uniqueSlug(slugify(description) || "stran");
    const site = await repo.createSite({ name: slug, slug, intake: { description, photoAssetIds: [], scope } });
    const stored = async (f: File, kind: "photo" | "logo") => {
      const data = new Uint8Array(await f.arrayBuffer());
      const meta = await imageMeta(data).catch(() => null);
      if (!meta) throw new Error(`Slike ${f.name} ni mogoče prebrati.`);
      const id = `asset_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const key = `${uploadKey(site.id, id)}.${EXT[f.type]}`;
      await storage.put(key, data, f.type);
      return repo.addAsset({ id, site_id: site.id, kind, storage_key: key, mime: f.type, width: meta.width, height: meta.height, bytes: f.size, original_name: f.name.slice(0, 200) });
    };
    try {
      const photoRows = [];
      for (const f of photos) photoRows.push(await stored(f, "photo"));
      const logoRow = logo ? await stored(logo, "logo") : undefined;
      await db.query("update sites set intake = $2 where id = $1", [
        site.id,
        JSON.stringify({ description, scope, photoAssetIds: photoRows.map((r) => r.id), ...(logoRow ? { logoAssetId: logoRow.id } : {}) }),
      ]);
    } catch (e) {
      await repo.setStatus(site.id, "failed");
      return c.text((e as Error).message, 400);
    }
    await repo.setStatus(site.id, "generating");
    await queue.send("generate", { siteId: site.id, scope });
    return c.redirect(`/sites/${site.id}`, 303);
  });

  app.get("/sites/:id", async (c) => {
    const site = await repo.getSite(c.req.param("id"));
    if (!site) return c.notFound();
    return c.html(sitePage({ site }));
  });

  app.get("/api/sites/:id", async (c) => {
    const id = c.req.param("id");
    const site = await repo.getSite(id);
    if (!site) return c.json({ error: "not found" }, 404);
    const current = await repo.getSpec(id);
    const after = Number(c.req.query("after") ?? 0);
    return c.json({
      site,
      version: current?.version ?? null,
      spec: current?.spec ?? null,
      events: await repo.listEvents(id, after),
      chat: await repo.listChat(id),
      cost: await repo.siteCost(id),
      versions: await repo.listVersions(id),
      placeholders: current ? collectPlaceholders(current.spec) : [],
      blockers: current ? await siteBlockers(repo, id, current.spec) : [],
      messages: (await repo.listFormMessages(id)).length,
      spendToday: await repo.spendToday(),
      cap: config.limits.dailyModelSpendCapEur,
    });
  });

  app.get("/api/sites/:id/catalogue", async (c) => {
    const current = await repo.getSpec(c.req.param("id"));
    if (!current) return c.json({ error: "no spec yet" }, 404);
    return c.json(editorCatalogue(current.spec));
  });

  // ---------- Direct editor: deterministic, no model calls ----------
  const directEdit = async (c: Context, siteId: string, baseVersion: unknown, build: (spec: SiteSpec) => Operation[] | { error: string }, message: string) => {
    const current = await repo.getSpec(siteId);
    if (!current) return c.json({ error: "no spec yet" }, 404);
    if (typeof baseVersion === "number" && baseVersion !== current.version) {
      return c.json({ error: "conflict", message: "Stran je bila medtem spremenjena. Osvežite urejevalnik.", version: current.version }, 409);
    }
    const ops = build(current.spec);
    if ("error" in ops) return c.json({ error: ops.error }, 400);
    const r = applyDirectEdit(current.spec, ops);
    if (!r.ok) return c.json({ error: "invalid", issues: r.issues.slice(0, 20) }, 422);
    let version: number;
    try {
      version = await repo.saveSpec(siteId, r.spec, "manual", message.slice(0, 200), ops, current.version);
    } catch (e) {
      if (e instanceof VersionConflictError) return c.json({ error: "conflict", message: "Stran je bila medtem spremenjena. Osvežite urejevalnik." }, 409);
      throw e;
    }
    return c.json({ ok: true, version, adjustments: r.adjustments });
  };

  app.post("/api/sites/:id/patch", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { baseVersion?: number; ops?: Operation[]; message?: string };
    if (!Array.isArray(body.ops) || body.ops.length === 0 || body.ops.length > 200) return c.json({ error: "ops required" }, 400);
    return directEdit(c, c.req.param("id"), body.baseVersion, () => body.ops!, body.message ?? "urejanje");
  });

  app.post("/api/sites/:id/sections", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { baseVersion?: number; pageIndex?: number; index?: number; type?: string };
    return directEdit(
      c,
      c.req.param("id"),
      body.baseVersion,
      (spec) => {
        const page = spec.pages[body.pageIndex ?? -1];
        if (!page || typeof body.type !== "string") return { error: "page and type required" };
        const taken = new Set(spec.pages.flatMap((p) => p.sections.map((s) => s.id)));
        let n = 1;
        const base = `s_${body.type.replace(/-/g, "_")}`;
        let id = base;
        while (taken.has(id)) id = `${base}_${++n}`;
        const section = defaultSection(spec, body.type, id);
        if (!section) return { error: "Tega razdelka ni mogoče dodati (morda potrebuje fotografije)." };
        const index = Math.min(Math.max(body.index ?? page.sections.length, 0), page.sections.length);
        return [{ op: "add", path: `/pages/${body.pageIndex}/sections/${index}`, value: section }];
      },
      `dodan razdelek ${body.type}`,
    );
  });

  app.post("/api/sites/:id/pages", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { baseVersion?: number; slug?: string; label?: string };
    return directEdit(
      c,
      c.req.param("id"),
      body.baseVersion,
      (spec) => {
        const slug = slugify(body.slug ?? "", 5);
        const label = (body.label ?? "").trim().slice(0, 24);
        if (!slug || !label) return { error: "Vnesite ime in naslov strani." };
        if (spec.pages.some((p) => p.slug === slug)) return { error: "Stran s tem naslovom že obstaja." };
        const header = defaultSection(spec, "page-header", `s_${slug.replace(/-/g, "_")}_head`);
        if (!header) return { error: "Glave strani ni mogoče ustvariti." };
        (header.props as Record<string, unknown>).title = label;
        const index = spec.pages.filter((p) => p.kind === "home" || p.kind === "standard").length;
        const page = { id: `p_${slug.replace(/-/g, "_")}`, kind: "standard", slug, nav: { label, show: true }, seo: { title: label, description: `${label} – ${spec.business.name}`.slice(0, 160) }, sections: [header] };
        return [{ op: "add", path: `/pages/${index}`, value: page }];
      },
      "dodana stran",
    );
  });

  app.post("/api/sites/:id/direction", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { baseVersion?: number; direction?: string };
    return directEdit(
      c,
      c.req.param("id"),
      body.baseVersion,
      (spec) => {
        try {
          return [{ op: "replace", path: "/design", value: switchDirection(spec, String(body.direction)) }];
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
      `smer ${body.direction}`,
    );
  });

  app.post("/api/sites/:id/revert", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { version?: number };
    const target = typeof body.version === "number" ? await repo.getSpec(id, body.version) : null;
    if (!target) return c.json({ error: "version not found" }, 404);
    const version = await repo.saveSpec(id, target.spec, "revert", `povrnjeno na različico ${target.version}`);
    return c.json({ ok: true, version });
  });

  // ---------- AI chat edit (the only edit path that calls the model) ----------
  app.post("/api/sites/:id/chat", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { message?: string };
    const message = (body.message ?? "").trim();
    if (!message || message.length > 2000) return c.json({ error: "message required (max 2000 chars)" }, 400);
    if (!(await repo.getSpec(id))) return c.json({ error: "no spec yet" }, 409);
    if ((await repo.spendToday()) >= config.limits.dailyModelSpendCapEur) return c.json({ error: "Dnevna omejitev porabe je dosežena." }, 429);
    const msg = await repo.addChat(id, "user", message);
    await queue.send("edit", { siteId: id, messageId: Number(msg.id) });
    return c.json({ ok: true });
  });

  app.post("/api/sites/:id/generate", async (c) => {
    const id = c.req.param("id");
    const site = await repo.getSite(id);
    if (!site) return c.json({ error: "not found" }, 404);
    if ((await repo.spendToday()) >= config.limits.dailyModelSpendCapEur) return c.json({ error: "Dnevna omejitev porabe je dosežena." }, 429);
    const body = (await c.req.json().catch(() => ({}))) as { scope?: string };
    const scope = body.scope === "full" ? "full" : "home";
    await db.query("update sites set intake = jsonb_set(intake, '{scope}', to_jsonb($2::text)) where id = $1", [id, scope]);
    await repo.setStatus(id, "generating");
    await queue.send("generate", { siteId: id, scope });
    return c.json({ ok: true });
  });

  app.post("/api/sites/:id/publish", async (c) => {
    try {
      const r = await publishSite({ repo, storage, config }, c.req.param("id"));
      const site = await repo.getSite(c.req.param("id"));
      return c.json({ ok: true, version: r.version, url: `/s/${site?.slug}/` });
    } catch (e) {
      if (e instanceof PublishBlockedError) return c.json({ error: "blocked", blockers: e.blockers }, 422);
      throw e;
    }
  });

  app.get("/api/sites/:id/export", async (c) => {
    const { filename, zip } = await exportSite({ repo, storage, config }, c.req.param("id"));
    c.header("content-type", "application/zip");
    c.header("content-disposition", `attachment; filename="${filename}"`);
    return c.body(zip as Uint8Array<ArrayBuffer>);
  });

  // ---------- Preview: same renderer as publish, current (or ?v=) version ----------
  app.get("/preview/_shared/:hash/*", (c) => serveShared(c, c.req.param("hash"), c.req.path.split(`/_shared/${c.req.param("hash")}/`)[1] ?? ""));
  app.get("/preview/:id/media/:file", async (c) => {
    const id = c.req.param("id");
    const file = c.req.param("file");
    if (!SAFE_ID.test(id) || !SAFE_REST.test(file) || file.includes("/")) return c.notFound();
    const data = await storage.get(mediaKey(id, file));
    if (!data) return c.notFound();
    c.header("content-type", contentType(c.req.param("file")));
    c.header("cache-control", "private, max-age=3600");
    return c.body(data as Uint8Array<ArrayBuffer>);
  });
  app.get("/preview/:id/:file", async (c) => {
    const v = c.req.query("v");
    if (!SAFE_ID.test(c.req.param("id"))) return c.notFound();
    const current = await repo.getSpec(c.req.param("id"), v && /^\d+$/.test(v) ? Number(v) : undefined);
    if (!current) return c.text("Predogled še ni pripravljen.", 404);
    const page = current.spec.pages.find((p) => pageFile(p) === c.req.param("file"));
    if (!page) return c.notFound();
    c.header("cache-control", "no-store");
    return c.html(renderPage(current.spec, page, { imageWidths: config.images.widths }));
  });

  // ---------- Published sites (public) ----------
  app.get("/s/_shared/:hash/*", (c) => serveShared(c, c.req.param("hash"), c.req.path.split(`/_shared/${c.req.param("hash")}/`)[1] ?? ""));
  app.get("/s/:slug", (c) => (SAFE_SLUG.test(c.req.param("slug")) ? c.redirect(`/s/${c.req.param("slug")}/`, 301) : c.notFound()));
  app.get("/s/:slug/*", async (c) => {
    const slug = c.req.param("slug");
    if (!SAFE_SLUG.test(slug)) return c.notFound();
    let rest = c.req.path.slice(`/s/${slug}/`.length);
    if (rest === "" || rest.endsWith("/")) rest += "index.html";
    if (!SAFE_REST.test(rest)) return c.notFound();
    const data = await storage.get(`${publishedPrefix}/${slug}/${rest}`);
    if (data) {
      c.header("content-type", contentType(rest));
      c.header("cache-control", rest.startsWith("media/") ? "public, max-age=31536000, immutable" : "public, max-age=60");
      return c.body(data as Uint8Array<ArrayBuffer>);
    }
    const notFound = await storage.get(`${publishedPrefix}/${slug}/404.html`);
    if (notFound) return c.body(notFound as Uint8Array<ArrayBuffer>, 404, { "content-type": "text/html; charset=utf-8" });
    return c.text("Stran ne obstaja.", 404);
  });

  async function serveShared(c: Context, hash: string, file: string) {
    if (!SAFE_HASH.test(hash) || !SAFE_REST.test(file)) return c.notFound();
    const bundle = sharedBundle();
    let data: Uint8Array | null | undefined = hash === bundle.hash ? bundle.files.get(file) : undefined;
    // Older bundles stay available from storage so previously published sites keep working.
    if (!data) data = await storage.get(`${publishedPrefix}/_shared/${hash}/${file}`);
    if (!data) return c.notFound();
    c.header("content-type", contentType(file));
    c.header("cache-control", "public, max-age=31536000, immutable");
    return c.body(data as Uint8Array<ArrayBuffer>);
  }

  app.onError((e, c) => {
    console.error("[web]", e);
    return c.json({ error: "internal error", message: e.message.slice(0, 300) }, 500);
  });

  return app;
}

