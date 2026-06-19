/**
 * Development reverse proxy.
 * --------------------------
 * Mirrors the live store onto localhost and injects the Nabih widget into the
 * HTML so you can develop against the real Salla/WordPress theme. This is a
 * DEV-ONLY simulation tool — in production the widget loads from a CDN and the
 * store runs on its own infrastructure (see DEPLOYMENT.md). Nothing in here is
 * imported by the production assistant path.
 */
const zlib = require('zlib');
const { createProxyMiddleware } = require('http-proxy-middleware');

const INJECT_TAG = '<script src="/nabih-assistant.js" defer></script>';

function createProxy(config) {
  const TARGET = config.proxyTarget;
  const TARGET_HOST = new URL(TARGET).host;

  return createProxyMiddleware({
    target: TARGET,
    changeOrigin: true,
    secure: true,
    followRedirects: false,
    ws: true,
    selfHandleResponse: true,

    onProxyReq(proxyReq) {
      // Uncompressed body so we can string-rewrite the HTML reliably.
      proxyReq.setHeader('accept-encoding', 'identity');
      proxyReq.setHeader('referer', TARGET + '/');
      proxyReq.setHeader('origin', TARGET);
    },

    onProxyRes(proxyRes, req, res) {
      const contentType = String(proxyRes.headers['content-type'] || '');
      const isHtml = contentType.includes('text/html');
      const headers = { ...proxyRes.headers };

      // Strip headers that would block our injected script or framing.
      delete headers['content-security-policy'];
      delete headers['content-security-policy-report-only'];
      delete headers['x-frame-options'];
      delete headers['strict-transport-security'];
      delete headers['x-content-type-options'];

      // We changed the body and forced identity encoding.
      delete headers['content-length'];
      delete headers['content-encoding'];
      delete headers['transfer-encoding'];

      // Make cookies usable over http://localhost.
      if (headers['set-cookie']) {
        headers['set-cookie'] = [].concat(headers['set-cookie']).map((c) =>
          c
            .replace(/;\s*Domain=[^;]+/gi, '')
            .replace(/;\s*Secure/gi, '')
            .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
        );
      }

      if (headers['location']) {
        headers['location'] = rewriteUrl(headers['location'], req, TARGET_HOST, config.port);
      }

      // Non-HTML — stream straight through.
      if (!isHtml) {
        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res);
        return;
      }

      // HTML — buffer, rewrite, inject, send.
      const chunks = [];
      proxyRes.on('data', (c) => chunks.push(c));
      proxyRes.on('end', () => {
        let body = decodeBody(Buffer.concat(chunks), proxyRes.headers).toString('utf8');
        body = rewriteHtml(body, req, TARGET_HOST);
        const out = Buffer.from(body, 'utf8');
        headers['content-length'] = Buffer.byteLength(out);
        res.writeHead(proxyRes.statusCode, headers);
        res.end(out);
      });
      proxyRes.on('error', () => res.end());
    },

    onError(err, req, res) {
      console.error('[proxy error]', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('Proxy error: could not reach ' + TARGET);
    },
  });
}

/* ----------------------------- helpers ---------------------------------- */

function decodeBody(buf, headers) {
  const enc = String(headers['content-encoding'] || '').toLowerCase();
  try {
    if (enc === 'gzip') return zlib.gunzipSync(buf);
    if (enc === 'deflate') return zlib.inflateSync(buf);
    if (enc === 'br') return zlib.brotliDecompressSync(buf);
  } catch (e) {
    console.warn('[proxy] decode failed (%s), using raw body', enc);
  }
  return buf;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rewriteUrl(url, req, targetHost, port) {
  const localHost = req.headers.host || `localhost:${port}`;
  return String(url).replace(
    new RegExp(`https?://(www\\.)?${escapeRe(targetHost)}`, 'gi'),
    `http://${localHost}`
  );
}

function rewriteHtml(html, req, targetHost) {
  const localHost = req.headers.host || 'localhost';
  const host = escapeRe(targetHost);

  html = html
    // Absolute URLs (href/src/action).
    .replace(new RegExp(`https?://www\\.${host}`, 'gi'), `http://${localHost}`)
    .replace(new RegExp(`https?://${host}`, 'gi'), `http://${localHost}`)
    // Protocol-relative URLs.
    .replace(new RegExp(`//www\\.${host}`, 'gi'), `//${localHost}`)
    .replace(new RegExp(`//${host}`, 'gi'), `//${localHost}`)
    // JSON-encoded URLs with escaped slashes (Salla/WP inline config blobs).
    .replace(new RegExp(`https?:\\\\/\\\\/(www\\.)?${host}`, 'gi'), `http:\\/\\/${localHost}`);

  // Inject the Nabih widget right before </body>.
  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${INJECT_TAG}\n</body>`);
  } else {
    html += `\n${INJECT_TAG}`;
  }
  return html;
}

module.exports = { createProxy };
