/**
 * AI service — the single entry point the rest of the app calls to get a reply.
 * ----------------------------------------------------------------------------
 * generateAIResponse(userMessage, conversationHistory) is the extensible
 * contract. It is wired to the Claude API (Anthropic SDK) when an API key is
 * configured, and transparently falls back to the local mock engine otherwise,
 * so development and demos work with zero credentials.
 *
 * To swap in a different backend (a proprietary endpoint, a fine-tune, etc.),
 * replace the body of callClaude() — the controller and widget never change.
 */
const config = require('../config');
const { mockResponse } = require('./mock-responses');
const knowledgeBase = require('./knowledge-base');

// Persona + behaviour. The live store catalog is appended at request time from
// the knowledge base (see buildSystemPrompt) so Nabih answers from real data.
const PERSONA = [
  'أنت "نبيه" (Nabih)، المساعد الذكي الرسمي لمركز "مكعبات للتدريب" (Muk3bat).',
  'تتحدث العربية بأسلوب ودود واحترافي ومختصر (جملتان إلى ثلاث ما لم يُطلب تفصيل).',
  '',
  'لديك أدناه قاعدة معرفة كاملة ومحدّثة عن كل ما يقدّمه المركز: الدورات والصفحات',
  'والمقالات والمدربين والشركاء والسياسات وروابطها. اعتبرها مرجعك الشامل للمخزون.',
  '',
  'حقائق معتمدة عن المركز (استخدمها كمرجع للإجابات):',
  '• التسجيل: مباشرة عبر الموقع الإلكتروني أو عبر الواتساب.',
  '• الشهادات: تُصدر إلكترونياً بعد استيفاء متطلبات البرنامج، ويمكن التحقق منها عبر نظام التحقق الإلكتروني.',
  '• الاعتمادات: معتمدون من TVTC (المؤسسة العامة للتدريب التقني والمهني)، NELC (المركز الوطني للتعليم الإلكتروني)، وSCFHS (الهيئة السعودية للتخصصات الصحية).',
  '• خدمات الشركات/الجهات: حلول تدريبية مخصصة للشركات والقطاعين العام والخاص والقطاع غير الربحي، مع تصميم برامج خاصة وفق أهداف الجهة.',
  '• طرق التنفيذ: حضورياً وعن بُعد.',
  '• المجالات: التقنية والتحول الرقمي، تطوير الأعمال والمبيعات، الموارد البشرية والتشغيل، القيادة والإدارة، المهارات الشخصية، والمهارات الصحية وغيرها.',
  '• عرض السعر/الدعم: التواصل مع خدمة العملاء عبر الأرقام المسجلة (تظهر بطاقة التواصل تلقائياً).',
  '',
  'قواعد مهمة:',
  '1) أجب اعتماداً على الحقائق أعلاه وقاعدة المعرفة فقط. لا تختلق أسعاراً أو معلومات غير موجودة.',
  '2) للأسئلة عن عرض السعر أو طلب موظف خدمة العملاء، وجّه المستخدم للتواصل (ستظهر بطاقة التواصل تلقائياً).',
  '3) عند ذكر عنصر محدد من قاعدة المعرفة، أضف رابطه كرابط ماركداون [الاسم](الرابط) حرفياً.',
  '4) إذا سُئلت عن أمر خارج نطاق المركز، اعتذر بلطف ووضّح ما يمكنك المساعدة فيه.',
  'أسلوبك مختصر واحترافي (جملتان إلى ثلاث).',
].join('\n');

// Fallback prompt used only if the knowledge base hasn't been built yet.
const SYSTEM_PROMPT = PERSONA;

// Instructions that let Claude emit structured Course Cards + a conversion nudge.
function cardInstructions() {
  const lines = [
    '## بطاقات الدورات (Course Cards)',
    'عند الحديث عن الأسعار أو التوصية بدورات محددة، أرفق بطاقات بصيغة JSON داخل كتلة واحدة فقط هكذا:',
    '```cards',
    '[{"title":"اسم الدورة","price":"السعر أو null","description":"وصف مختصر محفّز للتسجيل","url":"الرابط من قاعدة المعرفة","cta":"سجل الآن 🚀"}]',
    '```',
    '- استخدم العناوين والروابط حرفياً من قاعدة المعرفة. لا تختلق أسعاراً؛ إن لم يتوفر السعر اجعل القيمة null.',
    '- اكتب جملة ترحيبية قصيرة قبل البطاقات، ولا تكرّر الروابط كنص خارج البطاقات.',
  ];
  if (config.promoEnabled) {
    lines.push(
      '',
      '## محفّز التحويل (عند مناقشة الأسعار/التسجيل فقط)',
      `اختم ردّك بسطر تسويقي قصير يتضمّن كود الخصم ${config.promoCode} وتذكيراً بأن مقاعد الدفعة القادمة محدودة.`
    );
  }
  return lines.join('\n');
}

