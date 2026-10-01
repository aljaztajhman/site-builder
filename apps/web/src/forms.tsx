import { createHmac } from "node:crypto";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { renderToStaticMarkup } from "react-dom/server";
import type { AppConfig } from "@sb/config";
import { uiStrings } from "@sb/components";
import type { Repo, SiteRow } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { Doc, TopBar, html } from "./pages.tsx";
import { csrfOk, type AppEnv } from "./access.ts";
import { formatDateTime } from "./ui/labels.ts";

/**
 * Contact forms on published sites: the public submit endpoint (next to the published pages, so the
 * rendered form can post to the relative `_submit`) and the owner's message list in the dashboard.
 * Email notification to the owner is not wired yet (needs a sending domain).
 */

const SAFE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// No characters that would add fields to the owner's mailto: link (?, &) or break out of an attribute.
const EMAIL = /^[^\s@?&<>"',;:]+@[^\s@?&<>"',;:]+\.[^\s@?&<>"',;:]{2,}$/;
const PHONE = /^[+\d\s()/.-]{0,40}$/;
// Control characters other than tab and newlines never belong in a message.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export interface FormInput {
  section: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  /** Honeypot: filled only by bots. */
  website: string;
}

/** Validates and normalises a submission. Returns the fields that failed, or the clean message. */
export function parseSubmission(body: Record<string, unknown>): { ok: true; value: FormInput } | { ok: false; fields: string[] } {
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const v: FormInput = {
    section: str("section"),
    name: str("name"),
    email: str("email"),
    phone: str("phone") || null,
    message: str("message").replace(/\r\n/g, "\n"),
    website: str("website"),
  };
  const bad: string[] = [];
  if (!/^s_[a-z0-9_-]+$/.test(v.section)) bad.push("section");
  if (!v.name || v.name.length > 100 || CONTROL.test(v.name) || /\n/.test(v.name)) bad.push("name");
  if (!EMAIL.test(v.email) || v.email.length > 120) bad.push("email");
  if (v.phone !== null && !PHONE.test(v.phone)) bad.push("phone");
  if (!v.message || v.message.length > 2000 || CONTROL.test(v.message)) bad.push("message");
  return bad.length ? { ok: false, fields: bad } : { ok: true, value: v };
}

/** The published spec's contact-form sections, keyed by id, with whether they ask for a phone. */
export function formSections(spec: SiteSpec): Map<string, { askPhone: boolean }> {
  const out = new Map<string, { askPhone: boolean }>();
  for (const page of spec.pages) for (const s of page.sections) if (s.type === "contact-form") out.set(s.id, { askPhone: s.props.askPhone });
  return out;
}

const resultPage = (lang: string, text: string, back: string) =>
  `<!doctype html>${renderToStaticMarkup(
    (
      <html lang={lang}>
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="robots" content="noindex" />
          <title>{text}</title>
          <style
            dangerouslySetInnerHTML={{
              __html: "body{font:18px/1.5 system-ui,sans-serif;max-width:36rem;margin:0 auto;padding:3rem 1rem;color:#16181d}a{display:inline-block;margin-top:1rem;padding:.75rem 0;font-weight:600}",
            }}
          />
        </head>
        <body>
          <main>
            <h1>{text}</h1>
            <a href="./">{back}</a>
          </main>
        </body>
      </html>
    ) as never,
  )}`;

