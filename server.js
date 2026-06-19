/**
 * Nabih × Muk3bat — application entry point.
 * ------------------------------------------
 * Wires together three concerns, in order of precedence:
 *   1. Static assets  — the Nabih widget JS/CSS from ./public
 *   2. Assistant API  — POST /api/nabih-chat (helmet + CORS + JSON, scoped)
 *   3. Dev proxy      — everything else is mirrored from the live store and
 *                       has the widget injected (development simulation only)
 *
 * In production you typically run ONLY (1)+(2) as the assistant backend and
 * host the static files on a CDN — see DEPLOYMENT.md. The proxy is a dev aid.
 */
const express = require('express');
const path = require('path');
const config = require('./src/config');
const apiRouter = require('./src/routes/api');
const { createProxy } = require('./src/proxy');

const app = express();
app.disable('x-powered-by');

// 1. Static widget assets (our files — served before the proxy can claim them).
app.use(
  express.static(path.join(__dirname, 'public'), {
    index: false,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'public, max-age=300');
    },
  })
);

// 2. Assistant API.
app.use('/api', apiRouter);

// 3. Reverse proxy to the live store.
// تفعيل البروكسي بناءً على متغير البيئة ENABLE_PROXY ليقوم بسحب موقع مكعبات وحقن المساعد
if (config.nodeEnv !== 'production' || process.env.ENABLE_PROXY === 'true') {
  app.use('/', createProxy(config));
}

// تشغيل السيرفر محلياً (Vercel سيتجاهل listen ويعتمد على الأقسام العلوية)
if (process.env.NODE_ENV !== 'production') {
  app.listen(config.port, () => {
    console.log('\n  ✦ Nabih × Muk3bat');
    console.log('  ----------------------------------------');
    console.log(`  Env      : ${config.nodeEnv}`);
    console.log(`  Local    : http://localhost:${config.port}`);
    console.log(`  Assistant: POST /api/nabih-chat   (AI ${config.aiEnabled ? 'ENABLED · ' + config.anthropicModel : 'mock fallback'})`);
    if (config.nodeEnv !== 'production' || process.env.ENABLE_PROXY === 'true') {
      console.log(`  Proxy    : mirroring ${config.proxyTarget} (dev)`);
    }
    console.log('');
  });
}

module.exports = app;