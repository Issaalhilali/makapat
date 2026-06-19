/**
 * Development reverse proxy.
 * --------------------------
 * Mirrors the live store onto localhost and injects the Nabih widget into the
 * HTML so you can develop against the real Salla/WordPress theme.
 */
const zlib = require('zlib');
const { createProxyMiddleware } = require('http-proxy-middleware');

const INJECT_TAG = '<script src="/nabih-assistant.js" defer></script>';

const HOST_FIX_STYLE = `<style id="nabih-host-fix">
/* Desktop: remove the out-of-place dark bottom bar */
@media (min-width:1024px){
  .elementor-element-67401ac,
  .elementor-location-footer .elementor-widget-n-menu{ display:none !important; }
}
/* Mobile/tablet: clean bottom bar configuration */
@media (max-width:1023px){
  .elementor-element-67401ac{
    position:fixed !important; left:0; right:0; bottom:0; z-index:2147482000;
    background:#0f2236 !important; box-shadow:0 -6px 22px rgba(0,0,0,.28);
    margin:0 !important; padding:6px 2px !important; width:100% !important;
  }
  .elementor-element-67401ac .e-n-menu-wrapper,
  .elementor-element-67401ac .e-n-menu,
  .elementor-element-67401ac ul{
    display:flex !important; flex-direction:row !important; flex-wrap:nowrap !important;
    justify-content:space-around !important; align-items:center !important;
    width:100% !important; gap:0 !important; margin:0 !important; padding:0 !important;
    list-style:none !important;
  }
  .elementor-element-67401ac li,
  .elementor-element-67401ac .e-n-menu-item{
    flex:1 1 0 !important; min-width:0 !important; margin:0 !important; text-align:center !important;
  }
  .elementor-element-67401ac .e-n-menu-title,
  .elementor-element-67401ac .e-n-menu-title-container{
    justify-content:center !important; padding-inline:0 !important;
  }
  .elementor-element-67401ac .e-n-menu-toggle,
  .elementor-element-67401ac .e-n-menu-heading{ display:none !important; }
  .elementor-element-67401ac .e-n-menu-title-text{
    font-size:10.5px !important; white-space:nowrap !important;
  }
  body{ padding-bottom:74px !important; }
}
</style>`;

function createProxy(config) {
  const TARGET = config.proxyTarget;
  const TARGET_HOST = new URL(TARGET).host;

  return createProxyMiddleware({
    target: TARGET,
    changeOrigin: true,
    secure: false, // تم جعلها false لتفادي مشاكل شهادات SSL مع Cloudflare أثناء البروكسي
    followRedirects: true,
    ws: true,
    selfHandleResponse: true,

    onProxyReq(proxyReq, req) {
      // طلب محتوى الهوية، وتمرير الهيدرز الأصلية بشكل سليم
      proxyReq.setHeader('accept-encoding', 'gzip, deflate, br, identity');
      proxyReq.setHeader('referer', TARGET + '/');
      proxyReq.setHeader('origin', TARGET);
      proxyReq.setHeader('host', TARGET_HOST);
    },

    onProxyRes(proxyRes, req, res) {
      const contentType = String(proxyRes.headers['content-type'] || '');
      const isHtml = contentType.includes('text/html');
      const headers = { ...proxyRes.headers };

      // تحديد البروتوكول ديناميكياً (https أونلاين على فيرسيل لمنع تداخل الـ Mixed Content)
      const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');

      delete headers['content-security-policy'];
      delete headers['content-security-policy-report-only'];
      delete headers['x-frame-options'];
      delete headers['strict-transport-security'];
      delete headers['x-content-type-options'];

      // إزالة هيدرز الحجم والترميز القديمة لأننا سنقوم بتعديل الـ Body وفك ضغطه يدوياً
      delete headers['content-length'];
      delete headers['content-encoding'];
      delete headers['transfer-encoding'];

      if (headers['set-cookie']) {
        headers['set-cookie'] = [].concat(headers['set-cookie']).map((c) =>
          c
            .replace(/;\s*Domain=[^;]+/gi, '')
            .replace(/;\s*Secure/gi, '')
            .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
        );
      }

      if (headers['location']) {
        headers['location'] = rewriteUrl(headers['location'], req, TARGET_HOST, config.port, protocol);
      }

      if (!isHtml) {
        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res);
        return;
      }

      const chunks = [];
      proxyRes.on('data', (c) => chunks.push(c));
      proxyRes.on('end', () => {
        const rawBuffer = Buffer.concat(chunks);
        // فك الترميز يتم بناءً على الـ header الأصلي القادم من السيرفر مباشرة قبل حذفه
        let decoded = decodeBody(rawBuffer, proxyRes.headers);
        
        let body = decoded.toString('utf8');
        body = rewriteHtml(body, req, TARGET_HOST, protocol);
        
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
      res.end('Proxy error: ' + err.message);
    },
  });
}

function decodeBody(buf, headers) {
  const enc = String(headers['content-encoding'] || '').toLowerCase();
  try {
    if (enc.includes('gzip')) return zlib.gunzipSync(buf);
    if (enc.includes('deflate')) return zlib.inflateSync(buf);
    if (enc.includes('br')) return zlib.brotliDecompressSync(buf);
  } catch (e) {
    console.warn('[proxy] decode failed (%s), using raw body', enc);
  }
  return buf;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rewriteUrl(url, req, targetHost, port, protocol) {
  const localHost = req.headers.host || `localhost:${port}`;
  return String(url).replace(
    new RegExp(`https?://(www\\.)?${escapeRe(targetHost)}`, 'gi'),
    `${protocol}://${localHost}`
  );
}

function rewriteHtml(html, req, targetHost, protocol) {
  const localHost = req.headers.host || 'localhost';
  const host = escapeRe(targetHost);

  // التبديل يعتمد ديناميكياً على بروتوكول البيئة المستضيفة لمنع الـ Mixed Content
  html = html
    .replace(new RegExp(`https?://www\\.${host}`, 'gi'), `${protocol}://${localHost}`)
    .replace(new RegExp(`https?://${host}`, 'gi'), `${protocol}://${localHost}`)
    .replace(new RegExp(`//www\\.${host}`, 'gi'), `//${localHost}`)
    .replace(new RegExp(`//${host}`, 'gi'), `//${localHost}`)
    .replace(new RegExp(`https?:\\\\/\\\\/(www\\.)?${host}`, 'gi'), `${protocol}:\\/\\/${localHost}`);

  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${HOST_FIX_STYLE}\n</head>`);
  }

  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${INJECT_TAG}\n</body>`);
  } else {
    html += `\n${INJECT_TAG}`;
  }
  return html;
}

module.exports = { createProxy };