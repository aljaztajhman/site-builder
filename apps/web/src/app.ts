import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import type { AppConfig } from "@sb/config";
import {
  PublishBlockedError,
  PublishBusyError,
  siteChecklist,
  applyDirectEdit,
  defaultSection,
  editorCatalogue,
  exportSite,
  mediaKey,
  publishSite,
  siteAddress,
  startCollection,
  publishedPrefix,
  publishedBase,
  switchDirection,
  typedOps,
  uploadKey,
  imageMeta,
  addPhotos,
  PhotoError,
  limitBreach,
  picturesNotice,
  type Operation,
  type Resolve,
} from "@sb/engine";
import { VersionConflictError, contentType, domainProvidersFor, mailerFromEnv, newId, type DomainProviders, type Mailer, type Platform, type SiteStatus, type Tier } from "@sb/platform";
import { renderPage, renderPath, sharedBundle, pageFile, notFoundPlacement, rebaseRelativeUrls } from "@sb/render";
import { CollectionKind, blockerText, collectPlaceholders, markOwnerEdits, sectionDef, type SiteSpec } from "@sb/spec";
import type { AuthSettings } from "./auth.ts";
import { clientIp, csrfOk, fullSiteRefusal, identity, publishRefusal, refusalJson, sameOriginOnly, signedIn, siteAccess, tierOf, type AppEnv, type Refusal } from "./access.ts";
import { accessInfo, allowanceFor, picturesFor, picturesShort, previewBadge, reserveJob } from "./limits.ts";
import { registerReminderRoutes } from "./reminder.tsx";
import { formatDate } from "./ui/labels.ts";
import { TOKEN_FIELD, TURNSTILE_ORIGIN, botCheckFromEnv, type BotCheck } from "./turnstile.ts";
import { registerLoginRoutes } from "./login.tsx";
import { registerAdminRoutes } from "./admin.tsx";
import { registerPrivacyRoute } from "./privacy.tsx";
import { registerCheckerRoutes } from "./checker.tsx";
import { dayIn, registerStatsRoutes, statsCounter } from "./stats.ts";
import { servedForSiteHost, siteHostResolver, siteHosts } from "./site-hosts.ts";
import { descriptionHash, readTicket, signTicket } from "./upload-ticket.ts";
import { slugify } from "./slug.ts";
import { DASHBOARD, sitesPage, sitePage } from "./pages.tsx";
import { homePage } from "./home.tsx";
import { clientBundle, warmClientBundles } from "./client-bundle.ts";
import { uiAssets } from "./ui/assets.ts";
import { registerFormRoutes } from "./forms.tsx";
import { domainsInfo, registerDomainRoutes } from "./domains.ts";
import { createHash } from "node:crypto";
import { JS_FLAG } from "@sb/components";

export { safeNext } from "./access.ts";

/** CSP source for the one inline script sites contain, so script-src needs no 'unsafe-inline'. */
const JS_FLAG_HASH = `sha256-${createHash("sha256").update(JS_FLAG).digest("base64")}`;

export interface AppOptions {
  platform: Platform;
  config: AppConfig;
  auth: AuthSettings;
  /** Sends sign-in links and contact-form emails; from env (Resend, or the console in development) when not given. */
  mailer?: Mailer;
  /** Public origin for links in emails, e.g. https://stranko.example (APP_URL, or Railway's public domain). */
  appUrl?: string;
  /** Bot check on the anonymous intake (Turnstile); from env when not given. */
  botCheck?: BotCheck;
  /**
   * The classifier (Haiku) for the junk check at intake, before anything else is spent; its call is
   * logged against the job. Absent (tests), the pipeline's own classification is the only check.
   */
  classifyIntake?: ClassifyIntake;
  /** DNS for the website checker's private-address refusal (tests). */
  checkerResolve?: Resolve;
  /** PLATFORM_DOMAIN: published sites also answer at <slug>.<domain> (site-hosts.ts). */
  platformDomain?: string | null;
  /** How long a hostname's answer is reused (tests: 0). */
  siteHostCacheMs?: number;
  /** SITE_PROXY_SECRET: the edge Worker's proof that its forwarded site hostname is real. */
  siteProxySecret?: string | null;
  /** Registrar, edge and DNS for own domains; config `domains.providers` when not given (only fakes exist there). */
  domainProviders?: DomainProviders;
}

export type ClassifyIntake = (description: string, ctx: { siteId: string; tier: Tier; accountId: string | null; aiJobId: string }) => Promise<{ businessType: string; confidence: number }>;

