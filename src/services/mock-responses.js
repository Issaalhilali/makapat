/**
 * Mock response engine for "Nabih" (نبيه).
 * -----------------------------------------
 * Dependency-free intent matching tuned for the real Muk3bat training center
 * (مركز مكعبات للتدريب). Used automatically when no ANTHROPIC_API_KEY is set,
 * so the widget stays functional for local development and client demos.
 *
 * Facts here are accurate to the actual site (a Saudi training center, not an
 * e-commerce store). Relevant deep-links are appended separately by
 * ai-service.enrichWithLinks() from the crawled knowledge base.
 */

// Intent rules are evaluated in order; first keyword hit wins.
const INTENTS = [
  {
    id: 'greeting',
    keywords: ['مرحبا', 'السلام', 'هلا', 'اهلا', 'أهلا', 'صباح', 'مساء', 'hi', 'hello', 'hey'],
    reply:
      'أهلاً وسهلاً بك في مركز مكعبات للتدريب! 👋 أنا نبيه، مساعدك الذكي. كيف أقدر أساعدك؟ تقدر تسألني عن الدورات، الاعتماد والشهادات، المدربين، التسجيل، أو السياسات.',
    suggestions: ['ما هي الدورات المتاحة؟', 'هل الشهادة معتمدة؟', 'كيف أسجّل؟'],
  },
  {
    id: 'courses',
    keywords: ['دورة', 'دورات', 'برنامج', 'برامج', 'مسار', 'تدريب', 'مكعب', 'مكعبات', 'تطوير', 'course'],
    reply:
      'نقدّم في مكعبات دورات تأهيلية وتطويرية معتمدة، موزّعة على ستة "مكعبات" تخصصية لتسهيل اختيار ما يناسب مجالك واحتياجك التدريبي. تصفّح القائمة الكاملة عبر الروابط أدناه. 🧩',
    suggestions: ['هل الشهادة معتمدة؟', 'من هم المدربون؟', 'كيف أسجّل؟'],
  },
  {
    id: 'accreditation',
    keywords: ['معتمد', 'معتمده', 'اعتماد', 'شهاده', 'شهادة', 'مرخص', 'tvtc', 'موثق', 'رسمي'],
    reply:
      'نعم ✅ دوراتنا معتمدة من المؤسسة العامة للتدريب التقني والمهني (TVTC) ومرخّصة من المركز الوطني للتعليم الإلكتروني، وتحصل على شهادة رسمية. تفاصيل أكثر في الروابط أدناه.',
    suggestions: ['ما هي الدورات المتاحة؟', 'كيف أسجّل؟'],
  },
  {
    id: 'trainers',
    keywords: ['مدرب', 'مدربين', 'مدربون', 'محاضر', 'دكتور', 'استاذ', 'trainer'],
    reply:
      'يضم المركز نخبة من المدربين الأكاديميين والمهنيين المتخصصين في مختلف المجالات التطويرية. تقدر تتعرّف على المدربين وخبراتهم عبر الروابط أدناه. 👨‍🏫',
    suggestions: ['ما هي الدورات المتاحة؟', 'انضم كمدرب'],
  },
  {
    id: 'join',
    keywords: ['تسجيل', 'اسجل', 'أسجل', 'انضمام', 'انضم', 'اشترك', 'كمدرب', 'كشريك', 'register', 'join'],
    reply:
      'يسعدنا انضمامك! 🤝 يمكنك التسجيل في الدورات أو الانضمام كمدرب أو كشريك من خلال الصفحات المخصصة لذلك. تجد الروابط المباشرة أدناه.',
    suggestions: ['انضم كمدرب', 'انضم كشريك', 'تواصل معنا'],
  },
  {
    id: 'policies',
    keywords: ['سياسة', 'سياسات', 'خصوصيه', 'خصوصية', 'احكام', 'أحكام', 'حضور', 'نزاهة', 'ملكية', 'دعم', 'استرجاع', 'إرجاع'],
    reply:
      'لدينا سياسات وأحكام واضحة تشمل الخصوصية، الحضور الافتراضي، النزاهة الأكاديمية، الملكية الفكرية، والدعم الفني والتعليمي. اطّلع على السياسة التي تهمّك عبر الروابط أدناه. 📋',
    suggestions: ['سياسة الخصوصية', 'سياسة الحضور', 'تواصل معنا'],
  },
  {
    id: 'partners',
    keywords: ['شراكة', 'شراكات', 'شريك', 'شركاء', 'تعاون', 'partner'],
    reply:
      'نفخر بشراكاتنا مع جهات رائدة في القطاع. تقدر تتعرّف على شركائنا وشركاء النجاح، أو تقدّم طلب شراكة، عبر الروابط أدناه. 🌟',
    suggestions: ['انضم كشريك', 'عن المركز'],
  },
  {
    id: 'contact',
    keywords: ['تواصل', 'اتصال', 'رقم', 'جوال', 'واتساب', 'ايميل', 'بريد', 'استفسار', 'contact', 'support'],
    reply:
      'فريقنا جاهز لمساعدتك 📞 تقدر تتواصل معنا عبر صفحة "تواصل معنا" ووسائل التواصل الاجتماعي. تجد الرابط أدناه.',
    suggestions: ['ما هي الدورات المتاحة؟', 'عن المركز'],
  },
  {
    id: 'about',
    keywords: ['عن المركز', 'من انتم', 'من أنتم', 'تعريف', 'الرؤية', 'رؤية', 'about'],
    reply:
      'مركز مكعبات للتدريب مركز سعودي متخصص في الدورات التأهيلية والتطويرية المعتمدة، منظّم في ستة مكعبات تخصصية لخدمة الأفراد والمنشآت. اقرأ المزيد عبر الرابط أدناه.',
    suggestions: ['ما هي الدورات المتاحة؟', 'من هم المدربون؟'],
  },
  {
    id: 'thanks',
    keywords: ['شكرا', 'شكراً', 'مشكور', 'يعطيك', 'تسلم', 'thanks', 'thank you'],
    reply: 'العفو! 🌟 سعيد بخدمتك دائماً. إذا احتجت أي شيء آخر، أنا هنا في أي وقت.',
    suggestions: ['ما هي الدورات المتاحة؟', 'هل الشهادة معتمدة؟'],
  },
];

const FALLBACK = {
  reply:
    'سؤال ممتاز! 🤔 بصفتي مساعد مركز مكعبات للتدريب، أقدر أساعدك في كل ما يخص الدورات المعتمدة، الشهادات والاعتماد، المدربين، التسجيل والانضمام، الشراكات، والسياسات. ممكن توضّح لي أكثر وش تحتاج؟',
  suggestions: ['ما هي الدورات المتاحة؟', 'هل الشهادة معتمدة؟', 'من هم المدربون؟'],
};

function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْ]/g, ''); // strip tashkeel
}

function match(message) {
  const text = normalize(message);
  for (const intent of INTENTS) {
    if (intent.keywords.some((kw) => text.includes(normalize(kw)))) {
      return { reply: intent.reply, suggestions: intent.suggestions };
    }
  }
  return { reply: FALLBACK.reply, suggestions: FALLBACK.suggestions };
}

/**
 * Mock implementation of the AI contract. Mirrors generateAIResponse():
 * resolves to { reply, suggestions } and simulates realistic typing latency.
 */
async function mockResponse(userMessage /*, conversationHistory */) {
  const result = match(userMessage);
  const latency = Math.min(2200, 600 + result.reply.length * 12);
  await new Promise((resolve) => setTimeout(resolve, latency));
  return result;
}

module.exports = { mockResponse };
