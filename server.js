/**
 * Nabih × Muk3bat — Stable Serverless Entry Point
 * ----------------------------------------------
 */
const express = require('express');
const path = require('path');
const config = require('./src/config');
const apiRouter = require('./src/routes/api');

const app = express();
app.disable('x-powered-by');

// 1. Static widget assets (our files — served directly)
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

// 3. Serve the clean Preview Page directly on root to prevent proxy distortion
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'preview.html'));
});

// Fallback to preview if index.html is requested or anything else
app.get('/preview.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'preview.html'));
});

// Local development server runner
if (process.env.NODE_ENV !== 'production') {
  app.listen(config.port, () => {
    console.log(`\n  ✦ Nabih Assistant Backend Operational`);
    console.log(`  Local Preview: http://localhost:${config.port}\n`);
  });
}

module.exports = app;