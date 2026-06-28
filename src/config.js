/**
 * Centralised configuration, loaded from the environment via dotenv.
 * Every other module imports from here — no `process.env` reads elsewhere.
 */
require('dotenv').config();

function list(value, fallback) {
  return String(value || fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,

  // AI backend
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-opus-4-8',

  // Reverse proxy (dev simulation)
  proxyTarget: process.env.PROXY_TARGET || 'https://muk3bat.com',

  // CORS
  allowedOrigins: list(
    process.env.ALLOWED_ORIGINS,
    'https://muk3bat.com,https://www.muk3bat.com,http://localhost:3000'
  ),

  // Persistence (optional)
  databaseUrl: process.env.DATABASE_URL || '',

  // Conversion / marketing (mock promotional triggers — toggle off for prod).
  promoEnabled: process.env.NABIH_PROMO !== 'false',
  promoCode: process.env.NABIH_PROMO_CODE || 'NABIH10',

  // Contact channels (live values from muk3bat.com footer; override via env).
  contact: {
    whatsapp: process.env.NABIH_WHATSAPP || 'https://wa.me/966555991437',
    whatsappDisplay: process.env.NABIH_WHATSAPP_DISPLAY || '0555991437',
    phone: process.env.NABIH_PHONE || '+966115207950',
    phoneDisplay: process.env.NABIH_PHONE_DISPLAY || '011 520 7950',
    email: process.env.NABIH_EMAIL || 'info@muk3bat.com',
  },
};

config.isProduction = config.nodeEnv === 'production';
config.aiEnabled = Boolean(config.anthropicApiKey);

module.exports = config;