export function registerFormRoutes(app: Hono<AppEnv>, deps: { repo: Repo; config: AppConfig; secret: string; now?: () => Date }): void {
  const { repo, config } = deps;
  const senderKey = (ip: string) => createHmac("sha256", deps.secret).update(`form:${ip}`).digest("hex").slice(0, 32);

  app.use("/s/:slug/_submit", bodyLimit({ maxSize: 16 * 1024 }));
  app.post("/s/:slug/_submit", async (c) => {
    const slug = c.req.param("slug");
    const wantsJson = (c.req.header("accept") ?? "").includes("application/json");
    const site = SAFE_SLUG.test(slug) ? await repo.getSiteBySlug(slug) : null;
    const published = site?.published_version ? await repo.getSpec(site.id, site.published_version) : null;
    if (!site || !published) return wantsJson ? c.json({ error: "not_found" }, 404) : c.notFound();

    const lang = published.spec.locales.default;
    const t = uiStrings(lang);
    const reply = (status: 200 | 400 | 404 | 429, key: "formSent" | "formError" | "formTooMany", code?: string) =>
      wantsJson
        ? c.json(status === 200 ? { ok: true } : { error: code ?? "invalid" }, status)
        : c.html(resultPage(lang, t(key), t("formBack")), status);

    const body = (await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseSubmission(body);
    const sections = formSections(published.spec);
    if (!parsed.ok) return reply(400, "formError", "invalid");
    const section = sections.get(parsed.value.section);
    if (!section) return reply(404, "formError", "not_found");
    // Bots fill every field; answer as if it worked so they don't learn anything.
    if (parsed.value.website) return reply(200, "formSent");

    // The rightmost X-Forwarded-For entry is the one our proxy added; the left ones are client-controlled.
    const ip = c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "local";
    const key = senderKey(ip);
    const limits = config.limits;
    if (
      (await repo.countFormMessages(site.id, 10, key)) >= limits.formMessagesPerSenderPer10Min ||
      (await repo.countFormMessages(site.id, 24 * 60)) >= limits.formMessagesPerSitePerDay
    ) {
      return reply(429, "formTooMany", "rate_limited");
    }
    await repo.addFormMessage({
      siteId: site.id,
      sectionId: parsed.value.section,
      name: parsed.value.name,
      email: parsed.value.email,
      phone: section.askPhone ? parsed.value.phone : null,
      message: parsed.value.message,
      senderKey: key,
    });
    return reply(200, "formSent");
  });

  // ---------- Dashboard: the owner's messages ----------
  app.get("/sites/:id/messages", async (c) => {
    const site = await repo.getSite(c.req.param("id"));
    if (!site) return c.notFound();
    return c.html(messagesPage({ site, messages: await repo.listFormMessages(site.id), csrf: c.get("csrf"), admin: c.get("viewer").kind === "admin" }));
  });
  app.post("/sites/:id/messages/:mid/delete", async (c) => {
    const site = await repo.getSite(c.req.param("id"));
    if (!site) return c.notFound();
    if (!csrfOk(c, (await c.req.parseBody()) as Record<string, unknown>)) return c.text("Obrazec je potekel. Osvežite stran in poskusite znova.", 403);
    await repo.deleteFormMessage(site.id, c.req.param("mid"));
    return c.redirect(`/sites/${site.id}/messages`, 303);
  });
}

function messagesPage({ site, messages, csrf, admin }: { site: SiteRow; messages: Awaited<ReturnType<Repo["listFormMessages"]>>; csrf: string; admin: boolean }): string {
  return html(
    <Doc title={`Sporočila · ${site.name}`}>
      <TopBar csrf={csrf} admin={admin}>
        <a className="btn quiet sm" href={`/sites/${site.id}`}>
          {`← ${site.name}`}
        </a>
      </TopBar>
      <main className="messages">
        <h1>
          Sporočila <span className="muted num">{messages.length}</span>
        </h1>
        <p className="muted">
          {messages.length === 0
            ? "Še ni sporočil. Prikažejo se tukaj, ko obiskovalec objavljene strani izpolni kontaktni obrazec."
            : "Iz kontaktnega obrazca na objavljeni strani. Obiskovalcu odgovorite po e-pošti ali telefonu."}
        </p>
        {messages.map((m) => (
          <article className="message" key={m.id}>
            <p className="when num">{formatDateTime(m.created_at)}</p>
            <dl>
              <dt>Ime</dt>
              <dd>{m.name}</dd>
              <dt>E-pošta</dt>
              <dd>
                <a href={`mailto:${m.email}`}>{m.email}</a>
              </dd>
              {m.phone && (
                <>
                  <dt>Telefon</dt>
                  <dd>
                    <a href={`tel:${m.phone.replace(/[^\d+]/g, "")}`}>{m.phone}</a>
                  </dd>
                </>
              )}
            </dl>
            <p className="text">{m.message}</p>
            <form method="post" action={`/sites/${site.id}/messages/${m.id}/delete`}>
              <input type="hidden" name="_csrf" value={csrf} />
              <button className="btn sm danger" type="submit">
                Izbriši
              </button>
            </form>
          </article>
        ))}
      </main>
    </Doc>,
  );
}
