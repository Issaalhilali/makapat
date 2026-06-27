/**
 * Data aggregator — featured content for the proactive welcome feed.
 * ------------------------------------------------------------------
 * Builds a small JSON file (src/data/featured-content.json) with:
 *   - the top training categories (rendered as welcome "snippet cards")
 *   - the most popular / upcoming courses (priced)
 *   - the latest articles (fetched live from muk3bat.com as a freshness signal)
 *
 * Sources, in order of preference:
 *   1. The curated featured courses already in the knowledge base
 *      (knowledge-base.getCourses) — these carry prices, icons, and benefits.
 *   2. A live WP REST fetch of the newest posts (best-effort, non-fatal).
 *
 * Usage:
 *   node src/services/data-aggregator.js      # rebuild featured-content.json
 *   npm run aggregate                         # same
 *
 * Runtime helper (used by the /api/nabih-featured route):
 *   getWelcomeSnippets(limit) -> [{ title, icon, benefit, query }]
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../config');
const knowledgeBase = require('./knowledge-base');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT = path.join(DATA_DIR, 'featured-content.json');

const http = axios.create({
  baseURL: config.proxyTarget,
  timeout: 15000,
  headers: { 'User-Agent': 'NabihAggregatorBot/1.0 (+muk3bat.com assistant)' },
});

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function shorten(text, max) {
  if (!text) return '';
  return text.length <= max ? text : text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

// Fixed welcome categories (client-approved design). Each snippet, when tapped,
// sends a query that triggers the matching FAQ answer / contact card.
const WELCOME_CATEGORIES = [
  {
    title: 'التسجيل والشهادات',
    icon: '🎓',
    benefit: 'سجّل في دوراتنا وتعرّف على الشهادات والاعتمادات وآلية الحصول عليها.',
    // categories with `questions` expand into an accordion of FAQ items
    questions: [
      'كيف أسجل في دورة؟',
      'هل الشهادات تصدر إلكترونياً؟',
      'كيف أتأكد من صحة الشهادة؟',
    ],
  },
  {
    title: 'البرامج التدريبية',
    icon: '💼',
    benefit: 'استعرض مجالاتنا التدريبية المتنوعة واكتشف الدورات المناسبة لاحتياجاتك.',
    questions: [
      'ما المجالات التدريبية التي تقدمونها؟',
      'هل يمكن تنفيذ الدورات حضوريًا أو عن بُعد؟',
    ],
  },
  {
    title: 'ريادة الأعمال',
    icon: '💡',
    benefit: 'طوّر أفكارك ومهاراتك الريادية وأطلق مشروعك بثقة واحترافية.',
    query: 'ريادة الأعمال', // direct-answer card (no sub-questions)
  },
  {
    title: 'خدمات الشركات والجهات',
    icon: '🏢',
    benefit: 'برامج مخصصة، عروض أسعار، وحلول تدريبية للشركات والقطاع غير الربحي.',
    questions: [
      'هل تقدمون دورات للشركات والجهات الحكومية؟',
      'هل يمكن تصميم برنامج تدريبي خاص لجهتنا؟',
      'كيف أحصل على عرض سعر؟',
    ],
  },
  {
    title: 'الدعم والمساعدة',
    icon: '🎧',
    benefit: 'تواصل مع خدمة العملاء أو اطلب المساعدة للإجابة عن جميع استفساراتك.',
    query: 'أحتاج مساعدة من موظف خدمة العملاء', // direct → contact card
  },
];

function categoriesFromCourses(limit) {
  return WELCOME_CATEGORIES.slice(0, limit);
}

// Best-effort live fetch of the newest articles from muk3bat.com.
async function fetchLatestArticles(limit) {
  try {
    const { data } = await http.get('/wp-json/wp/v2/posts', {
      params: { per_page: limit, orderby: 'date', order: 'desc', _fields: 'title,link,excerpt,date' },
    });
    return (Array.isArray(data) ? data : []).map((p) => ({
      title: stripHtml(p.title && p.title.rendered),
      url: p.link,
      benefit: shorten(stripHtml(p.excerpt && p.excerpt.rendered), 80),
      date: p.date || null,
    }));
  } catch (e) {
    return [];
  }
}

async function aggregate() {
  console.log('\n  ✦ Aggregating featured content for the welcome feed\n');

  const categories = categoriesFromCourses(5);
  const popularCourses = knowledgeBase.getCourses(4).map((c) => ({
    title: c.title,
    price: c.price || null,
    icon: c.icon || null,
    benefit: shorten(c.description, 90),
    url: c.url,
  }));
  const latestArticles = await fetchLatestArticles(3);

  const featured = {
    generatedAt: new Date().toISOString(),
    source: config.proxyTarget,
    categories,
    popularCourses,
    latestArticles,
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(featured, null, 2), 'utf8');

  console.log(`  • categories     : ${categories.length}`);
  console.log(`  • popular courses: ${popularCourses.length}`);
  console.log(`  • latest articles: ${latestArticles.length} (live)`);
  console.log(`\n  ✓ Wrote ${path.relative(process.cwd(), OUTPUT)}\n`);
  return featured;
}

let cache;
function load() {
  if (cache !== undefined) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
  } catch (e) {
    cache = null;
  }
  return cache;
}

// Snippets for the proactive welcome feed. Prefers the prebuilt file; falls
// back to deriving them live from the knowledge base so it always returns data.
function getWelcomeSnippets(limit = 5) {
  const file = load();
  if (file && Array.isArray(file.categories) && file.categories.length) {
    return file.categories.slice(0, limit);
  }
  return categoriesFromCourses(limit);
}

module.exports = { aggregate, getWelcomeSnippets, load, OUTPUT };

// CLI entry point.
if (require.main === module) {
  aggregate().catch((err) => {
    console.error('\n  ✗ Aggregation failed:', err.message);
    process.exit(1);
  });
}
