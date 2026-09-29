import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { SiteRow } from "@sb/platform";

const CSS = `
:root{--bg:#f6f7f9;--panel:#fff;--text:#16181d;--muted:#5b6270;--line:#d9dde3;--accent:#1f5eff;--danger:#b42318;--ok:#067647;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--text);background:var(--bg)}
*{box-sizing:border-box}body{margin:0}a{color:var(--accent)}
.top{display:flex;gap:12px;align-items:center;padding:10px 16px;background:var(--panel);border-bottom:1px solid var(--line);flex-wrap:wrap}
.top h1{font-size:16px;margin:0 12px 0 0}.top .sp{flex:1}
.btn{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:6px 12px;border:1px solid var(--line);background:#fff;border-radius:6px;cursor:pointer;font:inherit;color:inherit;text-decoration:none}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}.btn.danger{color:var(--danger)}.btn:disabled{opacity:.5;cursor:default}
.btn.sm{min-height:28px;padding:2px 8px;font-size:13px}
.wrap{max-width:1100px;margin:24px auto;padding:0 16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:16px;margin-bottom:16px}
label{display:block;font-weight:600;margin:10px 0 4px}input[type=text],input[type=password],input[type=number],input[type=url],input[type=email],textarea,select{width:100%;padding:7px 9px;border:1px solid var(--line);border-radius:6px;font:inherit;background:#fff}
textarea{min-height:70px;resize:vertical}.muted{color:var(--muted)}.err{color:var(--danger)}.okc{color:var(--ok)}
table{border-collapse:collapse;width:100%}td,th{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;font-size:14px}
.status{display:inline-block;padding:2px 8px;border-radius:99px;background:#eef1f5;font-size:12px}
`;

function Doc({ title, children, script }: { title: string; children: ReactNode; script?: string }) {
  return (
    <html lang="sl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>{title}</title>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>
        {children}
        {script && <script type="module" src={script} />}
      </body>
    </html>
  );
}

const html = (el: ReactNode) => `<!doctype html>${renderToStaticMarkup(el as never)}`;

export function loginPage({ next, error }: { next: string; error?: string }): string {
  return html(
    <Doc title="Prijava">
      <div className="wrap" style={{ maxWidth: 420 }}>
        <div className="card">
          <h1 style={{ fontSize: 20 }}>Prijava</h1>
          <form method="post" action="/login">
            <input type="hidden" name="next" value={next} />
            <label htmlFor="pw">Geslo za dostop</label>
            <input id="pw" type="password" name="password" autoComplete="current-password" required autoFocus />
            {error && <p className="err">{error}</p>}
            <p>
              <button className="btn primary" type="submit">
                Prijava
              </button>
            </p>
          </form>
        </div>
      </div>
    </Doc>,
  );
}

export function sitesPage({ sites, spendToday, cap, maxPhotos }: { sites: SiteRow[]; spendToday: number; cap: number; maxPhotos: number }): string {
  return html(
    <Doc title="Strani">
      <div className="top">
        <h1>Graditelj strani</h1>
        <span className="muted">
          Poraba danes: €{spendToday.toFixed(2)} / €{cap.toFixed(2)}
        </span>
        <span className="sp" />
        <form method="post" action="/logout">
          <button className="btn sm" type="submit">
            Odjava
          </button>
        </form>
      </div>
      <div className="wrap">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Nova stran</h2>
          <form method="post" action="/api/sites" encType="multipart/form-data">
            <label htmlFor="d">Opis podjetja</label>
            <textarea id="d" name="description" rows={8} required minLength={30} placeholder="Kdo ste, kaj ponujate, kje ste, kontakt, delovni čas, cene …" />
            <label htmlFor="logo">Logotip (neobvezno)</label>
            <input id="logo" type="file" name="logo" accept="image/svg+xml,image/png,image/jpeg,image/webp" />
            <label htmlFor="photos">Fotografije (do {maxPhotos})</label>
            <input id="photos" type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/avif" multiple />
            <label htmlFor="scope">Obseg</label>
            <select id="scope" name="scope" defaultValue="home">
              <option value="home">Samo domača stran (hitri predogled)</option>
              <option value="full">Celotna stran</option>
            </select>
            <p>
              <button className="btn primary" type="submit">
                Ustvari
              </button>
            </p>
          </form>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Strani</h2>
          {sites.length === 0 ? (
            <p className="muted">Še ni strani.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Ime</th>
                  <th>Stanje</th>
                  <th>Objavljeno</th>
                  <th>Ustvarjeno</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <a href={`/sites/${s.id}`}>{s.name}</a>
                    </td>
                    <td>
                      <span className="status">{s.status}</span>
                    </td>
                    <td>{s.published_version ? <a href={`/s/${s.slug}/`}>/s/{s.slug}/</a> : "—"}</td>
                    <td className="muted">{new Date(s.created_at).toLocaleString("sl-SI")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Doc>,
  );
}

export function sitePage({ site }: { site: SiteRow }): string {
  return html(
    <Doc title={site.name} script="/assets/editor.js">
      <div id="app" data-site-id={site.id}>
        <p className="wrap muted">Nalagam urejevalnik …</p>
      </div>
    </Doc>,
  );
}
