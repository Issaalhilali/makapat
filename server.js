/**
 * Nabih × Muk3bat — Stable Serverless Entry Point with Global Proxy
 * ----------------------------------------------------------------
 */
const express = require('express');
const path = require('path');
const config = require('./src/config');
const apiRouter = require('./src/routes/api');
const { createProxy } = require('./src/proxy');

const app = express();
app.disable('x-powered-by');

// 1. Static widget assets (our files — served before the proxy can claim them)
app.use(
  express.static(path.join(__dirname, 'public'), {
    index: false,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'public, max-age=300');
    },
  })
);

// 2. Assistant API
app.use('/api', apiRouter);

// 3. Reverse proxy to the live store (Forced globally to avoid environment conflicts)
// هذا السطر سيتكفل بسحب موقع مكعبات وحقن الودجت داخله مباشرة
app.use('/', createProxy(config));

// Local development server runner (Vercel ignores this block entirely)
if (process.env.NODE_ENV !== 'production') {
  app.listen(config.port, () => {
    console.log(`\n  ✦ Nabih Assistant Backend Operational`);
    console.log(`  Local Proxy Mirror: http://localhost:${config.port}\n`);
  });
}

module.exports = app;