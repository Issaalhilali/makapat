/**
 * API router — the assistant's public surface, isolated from the proxy.
 * Security middleware (helmet + CORS) and body parsing are scoped HERE so they
 * never touch the reverse-proxied store traffic.
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('../config');
const { handleChat } = require('../controllers/chat-controller');
const { getWelcomeSnippets } = require('../services/data-aggregator');

const router = express.Router();

// Security headers for our own API responses.
router.use(helmet());

// Allow the store's production origin(s) to call the assistant cross-origin.
router.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin / server-to-server (no Origin header) and any
      // explicitly allow-listed origin.
      if (!origin || config.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    maxAge: 86400,
  })
);

// JSON body parsing, scoped to the API only.
router.use(express.json({ limit: '64kb' }));

router.post('/nabih-chat', handleChat);

// Proactive welcome feed — featured course snippets for the chat widget.
router.get('/nabih-featured', (req, res) => {
  res.json({ snippets: getWelcomeSnippets(3) });
});

// Lightweight health check for load balancers / uptime monitors.
router.get('/health', (req, res) => {
  res.json({ status: 'ok', aiEnabled: config.aiEnabled, model: config.anthropicModel });
});

module.exports = router;
