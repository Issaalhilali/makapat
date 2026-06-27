/**
 * Mock response engine for "Nabih" (نبيه).
 * -----------------------------------------
 * Client-approved FAQ answers for the Muk3bat training center (مركز مكعبات
 * للتدريب). Used when no ANTHROPIC_API_KEY is set; the Claude path is given the
 * same facts via the system prompt so both stay consistent. Contact/quote
 * intents are handled in ai-service (they render the contact-buttons card).
 */

// Intent rules evaluated in order; first keyword hit wins. Specific → general.
const INTENTS = [
  {
    id: 'greeting',
    keywords: ['مرحبا', 'السلام', 'هلا', 'اهلا', 'أهلا', 'صباح', 'مساء', 'hi', 'hello', 'hey'],
    reply:
      'أهلاً وسهلاً بك في مركز مكعبات للتدريب! 👋 أنا نبيه، مساعدك الذكي. كيف أقدر أساعدك؟ تقدر تسألني عن التسجيل، الشهادات، المجالات التدريبية، خدمات الشركات، أو التواصل مع خدمة العملاء.',
    suggestions: ['كيف أسجل في دورة؟', 'ما المجالات التدريبية؟', 'تواصل معنا'],
  },
  {
    id: 'register',
    keywords: ['اسجل', 'أسجل', 'التسجيل', 'تسجيل', 'كيف اسجل', 'التحاق', 'الالتحاق', 'احجز', 'register', 'enroll'],
    reply:
      'يمكنك التسجيل مباشرة عبر الموقع الإلكتروني أو التواصل معنا عبر الواتساب. 📝',
    suggestions: ['ما المجالات التدريبية؟', 'هل الشهادات معتمدة؟', 'تواصل معنا'],
  },
  {
    id: 'verify_cert',
    keywords: ['تاكد', 'أتأكد', 'اتأكد', 'صحة الشهاده', 'صحه الشهاده', 'تحقق', 'توثيق', 'verify'],
    reply:
      'يمكن التحقق من الشهادة عبر نظام التحقق الإلكتروني المخصص لذلك. 🔎',
    suggestions: ['هل الشهادات تصدر إلكترونياً؟', 'كيف أسجل في دورة؟'],
  },
  {
    id: 'cert_electronic',
    keywords: ['تصدر', 'الكترونيا', 'إلكترونيا', 'الكتروني', 'إلكتروني', 'رقميه', 'رقمية', 'شهاده الكترونيه'],
    reply:
      'نعم، يتم إصدار الشهادات إلكترونياً بعد استيفاء متطلبات البرنامج التدريبي. ✅',
    suggestions: ['كيف أتأكد من صحة الشهادة؟', 'كيف أسجل في دورة؟'],
  },
  {
    id: 'accreditation',
    keywords: ['معتمد', 'معتمده', 'اعتماد', 'مرخص', 'موثق', 'رسمي', 'tvtc', 'nelc', 'scfhs'],
    reply:
      'نعم ✅ برامجنا معتمدة من الجهات الرسمية: المؤسسة العامة للتدريب التقني والمهني (TVTC)، والمركز الوطني للتعليم الإلكتروني (NELC)، والهيئة السعودية للتخصصات الصحية (SCFHS).',
    suggestions: ['هل الشهادات تصدر إلكترونياً؟', 'كيف أتأكد من صحة الشهادة؟'],
  },
  {
    id: 'custom_program',
    keywords: ['تصميم', 'برنامج خاص', 'برنامج تدريبي خاص', 'مخصص', 'حسب احتياج', 'لجهتنا', 'تفصيل', 'custom program'],
    reply:
      'نعم، نقوم بتصميم برامج تدريبية مخصصة وفق أهداف ومتطلبات الجهة. 🎯',
    suggestions: ['هل تقدمون دورات للشركات؟', 'كيف أحصل على عرض سعر؟', 'تواصل معنا'],
  },
  {
    id: 'corporate',
    keywords: ['شركات', 'شركه', 'جهات', 'حكوميه', 'حكومي', 'مؤسسات', 'منشاه', 'منشأه', 'قطاع', 'corporate', 'b2b'],
    reply:
      'نعم، نقدم حلولاً تدريبية مخصصة للشركات والقطاعين العام والخاص والقطاع غير الربحي. 🏢',
    suggestions: ['هل يمكن تصميم برنامج خاص؟', 'كيف أحصل على عرض سعر؟', 'تواصل معنا'],
  },
  {
    id: 'delivery_mode',
    keywords: ['حضوري', 'حضوريا', 'حضورياً', 'عن بعد', 'عن بُعد', 'اونلاين', 'أونلاين', 'عن طريق الانترنت', 'remote', 'online'],
    reply:
      'نعم، نوفّر البرامج التدريبية حضورياً وعن بُعد. 🏫💻',
    suggestions: ['كيف أسجل في دورة؟', 'ما المجالات التدريبية؟'],
  },
  {
    id: 'fields',
    keywords: ['مجالات', 'المجالات', 'تخصصات', 'انواع الدورات', 'أنواع الدورات', 'ايش الدورات', 'وش الدورات', 'fields', 'topics'],
    reply:
      'نقدّم برامج في: التقنية والتحول الرقمي، تطوير الأعمال والمبيعات، الموارد البشرية والتشغيل، القيادة والإدارة، المهارات الشخصية، والمهارات الصحية — والعديد من المجالات المهنية الأخرى. 🧩',
    suggestions: ['ريادة الأعمال', 'كيف أسجل في دورة؟', 'هل الشهادات معتمدة؟'],
  },
  {
    id: 'entrepreneurship',
    keywords: ['ريادة', 'رياده', 'ريادي', 'مشروع', 'مشاريع', 'رواد الاعمال', 'رواد الأعمال', 'startup'],
    reply:
      'في مسار ريادة الأعمال نساعدك على تطوير أفكارك ومهاراتك الريادية وإطلاق مشروعك بثقة واحترافية. 💡',
    suggestions: ['ما المجالات التدريبية؟', 'كيف أسجل في دورة؟'],
  },
  {
    id: 'courses',
    keywords: ['دوره', 'دورة', 'دورات', 'برامج', 'برنامج', 'تدريب', 'مسار', 'course'],
    reply:
      'نقدّم دورات تأهيلية وتطويرية معتمدة في مجالات متنوعة. أخبرني بمجالك أو تصفّح الدورات وسأساعدك في اختيار المناسب. 🧩',
    suggestions: ['ما المجالات التدريبية؟', 'أسعار الدورات', 'كيف أسجل في دورة؟'],
  },
  {
    id: 'trainers',
    keywords: ['مدرب', 'مدربين', 'مدربون', 'محاضر', 'دكتور', 'استاذ', 'trainer'],
    reply:
      'يضم المركز نخبة من المدربين الأكاديميين والمهنيين المتخصصين في مختلف المجالات التطويرية. 👨‍🏫',
    suggestions: ['ما المجالات التدريبية؟', 'كيف أسجل في دورة؟'],
  },
  {
    id: 'thanks',
    keywords: ['شكرا', 'شكراً', 'مشكور', 'يعطيك', 'تسلم', 'thanks', 'thank you'],
    reply: 'العفو! 🌟 سعيد بخدمتك دائماً. إذا احتجت أي شيء آخر، أنا هنا في أي وقت.',
    suggestions: ['كيف أسجل في دورة؟', 'ما المجالات التدريبية؟'],
  },
];

const FALLBACK = {
  reply:
    'سؤال ممتاز! 🤔 أقدر أساعدك في: التسجيل والشهادات، المجالات التدريبية، خدمات الشركات والجهات، تصميم برامج مخصصة، وطرق الحضور (حضوري/عن بُعد). ممكن توضّح لي أكثر وش تحتاج؟',
  suggestions: ['كيف أسجل في دورة؟', 'ما المجالات التدريبية؟', 'تواصل معنا'],
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
  const latency = Math.min(2000, 500 + result.reply.length * 10);
  await new Promise((resolve) => setTimeout(resolve, latency));
  return result;
}

module.exports = { mockResponse };
