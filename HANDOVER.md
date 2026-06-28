# تسليم ودمج مساعد «نبيه» الذكي في ووردبريس

دليل عملي لتسليم المشروع للعميل ودمج الودجت في موقع ووردبريس (Elementor).

---

## ١) بنية المشروع (ما الذي يُسلَّم)

| المكوّن | الوصف | المكان |
|---|---|---|
| **الواجهة (Widget)** | `public/nabih-assistant.js` + `nabih-assistant.css` + `nabih-avatar.png` | تُحقن في ووردبريس بسطر واحد |
| **الخادم (Backend API)** | Express: `POST /api/nabih-chat` و `GET /api/nabih-featured` | منشور على Vercel |
| **الكود المصدري** | مستودع GitHub | `github.com/Issaalhilali/makapat` |
| **بيانات قابلة للتعديل** | الأسعار، التصنيفات/الأسئلة، الأجوبة | `src/data/` و `src/services/` |

> **مهم:** البروكسي (`server.js` + `src/proxy.js`) هو **أداة تطوير محلية فقط** لمحاكاة الموقع. لا حاجة له في الإنتاج — الودجت يُحقن في ووردبريس الحقيقي ويتصل بـ API على Vercel مباشرةً.

---

## ٢) الدمج في ووردبريس (الخطوات)

### أ) احصل على رابط النشر (Production URL)
من لوحة Vercel ← المشروع ← **Domains** — مثال: `https://makapat.vercel.app`
(هذا الرابط يخدّم الـ API **وملفات الودجت** معاً.)

### ب) ثبّت إضافة حقن الأكواد
في ووردبريس: ثبّت **WPCode** أو **Insert Headers and Footers**.

### ج) الصق هذا السطر في تذييل الموقع (Footer)
```html
<!-- Nabih AI Assistant -->
<script src="https://YOUR-APP.vercel.app/nabih-assistant.js"
        data-nabih-api="https://YOUR-APP.vercel.app" defer></script>
```
- استبدل `YOUR-APP.vercel.app` برابط مشروعك على Vercel.
- ملف الـ CSS والأفاتار **يُحمَّلان تلقائياً** من نفس المجلد — لا حاجة لإضافتهما يدوياً.

> بديل (إن أردت تجنّب أي وميض في التحميل): أضِف قبل السطر السابق:
> ```html
> <link rel="stylesheet" href="https://YOUR-APP.vercel.app/nabih-assistant.css">
> ```

### د) احفظ وافتح الموقع
سيظهر زر «نبيه» أسفل يسار الشاشة. الودجت **معزول بالكامل** (`#nabih-root` + `all: initial`) فلا يتعارض مع قالب ووردبريس/Elementor.

---

## ٣) CORS (مسموح مسبقاً)
الخادم يسمح بالطلبات من: `muk3bat.com`، `www.muk3bat.com`، أي نطاق `*.vercel.app`، و`localhost`.
لو نُشر الموقع على نطاق مختلف، أضِفه في Vercel ← Settings ← **Environment Variables**:
```
ALLOWED_ORIGINS=https://muk3bat.com,https://www.muk3bat.com,https://YOUR-DOMAIN.com
```

---

## ٤) تفعيل ذكاء Claude (اختياري)
بدون مفتاح، يعمل نبيه بالأجوبة المعتمدة (وضع mock) — ممتاز للعرض. لتفعيل ردود Claude الكاملة:
Vercel ← Settings ← Environment Variables:
```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
ANTHROPIC_MODEL=claude-opus-4-8   (اختياري)
```
ثم أعِد النشر (Redeploy).

### بيانات التواصل (تظهر في بطاقة التواصل)
قابلة للتعديل عبر متغيرات البيئة:
```
NABIH_WHATSAPP=https://wa.me/966583905553
NABIH_PHONE=+966583905553
NABIH_PHONE_DISPLAY=0583905553
NABIH_EMAIL=info@muk3bat.com
```

---

## ٥) تسليم الملكية للعميل
1. **GitHub:** Settings ← *Transfer ownership* لحساب العميل (أو دعوته Collaborator).
2. **Vercel:** انقل المشروع لحساب العميل (Project ← Settings ← Transfer)، أو اربط حساب العميل بالمستودع لينشر تلقائياً.
3. **المتغيرات:** سلّم قيم البيئة (راجع `.env.example`) ليعيد ضبطها في حسابه.

---

## ٦) كيف يُحدِّث العميل المحتوى لاحقاً
| التعديل | الملف | الخطوة |
|---|---|---|
| الأسعار/الدورات المميزة | `src/data/pricing-overrides.json` | عدّل ثم `npm run crawl && npm run aggregate` |
| التصنيفات والأسئلة | `src/services/data-aggregator.js` | عدّل ثم `npm run aggregate` |
| نصوص الأجوبة | `src/services/mock-responses.js` | عدّل |
| محتوى الموقع (دورات/سياسات) | يُسحب آلياً | `npm run crawl` |

ثم: `git push origin main` ← Vercel ينشر تلقائياً.

---

## ٧) ملاحظات احترافية
- **تبسيط الإنتاج (اختياري):** يمكن جعل الخادم API-only بإزالة سطر البروكسي في `server.js` (`app.use('/', createProxy(config))`) — أخف وأوضح، فالبروكسي غير مطلوب للإنتاج.
- **إصلاح الشريط السفلي للجوال** كان حقناً عبر البروكسي (تطوير فقط). على الموقع الفعلي، أضِف نفس قواعد `@media` في Elementor ← Custom CSS عند الحاجة (الكود جاهز في `src/proxy.js`).
- **الأداء:** ملفات الودجت ثابتة وقابلة للتخزين المؤقت؛ ولأقصى سرعة يمكن رفعها على CDN بدل Vercel وتغيير الرابط في السطر أعلاه.
