# Nabih (نبيه) — AI Smart Assistant for Muk3bat

A production-ready Arabic AI chat assistant for the **muk3bat.com** store, plus a
local reverse-proxy simulation environment for developing against the live theme.

- **Frontend:** a dependency-free, fully-isolated Vanilla-JS chat widget.
- **Backend:** an Express API (`/api/nabih-chat`) backed by the **Claude API**
  (`claude-opus-4-8`), with a zero-config mock fallback for demos.
- **Dev proxy:** mirrors the live store onto `localhost` and injects the widget.

## Project structure

```
server.js                       App entry — wires static assets, API, dev proxy
.env.example                    Environment template (copy to .env)
src/
  config.js                     Env-driven configuration (dotenv)
  proxy.js                      Reverse proxy + widget injection (DEV ONLY)
  routes/api.js                 API router — helmet + CORS + JSON (scoped)
  controllers/chat-controller.js   HTTP <-> AI service glue
  services/
    ai-service.js               generateAIResponse() — Claude wrapper + KB injection
    knowledge-base.js           Crawler + loader + search (REST + Cheerio fallback)
    data-aggregator.js          Featured-content builder for the welcome feed
    mock-responses.js           Intent-based mock engine (no API key needed)
  data/
    store-knowledge.json        Generated catalog (run `npm run crawl`)
    pricing-overrides.json      Curated featured courses (price + icon + benefit)
    featured-content.json       Generated welcome feed (run `npm run aggregate`)
public/
  preview.html                  Standalone widget preview (open /preview.html)
  nabih-assistant.js            The chat widget (self-mounting, runtime-configured)
  nabih-assistant.css           Isolated styles (#nabih-root scope, all:initial)
DEPLOYMENT.md                   CDN + WordPress + env-var production guide
```

## Architecture

```
                         ┌────────────────────────────┐
Browser  ──────────────▶ │  Express (server.js)       │
                         │                            │
  /nabih-assistant.js ─▶ │  1. static  (public/)      │
  /api/nabih-chat ─────▶ │  2. API router ──▶ controller ──▶ ai-service ──▶ Claude API
                         │                                              └─▶ mock fallback
  everything else ─────▶ │  3. dev proxy ──▶ muk3bat.com (widget injected)
                         └────────────────────────────┘
```

The assistant API (1+2) is what you ship to production. The dev proxy (3) is a
local convenience and is disabled automatically when `NODE_ENV=production`.

## Quick start (development)

```bash
# 1. Install dependencies
npm install

# 2. Configure (optional — works without a key via the mock engine)
cp .env.example .env
#   then set ANTHROPIC_API_KEY=sk-ant-... to enable real Claude responses

# 3. Run
npm run dev          # auto-restart, or: npm start

# 4. Open the store with Nabih injected
open http://localhost:3000
```

- No API key → the mock engine answers (great for demos).
- API key set → real Claude (`claude-opus-4-8`) answers, with conversation history.

Check status any time: `curl http://localhost:3000/api/health`

## Knowledge base (full store awareness)

Nabih answers from a **comprehensive, crawled catalog** of muk3bat.com rather
than a hand-written prompt.

```bash
npm run crawl       # (re)build src/data/store-knowledge.json
```

[knowledge-base.js](src/services/knowledge-base.js) aggregates the live site via
the **WordPress REST API** (pages, articles, policies, trainers, partners,
testimonials) and falls back to an **Axios + Cheerio** crawl for Elementor-built
pages whose REST content is empty. It compiles a structured catalog (titles,
categories, descriptions, URLs, prices/availability when present) into
`src/data/store-knowledge.json`.

At request time, `ai-service.js` injects a **complete catalog index** plus the
**most relevant entries** (keyword search) into Claude's system prompt, and
instructs Nabih to cite specific items as clickable **markdown deep-links**
(`[title](url)`) — which the widget renders safely. The same links are surfaced
in the no-key mock demo. Re-run `npm run crawl` periodically (or on a cron) to
keep the catalog fresh; the site has ~44 entries today.

> The current muk3bat.com is a **training center** (WordPress, no WooCommerce),
> so "products" are courses/services; prices aren't published in its API, and
> Nabih is instructed not to invent them.

## UI / branding

The widget uses the **Training Cubes** identity: a deep-blue base (`#11263A`,
the footer color) with **orange** (`#f29a3e`) and **green** (`#2bb673`) logo
accents (user bubbles, status dot, card rails/CTAs). The chat window is
**bottom-right, directly above the FAB** (physical positioning, RTL-safe), with
a **glassmorphism** surface (`backdrop-filter: blur`) and smooth open/close
animations. Preview it standalone at **`/preview.html`** (no proxied store
needed). Responsive: full-width sheet on phones, height-capped on short viewports
so it never blocks the page.

## Proactive welcome feed

On open, the widget greets the user and proactively renders an
**"استكشف أحدث دوراتنا"** section of compact **Course Snippet Cards** (icon +
title + benefit) to drive engagement. These come from
`GET /api/nabih-featured`, served by
[data-aggregator.js](src/services/data-aggregator.js), which compiles the top
training categories + popular courses (from the knowledge base / pricing overlay)
and the latest articles (fetched live from muk3bat.com) into
`src/data/featured-content.json`:

```bash
npm run aggregate     # rebuild the welcome feed
```

Tapping a snippet jumps straight into the priced Course-Cards flow.

## Conversion UX — Course Cards & pricing

Pricing queries (e.g. the **"أسعار الدورات"** welcome chip, or "كم تكلفة الدورات؟")
trigger a premium, conversion-focused flow instead of plain text:

- The response payload includes a **`cards[]`** array, rendered as native
  **Course Cards** in the chat — title, a highlighted **price tag**, a
  benefit-driven blurb, and a **"سجل الآن 🚀"** CTA button that deep-links
  straight to the course on muk3bat.com (purple-branded, responsive, isolated).
- Cards are built deterministically from `store-knowledge.json` (mock path) and
  parsed from a Claude ```cards``` block when the API key is set — with the same
  deterministic cards as a guaranteed fallback.
- A **mock psychological trigger** is appended on pricing replies (coupon
  **`NABIH10`** + limited-seats scarcity), toggleable via `NABIH_PROMO` /
  `NABIH_PROMO_CODE`.

> **On prices:** muk3bat.com does not publish per-course prices in its API, so
> prices come from a curated overlay at
> [src/data/pricing-overrides.json](src/data/pricing-overrides.json). The crawler
> merges its `featuredCourses` (title, **price**, benefit blurb, optional `url`)
> into the catalog as first-class `course` entries that lead `getCourses()` — so
> cards render exact numbers (e.g. `499 ر.س`) with the purple gradient price pill.
> Edit that file with real figures and `npm run crawl` to update. Any course
> left without a price still falls back to the tasteful **"اطلب عرض السعر"** badge.

## The `generateAIResponse` contract

`src/services/ai-service.js` exposes the single extension point:

```js
generateAIResponse(userMessage, conversationHistory) // -> { reply, suggestions }
```

It calls Claude when `ANTHROPIC_API_KEY` is set and falls back to the mock engine
otherwise. To plug in a different backend (proprietary endpoint, fine-tune, RAG
pipeline…), replace the body of `callClaude()` — the controller and widget are
untouched.

## Production

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for hosting the widget on a CDN, the exact
WordPress footer snippet, and backend environment configuration.

> Note: the live muk3bat.com is a WordPress + Elementor + LiteSpeed site (not
> Salla); the proxy and widget are platform-agnostic and work either way.
