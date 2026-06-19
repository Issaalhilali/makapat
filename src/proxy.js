const { createProxyMiddleware } = require('http-proxy-middleware');

const INJECT_TAG = '<script src="/nabih-assistant.js" defer></script>';

function createProxy(config) {
  const TARGET = config.proxyTarget || 'https://muk3bat.com';

  return createProxyMiddleware({
    target: TARGET,
    changeOrigin: true,
    secure: false,
    followRedirects: true,
    selfHandleResponse: true, // نتحكم بالاستجابة لحقن السكريبت

    onProxyReq(proxyReq, req, res) {
      // نطلب من سيرفر مكعبات نص صريح تماماً بدون أي ضغط لمنع الانهيار
      proxyReq.setHeader('accept-encoding', 'identity');
      proxyReq.setHeader('host', new URL(TARGET).host);
    },

    onProxyRes(proxyRes, req, res) {
      const contentType = String(proxyRes.headers['content-type'] || '');
      
      // ننسخ الهيدرز الأصلية ونحذف القيود
      const headers = { ...proxyRes.headers };
      delete headers['content-security-policy'];
      delete headers['content-security-policy-report-only'];
      delete headers['x-frame-options'];
      delete headers['content-length']; // فيرسيل سيعيد حسابه تلقائياً

      // إذا كانت الصفحة HTML نقوم بحقن الودجت ببساطة
      if (contentType.includes('text/html')) {
        let body = '';
        proxyRes.on('data', (chunk) => {
          body += chunk.toString('utf8');
        });
        proxyRes.on('end', () => {
          // حقن سكريبت نبيه قبل إغلاق الـ body
          if (/<\/body>/i.test(body)) {
            body = body.replace(/<\/body>/i, `${INJECT_TAG}\n</body>`);
          } else {
            body += `\n${INJECT_TAG}`;
          }
          res.writeHead(proxyRes.statusCode, headers);
          res.end(body);
        });
      } else {
        // أي ملفات أخرى (صور، CSS، جافاسكريبت) مررها مباشرة كما هي
        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res);
      }
    },

    onError(err, req, res) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Proxy Error');
    }
  });
}

module.exports = { createProxy };