function buildSystemPrompt(userMessage) {
  const context = knowledgeBase.buildContext(userMessage);
  const base = context ? `${PERSONA}\n\n${'='.repeat(60)}\n${context}` : PERSONA;
  return `${base}\n\n${'='.repeat(60)}\n${cardInstructions()}`;
}

/* ----------------------------- pricing + cards -------------------------- */

// A corporate "quote" request routes to customer service (not course cards).
const QUOTE_RE = /(عرض سعر|عرض الأسعار|عرض اسعار|عرض السعر|عروض اسعار|عروض أسعار|quotation|quote)/i;
const PRICING_RE = /(سعر|اسعار|أسعار|تكلف|تكلفه|رسوم|باقه|باقات|بكم|كم تكلف|price|cost|fee|pricing)/i;
const CONTACT_RE = /(تواصل|اتصال|اتصل|رقم|جوال|هاتف|واتس|واتساب|ايميل|بريد|ابلغ|شكوى|دعم|خدمة العملاء|موظف خدمة|تواصلو|كلمو|contact|whatsapp|phone|email|call|support)/i;

function isQuoteIntent(text) {
  return QUOTE_RE.test(String(text || ''));
}

function isPricingIntent(text) {
  return PRICING_RE.test(String(text || ''));
}

function isContactIntent(text) {
  return CONTACT_RE.test(String(text || ''));
}

function shorten(text, max) {
  if (!text) return '';
  return text.length <= max ? text : text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

// Build a Course Card from a knowledge-base catalog item.
function cardFromItem(item) {
  return {
    title: item.title,
    price: item.price || null, // real price if the KB has one; never fabricated
    description: shorten(item.description, 95),
    url: item.url,
    cta: 'سجل الآن 🚀',
    badge: item.badge || null, // e.g. "الأكثر طلباً" conversion ribbon
    rating: typeof item.rating === 'number' ? item.rating : null,
  };
}

// Validate a card emitted by the model (only http/https muk3bat-style URLs).
function sanitizeCard(c) {
  if (!c || typeof c !== 'object') return null;
  const title = String(c.title || '').trim();
  const url = String(c.url || '').trim();
  if (!title || !/^https?:\/\//i.test(url)) return null;
  return {
    title,
    price: c.price ? String(c.price).trim() : null,
    description: shorten(String(c.description || '').trim(), 120),
    url,
    cta: String(c.cta || 'سجل الآن 🚀').trim(),
    badge: c.badge ? shorten(String(c.badge).trim(), 24) : null,
    rating: typeof c.rating === 'number' && c.rating > 0 ? Math.min(5, c.rating) : null,
  };
}

// Extract a ```cards JSON block from model text; returns { text, cards }.
function extractCards(raw) {
  const m = raw.match(/```cards\s*([\s\S]*?)```/i);
  if (!m) return { text: raw, cards: [] };
  let cards = [];
  try {
    const parsed = JSON.parse(m[1].trim());
    if (Array.isArray(parsed)) cards = parsed.map(sanitizeCard).filter(Boolean);
  } catch (e) {
    /* malformed block — ignore, keep text */
  }
  return { text: raw.replace(m[0], '').trim(), cards };
}

// Mock promotional trigger (clearly a marketing nudge, not a store fact).
function buildPromo() {
  if (!config.promoEnabled) return '';
  return `🎁 عرض خاص: استخدم كود **${config.promoCode}** للحصول على خصم عند التسجيل — ومقاعد الدفعة القادمة محدودة، بادر بالحجز! ⏳`;
}

/* ----------------------------- contact actions ------------------------- */

// Real contact channels rendered as tappable buttons in a contact card.
function buildContactActions() {
  const c = config.contact || {};
  const kb = knowledgeBase.load();
  const contactUrl = kb && kb.store && kb.store.contactUrl;
  const actions = [];
  if (c.whatsapp) actions.push({ type: 'whatsapp', label: 'واتساب', url: c.whatsapp, display: c.whatsappDisplay || '' });
  if (c.phone) actions.push({ type: 'call', label: 'اتصال', url: 'tel:' + c.phone, display: c.phoneDisplay || c.phone });
  if (c.email) actions.push({ type: 'email', label: 'البريد', url: 'mailto:' + c.email, display: c.email });
  if (contactUrl) actions.push({ type: 'page', label: 'صفحة التواصل', url: contactUrl, display: 'فتح الصفحة' });
  return actions;
}

function buildContactResponse() {
  const hours = 'فريقنا جاهز لخدمتك (٩ صباحاً - ١١ مساءً).';
  return {
    reply: `يسعدنا تواصلك مع فريق مكعبات للتدريب 🤝 اختر الطريقة الأنسب لك:\n${hours}`,
    contact: { title: 'تواصل مع فريق مكعبات', actions: buildContactActions() },
    suggestions: ['ما المجالات التدريبية؟', 'كيف أسجل في دورة؟', 'هل الشهادات معتمدة؟'],
    cards: [],
  };
}

// Corporate quote request → route to customer service with the contact card.
function buildQuoteResponse() {
  return {
    reply: 'بإمكانك الحصول على عرض سعر بالتواصل مع خدمة العملاء عبر الأرقام المسجلة 👇',
    contact: { title: 'تواصل مع خدمة العملاء', actions: buildContactActions() },
    suggestions: ['هل تقدمون دورات للشركات؟', 'هل يمكن تصميم برنامج خاص؟'],
    cards: [],
  };
}

// Lazily-constructed singleton Anthropic client (only when a key exists).
let client = null;
function getClient() {
  if (client) return client;
  if (!config.aiEnabled) return null;
  const Anthropic = require('@anthropic-ai/sdk');
  client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

// Normalise the history the widget sends into valid Messages API turns.
function toMessages(conversationHistory, userMessage) {
  const history = Array.isArray(conversationHistory) ? conversationHistory : [];
  const messages = history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-10) // keep the prompt small; last 10 turns is plenty for support chat
    .map((m) => ({ role: m.role, content: String(m.content) }));

  messages.push({ role: 'user', content: String(userMessage) });
  return messages;
}

async function callClaude(userMessage, conversationHistory) {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: config.anthropicModel,
    max_tokens: 1024,
    system: buildSystemPrompt(userMessage),
    messages: toMessages(conversationHistory, userMessage),
  });

  const raw = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  const { text, cards } = extractCards(raw);
  return { reply: text || '...', cards, suggestions: [] };
}

