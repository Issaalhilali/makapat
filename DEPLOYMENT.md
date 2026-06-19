# Deploying "Nabih" (نبيه) to Production

This guide covers shipping the assistant to the live **muk3bat.com** store. There
are two independently-deployable pieces:

| Piece | What it is | Where it runs |
|-------|------------|---------------|
| **Frontend widget** | `public/nabih-assistant.js` + `public/nabih-assistant.css` | A public CDN / static host |
| **Backend API** | The Express app (`server.js` + `src/`) exposing `POST /api/nabih-chat` | A Node host (Render, Railway, Fly.io, a VPS, etc.) |

The reverse proxy in `src/proxy.js` is a **development-only** simulation tool and
is **not** part of production. In production the widget is injected directly into
the WordPress theme and talks to your backend over CORS.

---

## a) Host the JS/CSS on a CDN / object storage

The two files in `public/` are static and cacheable. Host them anywhere
public-read:

**Option 1 — Object storage + CDN (recommended)**

```bash
# Example: AWS S3 + CloudFront
aws s3 cp public/nabih-assistant.js  s3://YOUR_BUCKET/nabih/nabih-assistant.js  \
  --content-type "application/javascript" --cache-control "public, max-age=3600"
aws s3 cp public/nabih-assistant.css s3://YOUR_BUCKET/nabih/nabih-assistant.css \
  --content-type "text/css"            --cache-control "public, max-age=3600"
```

Then serve them through your CDN, e.g.
`https://cdn.muk3bat.com/nabih/nabih-assistant.js`.

> The widget derives the **CSS URL from its own `<script src>`** automatically,
> so as long as both files sit in the **same folder** on the CDN, you only need
> to reference the JS file in the page — the CSS loads itself. (You can still add
> an explicit `<link>` to avoid any first-paint flash; see below.)

Other equivalents: Cloudflare R2 + Cloudflare CDN, Google Cloud Storage + Cloud
CDN, Bunny.net, jsDelivr (if you publish the repo), or Netlify/Vercel static hosting.

**Versioning / cache-busting:** when you update the widget, either upload to a
versioned path (`/nabih/v2/nabih-assistant.js`) or append a query string in the
snippet (`...nabih-assistant.js?v=2`). CDNs cache aggressively.

---

## b) The snippet to paste into WordPress

In WP admin install a footer-injection plugin such as **"Insert Headers and
Footers"** (or WPCode), and paste this into the **Footer / Scripts in Footer**
box. Replace the two URLs with your CDN host and your backend host:

```html
<!-- Nabih AI Assistant -->
<link rel="stylesheet" href="https://cdn.muk3bat.com/nabih/nabih-assistant.css">
<script>
  window.NABIH_CONFIG = { apiBaseUrl: "https://api.muk3bat.com" };
</script>
<script src="https://cdn.muk3bat.com/nabih/nabih-assistant.js" defer></script>
```

`apiBaseUrl` is the origin of your **backend** (no trailing path) — the widget
appends `/api/nabih-chat` itself.

**One-line alternative** (no inline config block; the `<link>` is optional since
the CSS auto-loads from the script's folder):

```html
<script src="https://cdn.muk3bat.com/nabih/nabih-assistant.js"
        data-nabih-api="https://api.muk3bat.com" defer></script>
```

Both forms are equivalent. Use the first if you want the explicit stylesheet
preload; use the second for minimalism. Either way the widget mounts itself into
an isolated `#nabih-root` node and will not affect the Salla/Elementor theme.

---

## c) Configure the backend's environment variables

On the Node host, set these (never commit real values — see `.env.example`):

| Variable | Required | Purpose |
|----------|:--------:|---------|
| `ANTHROPIC_API_KEY` | ✅ (for real AI) | Claude API key from <https://console.anthropic.com>. If unset, the backend serves the built-in mock engine. |
| `ANTHROPIC_MODEL` | — | Defaults to `claude-opus-4-8`. |
| `ALLOWED_ORIGINS` | ✅ | Comma-separated origins permitted to call the API. Must include the store: `https://muk3bat.com,https://www.muk3bat.com`. |
| `NODE_ENV` | ✅ | Set to `production`. Disables the dev proxy automatically. |
| `PORT` | — | Port to listen on (many hosts inject this). |
| `DATABASE_URL` | — | Wire up if/when you add chat logging or analytics. |

**Example (shell / host dashboard):**

```bash
NODE_ENV=production
PORT=8080
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx
ANTHROPIC_MODEL=claude-opus-4-8
ALLOWED_ORIGINS=https://muk3bat.com,https://www.muk3bat.com
```

**Run it:**

```bash
npm ci --omit=dev
npm run crawl       # build src/data/store-knowledge.json from the live site
npm run aggregate   # build src/data/featured-content.json (welcome feed)
npm start
```

> **Keep the knowledge base fresh.** `src/data/store-knowledge.json` is what
> gives Nabih full catalog awareness. Rebuild it on deploy (as above) and on a
> schedule (e.g. a daily cron running `npm run crawl`) so new courses, articles,
> and policies are picked up. The file can be committed for reproducible deploys
> or generated at boot.

Put the backend behind HTTPS (a reverse proxy like Nginx/Caddy, or the host's
built-in TLS) at the domain you used for `apiBaseUrl` (e.g. `api.muk3bat.com`).

**Verify after deploy:**

```bash
curl https://api.muk3bat.com/api/health
# {"status":"ok","aiEnabled":true,"model":"claude-opus-4-8"}

curl -X POST https://api.muk3bat.com/api/nabih-chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"كم مدة الشحن؟"}'
```

If `aiEnabled` is `false`, the `ANTHROPIC_API_KEY` isn't being read — check the
host's env configuration.

---

## Production checklist

- [ ] `nabih-assistant.js` + `.css` uploaded to the CDN (same folder), correct content-types
- [ ] Backend deployed over HTTPS at `apiBaseUrl`
- [ ] `ALLOWED_ORIGINS` includes the exact store origin(s) — otherwise the browser blocks the call (CORS)
- [ ] `ANTHROPIC_API_KEY` set; `/api/health` reports `aiEnabled: true`
- [ ] Footer snippet pasted in WordPress with the real CDN + API URLs
- [ ] Hard-refresh the store and confirm the FAB appears and a message round-trips
