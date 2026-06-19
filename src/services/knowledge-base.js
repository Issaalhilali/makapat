/**
 * Knowledge base — automated aggregator + runtime loader for Muk3bat.
 * ------------------------------------------------------------------
 * Builds a comprehensive, structured catalog of everything published on
 * muk3bat.com and saves it to src/data/store-knowledge.json.
 *
 * Strategy (resilient, with graceful fallbacks):
 *   1. PRIMARY  — WordPress REST API (/wp-json/wp/v2/*) for structured content:
 *                 pages, articles, policies, trainers, partners, testimonials.
 *   2. FALLBACK — Axios + Cheerio crawl of the rendered HTML for content the
 *                 REST API returns empty (Elementor-built pages), and to strip
 *                 HTML to clean text everywhere.
 *
 * Usage:
 *   node src/services/knowledge-base.js        # (re)build the knowledge file
 *   npm run crawl                              # same
 *
 * Runtime helpers (imported by ai-service.js):
 *   load()                 -> cached knowledge object (or null if not built)
 *   search(query, limit)   -> most relevant catalog items for an intent
 *   buildContext(query)    -> compact text block to inject into the prompt
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../config');

const SOURCE = config.proxyTarget; // https://muk3bat.com
const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT = path.join(DATA_DIR, 'store-knowledge.json');

// WordPress REST content types to aggregate, with Arabic labels + grouping.
const SOURCES = [
  { rest: 'pages', label: 'صفحة', group: 'page', scrape: true },
  { rest: 'posts', label: 'مقال', group: 'article' },
  { rest: 'policies_and_provisi', label: 'سياسة', group: 'policy' },
  { rest: 'academic_trainer', label: 'مدرب أكاديمي', group: 'trainer' },
  { rest: 'partnership', label: 'شريك', group: 'partner' },
  { rest: 'success_partners', label: 'شريك نجاح', group: 'partner' },
  { rest: 'trainees_opinion', label: 'رأي متدرب', group: 'testimonial' },
];

const http = axios.create({
  baseURL: SOURCE,
  timeout: 20000,
  headers: { 'User-Agent': 'NabihKnowledgeBot/1.0 (+muk3bat.com assistant)' },
});

/* -------------------------------------------------------------------------- */
/*  Aggregation (crawler)                                                      */
/* -------------------------------------------------------------------------- */

// Strip HTML to clean, single-spaced text using Cheerio.
function htmlToText(html) {
  if (!html) return '';
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  return $.root().text().replace(/\s+/g, ' ').trim();
}

function decodeTitle(html) {
  return cheerio.load(`<x>${html || ''}</x>`)('x').text().trim();
}

// Best-effort price detection (Arabic-Indic or Latin digits + currency).
function extractPrice(text) {
  if (!text) return null;
  const m = text.match(/([\d٠-٩][\d٠-٩.,]*)\s*(ريال|ر\.?\s?س|SAR|﷼)/i);
  return m ? m[0].replace(/\s+/g, ' ').trim() : null;
}