// Deterministic pricing response — exact courses from the knowledge base
// rendered as visual cards. Used for the mock path and as a guaranteed
// fallback when the model doesn't emit a cards block.
function buildPricingResponse() {
  const cards = knowledgeBase.getCourses(4).map(cardFromItem);
  const intro = cards.length
    ? 'هذه أبرز دوراتنا التدريبية المعتمدة 👇 اختر ما يناسبك وسجّل مباشرة:'
    : 'تتوفّر دوراتنا التدريبية المعتمدة عبر صفحة الدورات — يسعدنا مساعدتك في الاختيار 👇';
  const promo = buildPromo();
  return {
    reply: promo ? `${intro}\n\n${promo}` : intro,
    cards,
    suggestions: ['هل الشهادة معتمدة؟', 'من هم المدربون؟', 'كيف أسجّل؟'],
  };
}

/**
 * Generate an assistant reply.
 * @param {string} userMessage           The latest user message.
 * @param {Array<{role:string,content:string}>} [conversationHistory]  Prior turns.
 * @returns {Promise<{reply:string, suggestions:string[], cards:object[]}>}
 */
async function generateAIResponse(userMessage, conversationHistory = []) {
  const quote = isQuoteIntent(userMessage);          // "عرض سعر" → customer service
  const pricing = !quote && isPricingIntent(userMessage); // "أسعار الدورات" → course cards
  const contact = isContactIntent(userMessage);

  // Demo path (no API key): deterministic, knowledge-driven responses.
  if (!config.aiEnabled) {
    if (quote) return buildQuoteResponse();
    if (pricing) return buildPricingResponse();
    if (contact) return buildContactResponse();
    // Clean, client-approved FAQ answers (no noisy auto-link list).
    const base = await mockResponse(userMessage, conversationHistory);
    return { reply: base.reply, suggestions: base.suggestions, cards: [], contact: null };
  }

  // Claude path.
  const result = await callClaude(userMessage, conversationHistory);
  let { reply, cards } = result;
  let contactCard = null;

  if (pricing) {
    // Guarantee cards + the conversion nudge even if the model skipped them.
    if (!cards.length) cards = knowledgeBase.getCourses(4).map(cardFromItem);
    const promo = buildPromo();
    if (promo && !reply.includes(config.promoCode)) reply = `${reply}\n\n${promo}`;
  }

  if (quote || contact) {
    // Attach the real contact channels as tappable buttons (deterministic).
    contactCard = {
      title: quote ? 'تواصل مع خدمة العملاء' : 'تواصل مع فريق مكعبات',
      actions: buildContactActions(),
    };
  }

  return { reply, cards, contact: contactCard, suggestions: result.suggestions || [] };
}

module.exports = { generateAIResponse, SYSTEM_PROMPT };
