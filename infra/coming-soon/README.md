# postavi.si coming-soon page

Static page shown on postavi.si until the product launches there. Served by Caddy in the Railway service `coming-soon` (project site-builder). Its settings live on the service, not in a file: root directory `/infra/coming-soon`, builds the Dockerfile, healthcheck `/`, watch pattern `/infra/coming-soon/**`, deploys on push to main.

- `site/` is served as is. Fonts are copies of `packages/render/assets/fonts` (SIL OFL, see `packages/render/assets/fonts/LICENSES`).
- `www.postavi.si` redirects to `postavi.si`. DNS is at Namecheap.
- Check locally: `docker build -t postavi-soon infra/coming-soon && docker run -p 8080:8080 postavi-soon`, or open `site/index.html` directly.

When the app moves to postavi.si (M5), point the domain at the web service and delete this service.