function truncate(text, max) {
  if (!text) return '';
  return text.length <= max ? text : text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

// Axios + Cheerio fallback: pull readable body text from a rendered page.
async function scrapePageText(url, maxLen = 700) {
  try {
    const { data } = await http.get(url, { responseType: 'text' });
    const $ = cheerio.load(data);
    $('script, style, noscript, header, footer, nav, .elementor-location-header, .elementor-location-footer').remove();
    // Prefer the main content region if present, else the body.
    const scope = $('main').length ? $('main') : $('body');
    const text = scope.text().replace(/\s+/g, ' ').trim();
    return truncate(text, maxLen);
  } catch (e) {
    return '';
  }
}

// Load curated featured courses from the pricing overlay and shape them as
// first-class catalog entries (type "course") with prices + benefit blurbs.
function loadFeaturedCourses(defaultUrl) {
  const file = path.join(DATA_DIR, 'pricing-overrides.json');
  let overrides;
  try {
    overrides = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return []; // no overlay — that's fine
  }
  const list = Array.isArray(overrides.featuredCourses) ? overrides.featuredCourses : [];
  return list
    .filter((c) => c && c.title)
    .map((c, idx) => ({
      id: c.id || `course-${idx + 1}`,
      type: 'course',
      typeLabel: 'دورة',
      title: String(c.title).trim(),
      url: (c.url && String(c.url).trim()) || defaultUrl,
      description: String(c.description || '').trim(),
      price: c.price ? String(c.price).trim() : null,
      icon: c.icon || null,
      badge: c.badge || null,
      rating: typeof c.rating === 'number' ? c.rating : null,
      availability: c.availability || null,
      updated: new Date().toISOString(),
    }));
}

async function fetchType(source) {
  const items = [];
  for (let page = 1; page <= 10; page++) {
    let batch;
    try {
      const { data } = await http.get(`/wp-json/wp/v2/${source.rest}`, {
        params: {
          per_page: 100,
          page,
          _fields: 'id,link,title,excerpt,content,date',
        },
      });
      batch = Array.isArray(data) ? data : [];
    } catch (e) {
      // 400 "page out of range" ends pagination; other errors skip the type.
      const status = e.response && e.response.status;
      if (status !== 400) {
        console.warn(`  ! ${source.rest}: ${e.message}`);
      }
      break;
    }
    if (!batch.length) break;

    for (const row of batch) {
      const title = decodeTitle(row.title && row.title.rendered);
      if (!title) continue;

      // Description: REST excerpt → REST content → scraped page (Elementor).
      let description =
        htmlToText(row.excerpt && row.excerpt.rendered) ||
        htmlToText(row.content && row.content.rendered);
      if (!description && source.scrape) {
        description = await scrapePageText(row.link);
      }

      items.push({
        id: `${source.group}-${row.id}`,
        type: source.group,
        typeLabel: source.label,
        title,
        url: row.link,
        description: truncate(description, source.group === 'policy' ? 900 : 600),
        price: extractPrice(description),
        availability: null,
        updated: row.date || null,
      });
    }
    if (batch.length < 100) break;
  }
  return items;
}

async function crawl() {
  console.log(`\n  ✦ Building Muk3bat knowledge base from ${SOURCE}\n`);
  const all = [];

  for (const source of SOURCES) {
    process.stdout.write(`  • ${source.rest} … `);
    const items = await fetchType(source);
    console.log(`${items.length} item(s)`);
    all.push(...items);
  }

  // Store-level pages (used for summary + default deep-link targets).
  const about = all.find((i) => i.type === 'page' && /عن\s*المركز/.test(i.title));
  const coursesPage = all.find((i) => i.type === 'page' && /دورات/.test(i.title));
  const contactPage = all.find((i) => i.type === 'page' && /تواصل/.test(i.title));
  const coursesUrl = coursesPage ? coursesPage.url : SOURCE;

  // Merge curated featured courses (premium price tags + benefit blurbs) from
  // the pricing overlay. These lead the catalog so getCourses surfaces them.
  const featured = loadFeaturedCourses(coursesUrl);
  all.unshift(...featured);
  if (featured.length) console.log(`  • pricing overlay … ${featured.length} featured course(s)`);

  // Convenience groupings the AI prompt and search use.
  const policies = all.filter((i) => i.type === 'policy');
  const catalog = all.filter((i) => i.type !== 'policy'); // courses/pages/articles/etc.

  const knowledge = {
    generatedAt: new Date().toISOString(),
    source: SOURCE,
    store: {
      name: 'مركز مكعبات للتدريب (Muk3bat)',
      summary: about
        ? truncate(about.description, 500)
        : 'مركز تدريب سعودي يقدّم دورات ومسارات تطويرية معتمدة.',
      aboutUrl: about ? about.url : SOURCE,
      coursesUrl,
      contactUrl: contactPage ? contactPage.url : SOURCE,
    },
    stats: {
      total: all.length,
      catalog: catalog.length,
      policies: policies.length,
      byType: all.reduce((acc, i) => {
        acc[i.type] = (acc[i.type] || 0) + 1;
        return acc;
      }, {}),
    },
    catalog,
    policies,
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(knowledge, null, 2), 'utf8');

  console.log(`\n  ✓ Wrote ${all.length} entries to ${path.relative(process.cwd(), OUTPUT)}`);
  console.log(`    catalog: ${catalog.length} · policies: ${policies.length}\n`);
  return knowledge;
}

/* -------------------------------------------------------------------------- */
/*  Runtime loading + lightweight semantic-ish search                         */
/* -------------------------------------------------------------------------- */

let cache;

function load() {
  if (cache !== undefined) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
  } catch (e) {
    cache = null; // not built yet — ai-service degrades gracefully
  }
  return cache;
}