const SAFE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SAFE_HASH = /^[0-9a-f]{10}$/;
const SAFE_ID = /^site_[0-9a-f]{16}$/;
/** One or more path segments of plain file names: no "..", no empty segments. */
const SAFE_REST = /^([a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*$/i;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const LOGO_TYPES = new Set([...IMAGE_TYPES, "image/svg+xml"]);
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/svg+xml": "svg" };

/** Under the landing page's prompt while the free homepage is still there to make. */
export const LANDING_FREE_LINE = "Brezplačno, brez prijave in brez kartice.";

/** An export with something on the publish checklist, not confirmed yet. */
export const EXPORT_CHECKLIST_MESSAGE = "Stran še ni pripravljena za objavo: nekateri podatki manjkajo ali niso preverjeni. Preverite seznam ali stran izvozite vseeno.";

export function createApp({ platform, config, auth, ...opts }: AppOptions): Hono<AppEnv> {
  const { repo, storage, queue, db } = platform;
  const app = new Hono<AppEnv>();
  const mailer = opts.mailer ?? mailerFromEnv();
  const botCheck = opts.botCheck ?? botCheckFromEnv(process.env, auth.secureCookies);
  const limits = { repo, config, secret: auth.secret };
  // The landing page and the intake's refusal page carry the Turnstile widget (its script and frame).
  const turnstileCsp = (path: string) => botCheck.mode === "on" && (path === "/" || path === "/api/sites" || path === "/pregled");

  // A published site's own hostname (or <slug>.<PLATFORM_DOMAIN>) is served as its /s/<slug>/ path.
  const appHosts = ["localhost", "127.0.0.1", ...(opts.appUrl ? [new URL(opts.appUrl).host] : [])];
  app.use("*", siteHosts(app, siteHostResolver({ repo, platformDomain: opts.platformDomain ?? null, appHosts, ...(opts.siteHostCacheMs !== undefined ? { cacheMs: opts.siteHostCacheMs } : {}) }), { proxySecret: opts.siteProxySecret ?? null }));

  // Deployed environments are public URLs: nothing here may be indexed, published sites included in phase 1.
  app.use("*", async (c, next) => {
    // Encoded slashes or backslashes never belong in our paths; they are how params escape their prefix.
    // Only the path: the query legitimately carries them (login?next=%2F).
    if (/%2f|%5c/i.test(c.req.url.split("?")[0]!)) return c.text("Bad request", 400);
    await next();
    // A published site on its own hostname may be indexed once config seo.indexSiteHosts is on (it-seo-basics);
    // the app's origin, /s/ paths included, never.
    if (!(config.seo.indexSiteHosts && servedForSiteHost(c.req.raw) && c.req.path.startsWith("/s/"))) c.header("X-Robots-Tag", "noindex, nofollow");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    // Published sites share the dashboard's origin: only our own scripts, and map embeds after consent.
    c.header(
      "Content-Security-Policy",
      // The landing page's example sites are rendered sites too (/assets/ui/<hash>/examples/…).
      c.req.path.startsWith("/s/") || c.req.path.startsWith("/preview/") || /^\/assets\/ui\/[0-9a-f]+\/examples\//.test(c.req.path)
        ? `default-src 'self'; script-src 'self' '${JS_FLAG_HASH}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; frame-src https://www.google.com https://maps.google.com; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'`
        : `default-src 'self'; ${turnstileCsp(c.req.path) ? `script-src 'self' ${TURNSTILE_ORIGIN}; frame-src 'self' ${TURNSTILE_ORIGIN}` : "frame-src 'self'"}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors ${
            // The landing page frames its example sites (/assets/ui/<hash>/examples/…).
            c.req.path.startsWith("/assets/ui/") ? "'self'" : "'none'"
          }`,
    );
  });
  app.use("*", identity({ repo, auth, config }));
  app.use("*", sameOriginOnly);
  app.use("*", siteAccess(repo));
  app.use("/login", bodyLimit({ maxSize: 16 * 1024 }));
  app.use("/login/*", bodyLimit({ maxSize: 16 * 1024 }));
  app.use("/logout", bodyLimit({ maxSize: 16 * 1024 }));
  app.use("/admin/*", bodyLimit({ maxSize: 16 * 1024 }));
  app.use("/api/intake/*", bodyLimit({ maxSize: 16 * 1024 }));
  app.use("/pregled", bodyLimit({ maxSize: 16 * 1024 }));
  // The intake. Without an account nothing of the body is read before its upload ticket (the bot check
  // and the limits passed; upload-ticket.ts) is checked and taken, and the body is capped: a declared
  // size over tiers.anonymous.uploads.maxTotalBytes is refused unread, an undeclared one is cut off as
  // it streams past it.
  const uploads = config.tiers.anonymous.uploads;
  const tooBig = `Brez prijave lahko pošljete skupaj največ ${Math.floor(uploads.maxTotalBytes / 1e6)} MB fotografij in logotipa. Izberite manj ali manjše fotografije.`;
  const signedInLimit = bodyLimit({ maxSize: (config.limits.maxPhotos + 1) * config.limits.maxUploadBytes + 64 * 1024 });
  const anonymousLimit = bodyLimit({
    maxSize: uploads.maxTotalBytes,
    onError: async (c) => {
      const t = (c as Context<AppEnv>).get("ticket");
      if (t) await repo.usage.finishJob(t.j, "failed");
      return c.html(await landing(c as Context<AppEnv>, { error: tooBig }), 413);
    },
  });
  app.use("/api/sites", async (c, next) => {
    if (c.req.method !== "POST") return next();
    if (c.get("viewer").kind !== "anonymous") return signedInLimit(c, next);
    const refuse = async (error: string, status: 403 | 413) => c.html(await landing(c, { error }), status);
    const expired = "Obrazec je potekel. Pošljite ga še enkrat.";
    const given = c.req.query("ticket");
    const t = readTicket(auth.secret, given);
    if (!t) return refuse(given ? expired : "Za predogled brez prijave mora biti v brskalniku vklopljen JavaScript (preverjanje, da niste robot). Lahko se tudi prijavite z e-pošto.", 403);
    if (t.d !== c.get("deviceId")) return refuse(expired, 403);
    const declared = Number(c.req.header("content-length"));
    if (Number.isFinite(declared) && declared > uploads.maxTotalBytes) {
      await repo.usage.finishJob(t.j, "failed");
      return refuse(tooBig, 413);
    }
    if (!(await repo.usage.claimTicketJob(t.j, t.d, t.s))) return refuse(expired, 403);
    c.set("ticket", t);
    return anonymousLimit(c, next);
  });
  // Photo uploads in the editor take files; every other site API call is small JSON.
  const photosLimit = bodyLimit({ maxSize: config.limits.maxPhotos * config.limits.maxUploadBytes + 64 * 1024 });
  const jsonLimit = bodyLimit({ maxSize: 1024 * 1024 });
  // Hono's "/api/sites/*" also matches "/api/sites" itself: the intake has its own limits above (without
  // this, the 1 MB JSON limit refused every intake with more than 1 MB of photos).
  app.use("/api/sites/*", (c, next) =>
    c.req.path === "/api/sites" ? next() : /^\/api\/sites\/[^/]+\/photos$/.test(c.req.path) ? photosLimit(c, next) : jsonLimit(c, next),
  );
  // Contact forms: public submit next to published sites, owner's messages in the dashboard.
  registerFormRoutes(app, { repo, config, secret: auth.secret, mailer, ...(opts.appUrl ? { appUrl: opts.appUrl } : {}) });
  // Sign-in (magic link for owners, password for the admin) and the admin's page.
  registerLoginRoutes(app, {
    repo,
    config,
    auth,
    mailer,
    ...(opts.appUrl ? { appUrl: opts.appUrl } : {}),
    // The anonymous previews carry over from the device that asked for the link (stored with the token,
    // `sb-magic-link-claim` = requesting-device), never from the device that opens it: otherwise anyone
    // could send their own link to a victim and take the victim's previews.
    onSignIn: async (_c, accountId, link) => {
      if (!link.deviceId) return;
      const claimed = await repo.usage.claimDevice(link.deviceId, accountId);
      if (claimed.length) console.log(`[web] ${claimed.length} anonymous preview(s) claimed by ${accountId}`);
    },
  });
  registerAdminRoutes(app, { repo, config, ...(opts.appUrl ? { appUrl: opts.appUrl } : {}) });
  registerPrivacyRoute(app, config);
  // The public website checker (/pregled): no model calls, run by the worker.
  registerCheckerRoutes(app, { repo, queue, config, secret: auth.secret, botCheck, ...(opts.checkerResolve ? { resolve: opts.checkerResolve } : {}) });
  // Cookieless counts for published sites: page views below, taps from stats.js here.
  const stats = statsCounter(repo, config, auth.secret);
  registerStatsRoutes(app, { repo, config, secret: auth.secret, counter: stats });
  // The domain step of publishing; provisioning runs in the worker (queue "domain").
  const domainDeps = { repo, queue, config, providers: opts.domainProviders ?? domainProvidersFor(config.domains.providers), platformDomain: opts.platformDomain ?? null, appHosts };
  registerDomainRoutes(app, domainDeps);
  // The reminder before an anonymous preview is deleted: the visitor's address, and the email's link.
  registerReminderRoutes(app, { repo, config, secret: auth.secret });

  // ---------- Health ----------
  app.get("/health", async (c) => {
    const checks: Record<string, string> = {};
    const run = async (name: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
        checks[name] = "ok";
      } catch (e) {
        // Public URL: the detail (hostnames, driver messages) goes to the log only.
        checks[name] = "error";
        console.error(`[health] ${name}:`, (e as Error).message);
      }
    };
    await run("database", () => db.query("select 1"));
    await run("storage", () => storage.ping());
    await run("queue", () => queue.ping());
    const ok = Object.values(checks).every((v) => v === "ok");
    // `?ip=1` echoes the caller's own address as the IP limits see it, so the proxy setup can be checked from outside.
    const you = c.req.query("ip") === "1" ? { you: { ip: clientIp(c), forwarded: (c.req.header("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean), realIp: c.req.header("x-real-ip") ?? null } } : {};
    return c.json({ status: ok ? "ok" : "degraded", checks, ...you }, ok ? 200 : 503);
  });

  // The editor's and landing page's scripts: linked with their content hash (pages use clientScriptUrl) and
  // then cached for good; a plain or old URL is revalidated by ETag.
  warmClientBundles();
  for (const name of ["editor", "home"] as const) {
    app.get(`/assets/${name}.js`, async (c) => {
      const b = await clientBundle(name);
      const etag = `"${b.hash}"`;
      c.header("etag", etag);
      c.header("cache-control", c.req.query("v") === b.hash ? "public, max-age=31536000, immutable" : "no-cache");
      if (c.req.header("if-none-match") === etag) return c.body(null, 304);
      c.header("content-type", "text/javascript; charset=utf-8");
      return c.body(b.text);
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
  /**
   * The one line under the landing page's prompt. A visitor who still has the free homepage reads the short
   * promise (what an account adds is in the prices and the questions); everyone else what they have left.
   */
  const landingAllowance = async (viewer: AppEnv["Variables"]["viewer"], deviceId?: string) => {
    const a = await allowanceFor(limits, viewer, deviceId ?? "");
    return viewer.kind === "anonymous" && (a.homepagesLeft ?? 0) > 0 ? LANDING_FREE_LINE : a.text;
  };
  const landing = async (c: Context<AppEnv>, extra: { error?: string; description?: string; showcase?: string | undefined } = {}) => {
    const viewer = c.get("viewer");
    const anonymous = viewer.kind === "anonymous";
    const previous = anonymous ? (await repo.usage.deviceSites(c.get("deviceId")))[0] : undefined;
    return homePage({
      config,
      signedIn: signedIn(viewer),
      csrf: c.get("csrf"),
      fullSite: !fullSiteRefusal(viewer, config),
      allowance: await landingAllowance(viewer, c.get("deviceId")),
      botSiteKey: anonymous && botCheck.mode === "on" ? botCheck.siteKey : null,
      anonymousClosed: anonymous && botCheck.mode === "unavailable",
      ...(anonymous ? { anonymousUpload: { ticketUrl: "/api/intake/ticket", maxPhotos: config.tiers.anonymous.uploads.maxPhotos, maxTotalBytes: config.tiers.anonymous.uploads.maxTotalBytes } } : {}),
      ...(previous ? { previous: `/sites/${previous.id}` } : {}),
      // The founding offer's places left: its size (config) minus the places the admin gave (allow_list.founding_at).
      foundingLeft: config.plans.standard.foundingOffer ? Math.max(0, config.plans.standard.foundingOffer.customers - (await repo.accounts.foundingTaken())) : null,
      ...extra,
    });
  };
  app.get("/", async (c) => c.html(await landing(c, { showcase: c.req.query("primer") })));

  // ---------- Dashboard ----------
  app.get(DASHBOARD, async (c) => {
    const viewer = c.get("viewer");
    const admin = viewer.kind === "admin";
    const sites = await repo.listSites(viewer.kind === "account" ? { accountId: viewer.account.id } : {});
    // The last 30 days of each published site (cookieless counts, stats.ts).
    const from = dayIn(config.stats.timeZone, new Date(Date.now() - 29 * 86400_000));
    const tomorrow = dayIn(config.stats.timeZone, new Date(Date.now() + 86400_000));
    const counts = await repo.stats.totalsFor(sites.filter((s) => s.published_version).map((s) => s.id), from, tomorrow);
    return c.html(
      sitesPage({
        sites,
        statsFor: (site) => (site.published_version ? (counts.get(site.id) ?? { visits: 0, calls: 0, directions: 0, forms: 0 }) : null),
        spendToday: admin ? await repo.spendToday() : 0,
        cap: config.limits.dailyModelSpendCapEur,
        csrf: c.get("csrf"),
        admin,
        // Free, unpublished previews carry the small badge beside their thumbnail (never inside it).
        badgeFor: (site) => previewBadge(config, tierOf(viewer), site),
        // An owner sees what is left of their allowance (limits.ts), in Slovene.
        ...(viewer.kind === "account" ? { account: { email: viewer.account.email, note: (await allowanceFor(limits, viewer, c.get("deviceId"))).text } } : {}),
      }),
    );
  });
  // The landing page's prompt box is the only intake; old links land on it.
  app.get("/new", (c) => c.redirect("/#zacni"));

  // Junk: the classifier can't place it. Its cost is logged against the job; the job is refused, so it
  // doesn't use up the visitor's preview. If the classifier can't be asked, the pipeline asks it again.
  const JUNK = "Iz opisa ne znamo razbrati, kakšno podjetje imate. Napišite, kaj ponujate, kje ste in kako vas dosežejo.";
  const classifyFor = async (description: string, ctx: { siteId: string; tier: Tier; accountId: string | null; aiJobId: string }) => {
    if (!opts.classifyIntake) return { classification: undefined, junk: false };
    let classification: { businessType: string; confidence: number } | undefined;
    try {
      classification = await opts.classifyIntake(description, ctx);
    } catch (e) {
      console.warn("[web] intake classification failed; the pipeline classifies again:", (e as Error).message.slice(0, 200));
    }
    const junk = !!classification && classification.confidence < config.tiers.junk.minClassifierConfidence;
    if (junk) await repo.usage.finishJob(ctx.aiJobId, "refused");
    return { classification, junk };
  };
  const tooShort = (n: number) => `Opis naj ima vsaj ${n} znakov: kdo ste, kaj ponujate, kje ste in kako vas dosežejo.`;

  // A preview without an account, step 1 (upload-ticket.ts): only the text fields. The form token, the
  // description's length, the bot check, the limits (which reserve the job) and the junk check, then a
  // signed one-time ticket for the upload. Refusals are JSON; the page keeps the text and shows the message.
  app.post("/api/intake/ticket", async (c) => {
    const viewer = c.get("viewer");
    const body = (await c.req.parseBody()) as Record<string, unknown>;
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (viewer.kind !== "anonymous") return refusalJson(c, { status: 400, code: "signed_in", message: "Prijavljeni ste: pošljite obrazec še enkrat." });
    if (!csrfOk(c, body)) return refusalJson(c, { status: 403, code: "form_expired", message: "Obrazec je potekel. Osvežite stran in pošljite še enkrat." });
    const minChars = config.tiers.junk.minDescriptionChars;
    if (description.length < minChars) return refusalJson(c, { status: 400, code: "too_short", message: tooShort(minChars) });
    if (botCheck.mode === "unavailable") return refusalJson(c, { status: 503, code: "bot_check_unavailable", message: "Brezplačni predogled brez prijave trenutno ni na voljo. Prijavite se z e-pošto.", signIn: "/login" });
    if (!(await botCheck.verify(body[TOKEN_FIELD]))) return refusalJson(c, { status: 403, code: "bot_check_failed", message: "Preverjanje, da niste robot, ni uspelo. Počakajte trenutek in pošljite znova." });
    const deviceId = c.get("deviceId");
    // An earlier ticket this device never used (a dropped upload) doesn't use up its preview.
    await repo.usage.releaseUnclaimedTickets(deviceId);
    const grant = await reserveJob(limits, c, { kind: "generate", scope: "home" });
    if (!grant.ok) return refusalJson(c, grant.refusal);
    const siteId = newId("site");
    const { classification, junk } = await classifyFor(description, { siteId, tier: grant.tier, accountId: null, aiJobId: grant.aiJobId });
    if (junk) return refusalJson(c, { status: 400, code: "junk_intake", message: JUNK });
    const ticket = signTicket(auth.secret, {
      j: grant.aiJobId,
      s: siteId,
      d: deviceId,
      h: descriptionHash(description),
      e: Date.now() + uploads.ticketMinutes * 60_000,
      ...(classification ? { c: classification } : {}),
    });
    return c.json({ ok: true, ticket });
  });

  // The intake. In order, before anything is spent: the form token, the scope, the description's length,
  // the files, then (signed in) the limits, which hold the job's estimated cost, and the classifier
  // (Haiku, ~€0.0006), which refuses what it can't place. Without an account the bot check, the limits
  // and the classifier already ran for the ticket (step 1 above). Every refusal keeps the text in the form.
  app.post("/api/sites", async (c) => {
    const viewer = c.get("viewer");
    // Without an account: the ticket the gate above checked and took. Any refusal from here gives its job back.
    const ticket = viewer.kind === "anonymous" ? c.get("ticket") : undefined;
    const body = await c.req.parseBody({ all: true });
    const description = typeof body.description === "string" ? body.description.trim() : "";
    // The landing page again, with the description kept and the reason above the prompt.
    const refuse = async (error: string, status: Refusal["status"] = 400) => {
      if (ticket) await repo.usage.finishJob(ticket.j, "failed");
      return c.html(await landing(c, { error, description }), status);
    };
    if (viewer.kind === "anonymous" && !ticket) return refuse("Obrazec je potekel. Pošljite ga še enkrat.", 403);
    if (!csrfOk(c, body as Record<string, unknown>)) return refuse("Obrazec je potekel. Pošljite ga še enkrat.", 403);
    const scope = body.scope === "full" ? "full" : "home";
    const fullDenied = scope === "full" ? fullSiteRefusal(viewer, config) : null;
    if (fullDenied) return refuse(fullDenied.message, fullDenied.status);
    const minChars = config.tiers.junk.minDescriptionChars;
    if (description.length < minChars) return refuse(tooShort(minChars));
    // The text that passed the ticket's junk check is the text that is generated from.
    if (ticket && descriptionHash(description) !== ticket.h) return refuse("Opis se je spremenil, ko smo ga že preverili. Pošljite ga še enkrat.", 403);
    const photos = ([] as unknown[]).concat(body["photos"] ?? []).filter((f): f is File => f instanceof File && f.size > 0);
    const logo = body.logo instanceof File && body.logo.size > 0 ? body.logo : undefined;
    const maxPhotos = ticket ? uploads.maxPhotos : config.limits.maxPhotos;
    const maxFile = ticket ? uploads.maxFileBytes : config.limits.maxUploadBytes;
    if (photos.length > maxPhotos) return refuse(`Največ ${maxPhotos} fotografij${ticket ? " brez prijave" : ""}. Izberite jih znova.`);
    for (const f of [...photos, ...(logo ? [logo] : [])]) {
      if (f.size > maxFile) return refuse(`Datoteka ${f.name} je prevelika (največ ${Math.floor(maxFile / 1e6)} MB). Izberite fotografije znova.`);
    }
    for (const f of photos) if (!IMAGE_TYPES.has(f.type)) return refuse(`Nepodprta vrsta slike: ${f.name}. Izberite fotografije znova.`);
    if (logo && !LOGO_TYPES.has(logo.type)) return refuse("Logotip mora biti SVG, PNG, JPEG, WebP ali AVIF.");

    const accountId = viewer.kind === "account" ? viewer.account.id : null;
    let siteId: string;
    let aiJobId: string;
    let classification: { businessType: string; confidence: number } | undefined;
    if (ticket) {
      siteId = ticket.s;
      aiJobId = ticket.j;
      classification = ticket.c;
    } else {
      siteId = newId("site");
      const grant = await reserveJob(limits, c, { kind: "generate", scope, siteId });
      if (!grant.ok) return refuse(grant.refusal.message, grant.refusal.status);
      aiJobId = grant.aiJobId;
      const checked = await classifyFor(description, { siteId, tier: grant.tier, accountId, aiJobId });
      if (checked.junk) return refuse(JUNK);
      classification = checked.classification;
    }

    const slug = await repo.uniqueSlug(slugify(description) || "stran");
    const site = await repo
      .createSite({
        id: siteId,
        name: slug,
        slug,
        intake: { description, photoAssetIds: [], scope },
        accountId,
        // An anonymous preview belongs to this device until someone signs in on it.
        deviceId: viewer.kind === "anonymous" ? c.get("deviceId") : null,
      })
      .catch(async (e: unknown) => {
        // Two intakes with the same slug at once: the loser gives its reserved job back.
        await repo.usage.finishJob(aiJobId, "failed");
        throw e;
      });
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
        JSON.stringify({ description, scope, photoAssetIds: photoRows.map((r) => r.id), ...(logoRow ? { logoAssetId: logoRow.id } : {}), ...(classification ? { classification } : {}) }),
      ]);
      await repo.setStatus(site.id, "generating");
      await queue.send("generate", { siteId: site.id, scope, aiJobId });
    } catch (e) {
      await repo.usage.finishJob(aiJobId, "failed");
      await repo.setStatus(site.id, "failed");
      return refuse((e as Error).message);
    }
    return c.redirect(`/sites/${site.id}`, 303);
  });

  app.get("/sites/:id", async (c) => {
    const site = await repo.getSite(c.req.param("id"));
    if (!site) return c.notFound();
    return c.html(sitePage({ site }));
  });

  app.get("/api/sites/:id", async (c) => {
    const id = c.req.param("id");
    const viewer = c.get("viewer");
    const admin = viewer.kind === "admin";
    // Read first: anything that changes while the rest is read makes the next pulse differ.
    const pulse = await repo.pulse(id);
    const [site, current] = await Promise.all([repo.getSite(id), repo.getSpec(id)]);
    if (!site || !pulse) return c.json({ error: "not found" }, 404);
    const after = Number(c.req.query("after") ?? 0);
    // Independent reads, side by side (this runs after every save, not only on polls).
    const [checklist, access, events, chat, cost, versions, messages, spendToday, domains] = await Promise.all([
      current ? siteChecklist(repo, id, current.spec) : Promise.resolve([]),
      accessInfo(limits, viewer, c.get("deviceId"), site, new Date(), current?.spec ?? null),
      repo.listEvents(id, after),
      repo.listChat(id),
      repo.siteCost(id),
      repo.listVersions(id),
      repo.formMessageCount(id),
      admin ? repo.spendToday() : Promise.resolve(null),
      domainsInfo(domainDeps, id, site.slug),
    ]);
    return c.json({
      // What this viewer may do here and has left; refusals from the action endpoints carry { code, message } too.
      access,
      site,
      pulse,
      version: current?.version ?? null,
      spec: current?.spec ?? null,
      events,
      chat,
      cost,
      versions,
      placeholders: current ? collectPlaceholders(current.spec) : [],
      // The pre-publish checklist (structured, the editor words it in Slovene) and the same as English lines.
      checklist,
      blockers: checklist.map(blockerText),
      messages,
      // The site's own domains and their progress, in Slovene (domains.ts).
      domains,
      // The platform's own spend: the admin's business, null for owners.
      spendToday,
      cap: admin ? config.limits.dailyModelSpendCapEur : null,
      // Server time, so the editor's running-stage seconds don't depend on the visitor's clock.
      now: new Date().toISOString(),
    });
  });

  // What the editor polls every 2 s while the site is busy; it loads the full state only when this changes.
  app.get("/api/sites/:id/pulse", async (c) => {
    const pulse = await repo.pulse(c.req.param("id"));
    if (!pulse) return c.json({ error: "not found" }, 404);
    c.header("cache-control", "no-store");
    return c.json(pulse);
  });

  app.get("/api/sites/:id/catalogue", async (c) => {
    const current = await repo.getSpec(c.req.param("id"));
    if (!current) return c.json({ error: "no spec yet" }, 404);
    return c.json(editorCatalogue(current.spec));
  });

  // ---------- Direct editor: deterministic, no model calls ----------
  /**
   * `typed: false` for an edit that only rearranges what the site already says (a collection taking over the
   * services sections): nothing of it counts as text the owner typed, so the fact check keeps checking it.
   */
  const directEdit = async (c: Context, siteId: string, baseVersion: unknown, build: (spec: SiteSpec) => Operation[] | { error: string }, message: string, typed = true) => {
    const current = await repo.getSpec(siteId);
    if (!current) return c.json({ error: "no spec yet" }, 404);
    if (typeof baseVersion === "number" && baseVersion !== current.version) {
      return c.json({ error: "conflict", message: "Stran je bila medtem spremenjena. Osvežite urejevalnik.", version: current.version }, 409);
    }
    const ops = build(current.spec);
    if ("error" in ops) return c.json({ error: ops.error }, 400);
    const r = applyDirectEdit(current.spec, ops);
    if (!r.ok) return c.json({ error: "invalid", issues: r.issues.slice(0, 20) }, 422);
    // The viewer's plan limits (pages, languages, collections), whatever the edit's path; the refusal names the plan that has more.
    const viewer = (c as Context<AppEnv>).get("viewer");
    const breach = limitBreach(config, tierOf(viewer), viewer.kind === "account" ? viewer.plan : null, current.spec, r.spec);
    if (breach) return c.json({ error: breach.code, code: breach.code, message: breach.message, upgrade: breach.upgrade }, 403);
    let version: number;
    try {
      // Only what the owner changed is stored: the fact check counts it as their own text, and "Ustvari znova"
      // keeps it (spec ownerEdits, it-keep-owner-edits).
      const own = typed ? typedOps(current.spec, ops) : [];
      const owned = markOwnerEdits(r.spec, own);
      const spec: SiteSpec = { ...r.spec };
      if (owned) spec.ownerEdits = owned;
      else delete spec.ownerEdits;
      version = await repo.saveSpec(siteId, spec, "manual", message.slice(0, 200), own, current.version);
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

  // Switches a collection on (Strani › Zbirke): a news or events page, or services and team kept as lists of their own.
  app.post("/api/sites/:id/collections", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { baseVersion?: number; kind?: string };
    const kind = CollectionKind.safeParse(body.kind);
    if (!kind.success) return c.json({ error: "kind required" }, 400);
    return directEdit(c, c.req.param("id"), body.baseVersion, (spec) => startCollection(spec, kind.data), `zbirka ${kind.data}`, false);
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

  // The owner's photos: add, or put one in place of an existing picture (e.g. a generated one).
  // Variants are made here; alt text comes from the worker's vision model (job "alt") or the owner.
  app.post("/api/sites/:id/photos", async (c) => {
    const id = c.req.param("id");
    const site = await repo.getSite(id);
    if (!site) return c.json({ error: "not found" }, 404);
    const body = await c.req.parseBody({ all: true });
    const files = ([] as unknown[]).concat(body["photos"] ?? []).filter((f): f is File => f instanceof File && f.size > 0);
    const replace = typeof body.replace === "string" && body.replace ? body.replace : undefined;
    const baseVersion = typeof body.baseVersion === "string" && /^\d+$/.test(body.baseVersion) ? Number(body.baseVersion) : undefined;
    try {
      const uploads = await Promise.all(files.map(async (f) => ({ data: new Uint8Array(await f.arrayBuffer()), mime: f.type, name: f.name })));
      const r = await addPhotos({ repo, storage, config }, id, uploads, { ...(replace ? { replace } : {}), ...(baseVersion !== undefined ? { baseVersion } : {}) });
      if (!r.added.length) return c.json({ ok: true, ...r });
      // The photos are saved (direct editing, never limited); describing them is a model job under the
      // owner's limits. Refused, the owner writes the descriptions and the editor says why.
      const grant = await reserveJob(limits, c, { kind: "alt", scope: "home", siteId: id, photos: r.added.length });
      if (!grant.ok) return c.json({ ok: true, ...r, altRefused: { code: grant.refusal.code, message: grant.refusal.message } });
      try {
        // The editor polls while the site is busy; the alt job sets it back to ready.
        if (site.status === "ready" || site.status === "failed") await repo.setStatus(id, "editing");
        await queue.send("alt", { siteId: id, imageIds: r.added, aiJobId: grant.aiJobId });
      } catch (e) {
        await repo.usage.finishJob(grant.aiJobId, "failed");
        await repo.setStatusIf(id, "editing", site.status);
        throw e;
      }
      return c.json({ ok: true, ...r });
    } catch (e) {
      if (e instanceof PhotoError) return c.json({ error: e.message }, 400);
      if (e instanceof VersionConflictError) return c.json({ error: "conflict", message: "Stran je bila medtem spremenjena. Osvežite urejevalnik." }, 409);
      throw e;
    }
  });

  app.post("/api/sites/:id/revert", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { version?: number };
    const target = typeof body.version === "number" ? await repo.getSpec(id, body.version) : null;
    // Retention may have removed it since the list was loaded; the editor shows this and reloads the list.
    if (!target) {
      const gone = typeof body.version === "number" ? { message: `Različice ${body.version} ni več med shranjenimi. Seznam različic je osvežen.` } : {};
      return c.json({ error: "version not found", ...gone }, 404);
    }
    // An old version is held to the viewer's plan like any edit: one with a blog or more pages, from before a
    // move to a smaller plan, isn't brought back (only what grows past the limit is refused).
    const current = await repo.getSpec(id);
    const viewer = (c as Context<AppEnv>).get("viewer");
    const breach = current ? limitBreach(config, tierOf(viewer), viewer.kind === "account" ? viewer.plan : null, current.spec, target.spec) : null;
    if (breach) return c.json({ error: breach.code, code: breach.code, message: breach.message, upgrade: breach.upgrade }, 403);
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
    const grant = await reserveJob(limits, c, { kind: "edit", scope: "home", siteId: id });
    if (!grant.ok) return refusalJson(c, grant.refusal);
    try {
      const msg = await repo.addChat(id, "user", message);
      await queue.send("edit", { siteId: id, messageId: Number(msg.id), aiJobId: grant.aiJobId });
    } catch (e) {
      await repo.usage.finishJob(grant.aiJobId, "failed");
      throw e;
    }
    return c.json({ ok: true });
  });

  app.post("/api/sites/:id/generate", async (c) => {
    const id = c.req.param("id");
    const site = await repo.getSite(id);
    if (!site) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { scope?: string };
    const scope = body.scope === "full" ? "full" : "home";
    const denied = scope === "full" ? fullSiteRefusal(c.get("viewer"), config) : null;
    if (denied) return refusalJson(c, denied);
    // Claimed in one statement: two clicks at once must not start two paid generations.
    const idle: SiteStatus[] = ["new", "ready", "editing", "publishing", "failed"];
    if (!(await repo.setStatusIf(id, idle, "generating"))) return refusalJson(c, { status: 409, code: "busy", message: "Stran se že ustvarja." });
    const grant = await reserveJob(limits, c, { kind: "generate", scope, siteId: id });
    if (!grant.ok) {
      await repo.setStatusIf(id, "generating", site.status);
      return refusalJson(c, grant.refusal);
    }
    try {
      await db.query("update sites set intake = jsonb_set(intake, '{scope}', to_jsonb($2::text)) where id = $1", [id, scope]);
      await queue.send("generate", { siteId: id, scope, aiJobId: grant.aiJobId });
    } catch (e) {
      await repo.usage.finishJob(grant.aiJobId, "failed");
      await repo.setStatusIf(id, "generating", site.status);
      throw e;
    }
    // A paid plan whose generated pictures for this month run short: the generation goes ahead with fewer (the worker
    // holds the count), and the owner reads why and which plan has more (it-plan-limits).
    const viewer = c.get("viewer");
    const pictures = await picturesFor(limits, viewer);
    const notice = pictures && viewer.kind === "account" && picturesShort(config, site, scope, pictures.left) ? picturesNotice(config, viewer.plan ?? "standard", pictures.left, formatDate(pictures.renewsAt)) : null;
    return c.json({ ok: true, ...(notice ? { notice } : {}) });
  });

  // The live release pointer per slug, kept a few seconds: every page, picture and 404 of a published site
  // asks for it. A publish here forgets it at once; another web process sees it within LIVE_BASE_TTL_MS.
  const LIVE_BASE_TTL_MS = 5_000;
  const bases = new Map<string, { until: number; base: Promise<string> }>();
  const liveBase = (slug: string): Promise<string> => {
    const now = Date.now();
    const hit = bases.get(slug);
    if (hit && hit.until > now) return hit.base;
    const base = publishedBase(storage, slug);
    if (bases.size > 10_000) bases.clear();
    bases.set(slug, { until: now + LIVE_BASE_TTL_MS, base });
    base.catch(() => bases.delete(slug));
    return base;
  };

  app.post("/api/sites/:id/publish", async (c) => {
    const denied = publishRefusal(c.get("viewer"), config);
    if (denied) return refusalJson(c, denied);
    try {
      const r = await publishSite({ repo, storage, config, platformDomain: opts.platformDomain ?? null }, c.req.param("id"));
      const site = await repo.getSite(c.req.param("id"));
      if (site) bases.delete(site.slug);
      return c.json({ ok: true, version: r.version, url: `/s/${site?.slug}/` });
    } catch (e) {
      if (e instanceof PublishBlockedError) return c.json({ error: "blocked", blockers: e.blockers, checklist: e.checklist }, 422);
      if (e instanceof PublishBusyError) return c.json({ error: "busy", message: "Stran se že objavlja. Počakajte trenutek in poskusite znova." }, 409);
      throw e;
    }
  });

  // Export runs the publish checklist as a warning (`sb-export-checklist` = warn): with something on it the
  // zip comes only after the owner confirmed ("Izvozi vseeno", ?anyway=1). The checked version is the one exported.
  app.get("/api/sites/:id/export", async (c) => {
    const denied = publishRefusal(c.get("viewer"), config);
    if (denied) return refusalJson(c, denied);
    const id = c.req.param("id");
    const current = await repo.getSpec(id);
    if (!current) return c.json({ error: "no spec yet" }, 404);
    if (c.req.query("anyway") !== "1") {
      const checklist = await siteChecklist(repo, id, current.spec);
      if (checklist.length) {
        // A browser following the link (not the editor's check) gets the editor with the warning open.
        if (/text\/html/.test(c.req.header("accept") ?? "")) return c.redirect(`/sites/${id}?export=1`, 303);
        return c.json({ error: "checklist", message: EXPORT_CHECKLIST_MESSAGE, checklist, blockers: checklist.map(blockerText) }, 409);
      }
    }
    const { filename, zip } = await exportSite({ repo, storage, config, platformDomain: opts.platformDomain ?? null }, id, current.version);
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
  // Rendered preview pages by site, version, page and layout variant. A saved version never changes, so a
  // page rendered once is served again without loading the spec or rendering (the editor reloads the
  // preview after every save, and each layout thumbnail is a page of its own). In memory, newest kept.
  const PREVIEW_CACHE = 200;
  const previews = new Map<string, string>();
  const remember = (key: string, html: string) => {
    previews.delete(key);
    previews.set(key, html);
    if (previews.size > PREVIEW_CACHE) previews.delete(previews.keys().next().value!);
    return html;
  };

  app.get("/preview/:id/:file", async (c) => {
    const id = c.req.param("id");
    const v = c.req.query("v");
    if (!SAFE_ID.test(id)) return c.notFound();
    // ?v=N of a version retention removed shows the nearest older kept one (as undo does).
    const asked = v && /^\d+$/.test(v) ? await repo.nearestVersion(id, Number(v)) : undefined;
    const sectionId = c.req.query("section");
    const variant = c.req.query("variant");
    c.header("cache-control", "no-store");
    // The version this request shows: asked for, or the site's current one (siteAccess loaded the row).
    const version = asked ?? c.get("site")?.current_version ?? null;
    const key = version === null ? null : [id, version, c.req.param("file"), sectionId ?? "", variant ?? ""].join("|");
    const hit = key === null ? undefined : previews.get(key);
    if (hit !== undefined) return c.html(remember(key!, hit));
    const current = asked === null ? null : await repo.getSpec(id, version ?? undefined);
    if (!current) {
      const gone = asked === null && (await repo.getSite(id))?.current_version != null;
      return c.text(gone ? "Te različice ni več med shranjenimi." : "Predogled še ni pripravljen.", 404);
    }
    const page = current.spec.pages.find((p) => pageFile(p) === c.req.param("file"));
    if (!page) return previewNotFound(c, current.spec, 0);
    // The address the published pages carry (canonical, og:url), so the preview's head is the published one.
    const slug = c.get("site")?.slug ?? (await repo.getSite(id))?.slug;
    const siteUrl = slug ? await siteAddress(repo, id, slug, opts.platformDomain) : null;
    const cacheKey = [id, current.version, c.req.param("file"), sectionId ?? "", variant ?? ""].join("|");
    // ?section=…&variant=…: that section alone in another variant, for the editor's layout thumbnails.
    // Same renderer and the same page URL depth, so media and shared assets resolve as in the preview.
    if (sectionId !== undefined || variant !== undefined) {
      const section = page.sections.find((s) => s.id === sectionId);
      if (!section || !variant || !(sectionDef(section.type).variants as readonly string[]).includes(variant)) return c.notFound();
      const alone = { ...page, sections: [{ ...section, variant } as typeof section] };
      const spec = { ...current.spec, pages: current.spec.pages.map((p) => (p.id === page.id ? alone : p)) };
      return c.html(remember(cacheKey, renderPage(spec, alone, { imageWidths: config.images.widths, siteUrl })));
    }
    return c.html(remember(cacheKey, renderPage(current.spec, page, { imageWidths: config.images.widths, siteUrl })));
  });
  // Deeper paths are a collection entry's page (novice/odprtje.html) or else the 404 page, rendered for that depth.
  app.get("/preview/:id/*", async (c) => {
    const id = c.req.param("id");
    if (!SAFE_ID.test(id)) return c.notFound();
    const current = await repo.getSpec(id);
    if (!current) return c.notFound();
    const rest = c.req.path.slice(`/preview/${id}/`.length);
    const slug = c.get("site")?.slug ?? (await repo.getSite(id))?.slug;
    const siteUrl = slug ? await siteAddress(repo, id, slug, opts.platformDomain) : null;
    const entry = renderPath(current.spec, rest, { imageWidths: config.images.widths, siteUrl });
    if (entry !== null) {
      c.header("cache-control", "no-store");
      return c.html(entry);
    }
    return previewNotFound(c, current.spec, notFoundPlacement(rest).depth);
  });

  /** A missing page in the preview: the site's own 404 page with status 404, as the published site answers. */
  function previewNotFound(c: Context, spec: SiteSpec, depth: number) {
    const page = spec.pages.find((p) => p.kind === "not-found");
    if (!page) return c.notFound();
    c.header("cache-control", "no-store");
    return c.html(renderPage(spec, page, { imageWidths: config.images.widths, depth }), 404);
  }

  // ---------- Published sites (public) ----------
  app.get("/s/_shared/:hash/*", (c) => serveShared(c, c.req.param("hash"), c.req.path.split(`/_shared/${c.req.param("hash")}/`)[1] ?? ""));
  app.get("/s/:slug", (c) => (SAFE_SLUG.test(c.req.param("slug")) ? c.redirect(`/s/${c.req.param("slug")}/`, 301) : c.notFound()));
  app.get("/s/:slug/*", async (c) => {
    const slug = c.req.param("slug");
    if (!SAFE_SLUG.test(slug)) return c.notFound();
    let rest = c.req.path.slice(`/s/${slug}/`.length);
    if (rest === "" || rest.endsWith("/")) rest += "index.html";
    if (!SAFE_REST.test(rest)) return c.notFound();
    // The live release (published.ts): a publish in progress never shows half a site.
    const base = await liveBase(slug);
    const data = await storage.get(`${base}${rest}`);
    if (data) {
      // A page view (not its images or scripts), counted after the answer and never in its way.
      if (rest.endsWith(".html")) {
        void stats.visit(c, slug, rest).catch((e: unknown) => console.error("[stats] visit", (e as Error).message));
      }
      c.header("content-type", contentType(rest));
      // Photos never change under a name (ids aren't reused): cached for good. The logo keeps its name when
      // the owner replaces it, so it is cached briefly like the pages.
      c.header("cache-control", rest.startsWith("media/logo.") ? "public, max-age=300" : rest.startsWith("media/") ? "public, max-age=31536000, immutable" : "public, max-age=60");
      return c.body(data as Uint8Array<ArrayBuffer>);
    }
    // The 404 page of the locale directory asked for (en/…), else the site's; its relative paths are
    // rebased to the depth of the miss so it is styled and its links work (/s/x/storitve/missing).
    const first = rest.split("/")[0]!;
    const localeDir = rest.includes("/") && /^[a-z]{2}$/.test(first) ? `${first}/` : null;
    let place = notFoundPlacement(rest, localeDir ? [localeDir] : []);
    let notFound = await storage.get(`${base}${place.dir}404.html`);
    if (!notFound && place.dir) {
      place = notFoundPlacement(rest);
      notFound = await storage.get(`${base}404.html`);
    }
    if (notFound) {
      const html = place.depth ? rebaseRelativeUrls(new TextDecoder().decode(notFound), "../".repeat(place.depth)) : notFound;
      return c.body(html as string | Uint8Array<ArrayBuffer>, 404, { "content-type": "text/html; charset=utf-8" });
    }
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

  app.onError(async (e, c) => {
    // An anonymous upload that failed after taking its ticket gives the reserved job back.
    const ticket = c.get("ticket");
    if (ticket) await repo.usage.finishJob(ticket.j, "failed").catch(() => undefined);
    // Hono's own refusals (a body over a limit: 413) keep their status.
    if (e instanceof HTTPException) return e.getResponse();
    console.error("[web]", e);
    // Constraint names and storage errors stay in the log; the editor shows this sentence.
    return c.json({ error: "internal error", message: "Prišlo je do napake na strežniku. Poskusite znova." }, 500);
  });

  return app;
}