// Normalise Arabic for matching (alef/ya/ta-marbuta + tashkeel).
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْـ]/g, '');
}

const STOPWORDS = new Set(
  ['في', 'من', 'عن', 'على', 'الى', 'هل', 'ما', 'هي', 'هو', 'كم', 'و', 'يا', 'مع', 'the', 'a', 'is', 'of', 'to']
    .map(normalize)
);

function tokens(text) {
  return normalize(text)
    .split(/[^a-z0-9ء-ي]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// Keyword-overlap scoring across all entries; returns the top matches.
function search(query, limit = 8) {
  const kb = load();
  if (!kb) return [];
  const qTokens = tokens(query);
  if (!qTokens.length) return [];

  const entries = [...kb.catalog, ...kb.policies];
  const scored = entries.map((item) => {
    const haystack = tokens(`${item.title} ${item.typeLabel} ${item.description}`);
    const set = new Set(haystack);
    let score = 0;
    for (const t of qTokens) {
      if (set.has(t)) score += 2; // exact token
      else if (haystack.some((h) => h.includes(t) || t.includes(h))) score += 1; // partial
    }
    // Title hits weigh more.
    const titleTokens = new Set(tokens(item.title));
    for (const t of qTokens) if (titleTokens.has(t)) score += 2;
    return { item, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}

// Course-like catalog entries, prioritised for pricing/recommendation cards.
function getCourses(limit = 4) {
  const kb = load();
  if (!kb) return [];

  // Prefer curated featured courses (carry premium price tags + benefit blurbs).
  const featured = kb.catalog.filter((i) => i.type === 'course');
  if (featured.length) return featured.slice(0, limit);

  // Exclude navigational/non-course pages so cards stay on-topic.
  const EXCLUDE = /انضم|تواصل|الرئيسيه|الاخبار|الشراكات|نبيه/;
  const isCourse = (i) =>
    (i.type === 'page' || i.type === 'article') &&
    !EXCLUDE.test(normalize(i.title)) &&
    /دور|تدريب|معتمد|برنامج|مسار/.test(normalize(`${i.title} ${i.description}`));

  // Rank: dedicated "الدورات" page first, then course articles, then other pages.
  const rank = (i) => (/دورات/.test(i.title) ? 0 : i.type === 'article' ? 1 : 2);
  const courses = kb.catalog.filter(isCourse).sort((a, b) => rank(a) - rank(b));
  return (courses.length ? courses : kb.catalog).slice(0, limit);
}

/**
 * Build the store-knowledge block injected into Claude's system prompt.
 * Always includes a COMPACT INDEX of the entire catalog (complete overview),
 * plus FULL detail for the entries most relevant to the user's message.
 */
function buildContext(query) {
  const kb = load();
  if (!kb) return '';

  const line = (i) => `- ${i.title} [${i.typeLabel}] → ${i.url}`;

  // Complete inventory index (titles + URLs) so Nabih has the full overview.
  const index = kb.catalog.map(line).join('\n');
  const policyIndex = kb.policies.map(line).join('\n');

  // Detailed entries relevant to this question.
  const relevant = search(query, 8);
  const detail = relevant
    .map(
      (i) =>
        `### ${i.title}\nالنوع: ${i.typeLabel}\nالرابط: ${i.url}` +
        (i.price ? `\nالسعر: ${i.price}` : '') +
        (i.description ? `\nالوصف: ${i.description}` : '')
    )
    .join('\n\n');

  return [
    `# قاعدة معرفة متجر مكعبات (محدّثة ${kb.generatedAt.slice(0, 10)})`,
    `اسم الجهة: ${kb.store.name}`,
    `نبذة: ${kb.store.summary}`,
    `روابط مهمة: الدورات ${kb.store.coursesUrl} | عن المركز ${kb.store.aboutUrl} | تواصل ${kb.store.contactUrl}`,
    '',
    `## فهرس المحتوى الكامل (${kb.catalog.length} عنصر)`,
    index,
    '',
    `## السياسات والأحكام (${kb.policies.length})`,
    policyIndex,
    relevant.length ? `\n## تفاصيل العناصر الأكثر صلة بسؤال المستخدم\n${detail}` : '',
  ].join('\n');
}

module.exports = { crawl, load, search, getCourses, buildContext, OUTPUT };

// CLI entry point.
if (require.main === module) {
  crawl().catch((err) => {
    console.error('\n  ✗ Crawl failed:', err.message);
    process.exit(1);
  });
}
