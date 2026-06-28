/* =========================================================================
   Nabih (نبيه) — AI Smart Assistant for Muk3bat (Salla store)
   Vanilla JS, zero dependencies. Self-contained widget that mounts itself
   into a dedicated #nabih-root node so it never collides with the theme.

   Built to coexist with Salla's lazy-loaded, SPA-like DOM:
   - waits for <body> if the script somehow runs early
   - re-mounts itself if a Salla route change wipes the node
   ========================================================================= */
(function () {
  'use strict';

  // Guard against double-injection (e.g. if Salla re-renders the head).
  if (window.__NABIH_LOADED__) return;
  window.__NABIH_LOADED__ = true;

  var ROOT_ID = 'nabih-root';

  /* ---- Runtime configuration -------------------------------------------
     The API host is resolved at runtime so the same bundled file works both
     on the local dev proxy (same origin) and in production (CDN file + a
     separate backend), with no hardcoded localhost. Resolution order:
       1. window.NABIH_CONFIG.apiBaseUrl   (set before this script loads)
       2. data-nabih-api="..."             (attribute on this <script> tag)
       3. same origin                      (local dev proxy)
  ---------------------------------------------------------------------- */
  // With defer, document.currentScript is null, so locate our own tag by src.
  var SCRIPT_EL =
    document.currentScript ||
    document.querySelector('script[data-nabih-api]') ||
    document.querySelector('script[src*="nabih-assistant.js"]');

  function trimSlash(s) {
    return String(s || '').replace(/\/+$/, '');
  }

  function resolveApiBase() {
    if (window.NABIH_CONFIG && window.NABIH_CONFIG.apiBaseUrl) {
      return trimSlash(window.NABIH_CONFIG.apiBaseUrl);
    }
    if (SCRIPT_EL && SCRIPT_EL.getAttribute('data-nabih-api')) {
      return trimSlash(SCRIPT_EL.getAttribute('data-nabih-api'));
    }
    return ''; // same origin
  }

  // Derive a sibling asset URL from this script's own src, so hosting the whole
  // bundle on a CDN works with a single <script> tag.
  function resolveSibling(filename, configKey, fallback) {
    if (configKey && window.NABIH_CONFIG && window.NABIH_CONFIG[configKey]) {
      return window.NABIH_CONFIG[configKey];
    }
    if (SCRIPT_EL && SCRIPT_EL.src) {
      return SCRIPT_EL.src.replace(/nabih-assistant\.js(\?.*)?$/, filename);
    }
    return fallback;
  }

  function resolveCssHref() {
    return resolveSibling('nabih-assistant.css', 'cssUrl', '/nabih-assistant.css');
  }

  var API_BASE = resolveApiBase();
  var API_ENDPOINT = API_BASE + '/api/nabih-chat';
  var FEATURED_ENDPOINT = API_BASE + '/api/nabih-featured';
  // Optimized, pre-cropped avatar (≈146 KB vs 1.8 MB raw) for fast loading.
  var AVATAR_HREF = resolveSibling('nabih-avatar.png', 'avatarUrl', '/nabih-avatar.png');
  var CSS_HREF = resolveCssHref();

  // Rolling conversation history sent to the backend for context.
  var history = [];
  var MAX_HISTORY = 10;

  /* ---- Inline SVG icons (no external requests) -------------------------- */
  var ICONS = {
    chat:
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M12 3C6.48 3 2 6.94 2 11.5c0 2.3 1.17 4.37 3.05 5.86-.13 1.2-.6 2.3-1.36 3.18-.2.23-.25.55-.13.83.12.28.4.46.7.46 1.9 0 3.6-.7 4.9-1.85 1.04.3 2.16.47 3.34.47 5.52 0 10-3.94 10-8.95S17.52 3 12 3z" fill="currentColor"/></svg>',
    bot:
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M12 2a1 1 0 0 1 1 1v1h3a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h3V3a1 1 0 0 1 1-1zm-3 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM7 18a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-.5H7V18z" fill="currentColor"/></svg>',
    send:
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a1 1 0 0 0-1.4.92V9.5c0 .5.37.92.87.99l11.13 1.51-11.13 1.51a1 1 0 0 0-.87.99v4.98a1 1 0 0 0 1.4.92z" fill="currentColor"/></svg>',
  };

  var WELCOME =
    'أهلاً بك في مركز مكعبات للتدريب! 🧩 أنا <b>نبيه</b>، مساعدك الذكي. اسألني عن الدورات، الأسعار، الاعتماد، أو أي شيء آخر وسأساعدك فوراً.';
  var WELCOME_CHIPS = [
    'كيف أسجل في دورة؟',
    'هل الشهادات تصدر إلكترونياً؟',
    'حضوري أو عن بُعد؟',
    'هل تقدمون دورات للشركات؟',
    'كيف أحصل على عرض سعر؟',
    'تواصل معنا',
  ];

  var els = {}; // cached element refs
  var isOpen = false;
  var isSending = false;

  /* ---- Mounting --------------------------------------------------------- */
  function ensureStylesheet() {
    if (document.getElementById('nabih-css')) return;
    var link = document.createElement('link');
    link.id = 'nabih-css';
    link.rel = 'stylesheet';
    link.href = CSS_HREF;
    document.head.appendChild(link);
  }

  function build() {
    var root = document.createElement('div');
    root.id = ROOT_ID;

    // CSS-masked avatar: a circular, overflow-hidden wrapper that crops the raw
    // asset down to the inner badge (see .nbh-avatar-mask in the stylesheet).
    var avatar =
      '<span class="nbh-avatar-mask">' +
      '<img src="' + AVATAR_HREF + '" alt="نبيه" draggable="false" />' +
      '</span>';

    root.innerHTML =
      // Floating launcher: a circular avatar that briefly expands into a pill
      // ("اسأل نبيه ✦") to invite engagement, then collapses back to a circle.
      '<button class="nbh-fab" aria-label="افتح المساعد الذكي نبيه — اسأل نبيه">' +
        '<span class="nbh-badge"></span>' +
        '<span class="nbh-fab-avatar">' + avatar + '</span>' +
        '<span class="nbh-fab-label">اسأل نبيه ✦</span>' +
      '</button>' +
      // Chat window
      '<section class="nbh-window" role="dialog" aria-label="المساعد الذكي نبيه">' +
        '<header class="nbh-header">' +
          '<div class="nbh-avatar">' + avatar + '</div>' +
          '<div class="nbh-htext">' +
            '<h3>المساعد الذكي نبيه</h3>' +
            '<div class="nbh-status"><span class="nbh-dot"></span> متصل الآن</div>' +
          '</div>' +
          '<button class="nbh-close" aria-label="إغلاق">&times;</button>' +
        '</header>' +
        '<div class="nbh-messages" id="nbh-messages"></div>' +
        '<form class="nbh-input">' +
          '<input type="text" id="nbh-text" placeholder="اكتب رسالتك هنا..." autocomplete="off" />' +
          '<button type="submit" class="nbh-send" aria-label="إرسال">' + ICONS.send + '</button>' +
        '</form>' +
        '<div class="nbh-foot">مدعوم بواسطة <b>Nabih AI</b> ✦ عرض تجريبي</div>' +
      '</section>';

    document.body.appendChild(root);

    els.root = root;
    els.fab = root.querySelector('.nbh-fab');
    els.window = root.querySelector('.nbh-window');
    els.close = root.querySelector('.nbh-close');
    els.messages = root.querySelector('#nbh-messages');
    els.form = root.querySelector('.nbh-input');
    els.input = root.querySelector('#nbh-text');
    els.send = root.querySelector('.nbh-send');

    bindEvents();
    renderWelcome();
    scheduleLauncherPill();
  }

  function bindEvents() {
    els.fab.addEventListener('click', toggle);
    els.close.addEventListener('click', toggle);
    els.form.addEventListener('submit', function (e) {
      e.preventDefault();
      send(els.input.value);
    });
  }

  // Launcher-pill attention pattern: expand to a labelled pill shortly after
  // load, then auto-collapse back to a circle so it never nags.
  var pillTimers = [];
  function scheduleLauncherPill() {
    pillTimers.push(setTimeout(function () {
      if (!isOpen) els.fab.classList.add('nbh-fab-expanded');
    }, 1200));
    pillTimers.push(setTimeout(collapseLauncher, 6000)); // collapse after ~4.8s open
  }
  function collapseLauncher() {
    pillTimers.forEach(clearTimeout);
    pillTimers = [];
    if (els.fab) els.fab.classList.remove('nbh-fab-expanded');
  }

  /* ---- Open / close ----------------------------------------------------- */
  function toggle() {
    isOpen = !isOpen;
    els.window.classList.toggle('nbh-open', isOpen);
    if (isOpen) {
      collapseLauncher(); // settle to a circle once the chat is open
      // Desktop only — avoid popping the mobile keyboard the moment it opens.
      if (window.innerWidth > 1023) {
        setTimeout(function () { els.input.focus(); }, 280);
      }
      scrollToBottom();
    }
  }

  /* ---- Rendering -------------------------------------------------------- */
  function renderWelcome() {
    addMessage(WELCOME, 'bot');
    // Proactively pull featured course snippets to fill the space and drive
    // engagement immediately. Chips follow once the feed resolves (or fails).
    fetch(FEATURED_ENDPOINT)
      .then(function (r) { return r.json(); })
      .then(function (data) { addSnippets(data && data.snippets); })
      .catch(function () { addSuggestions(WELCOME_CHIPS); /* fallback if feed fails */ })
      .then(function () {
        // Land at the top so the greeting + categories are visible on open.
        requestAnimationFrame(function () { els.messages.scrollTop = 0; });
      });
  }

  // Welcome feed: category cards that expand (accordion) into their FAQ
  // questions. Categories with a `query` (no questions) answer directly.
  function addSnippets(list) {
    if (!list || !list.length) return;
    var section = document.createElement('div');
    section.className = 'nbh-snippets';

    var title = document.createElement('div');
    title.className = 'nbh-snippets-title';
    title.textContent = 'كيف أقدر أساعدك؟';
    section.appendChild(title);

    var grid = document.createElement('div');
    grid.className = 'nbh-snippet-grid';

    list.forEach(function (s) {
      if (!s || !s.title) return;
      var hasQ = s.questions && s.questions.length;

      var item = document.createElement('div');
      item.className = 'nbh-snippet-item';

      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'nbh-snippet';

      // icon first (right in RTL), text after (left)
      var icon = document.createElement('span');
      icon.className = 'nbh-snippet-icon';
      icon.textContent = s.icon || '🧩';
      card.appendChild(icon);

      var body = document.createElement('span');
      body.className = 'nbh-snippet-body';
      var t = document.createElement('span');
      t.className = 'nbh-snippet-title';
      t.textContent = s.title;
      body.appendChild(t);
      if (s.benefit) {
        var b = document.createElement('span');
        b.className = 'nbh-snippet-benefit';
        b.textContent = s.benefit;
        body.appendChild(b);
      }
      card.appendChild(body);

      if (hasQ) {
        var chev = document.createElement('span');
        chev.className = 'nbh-snippet-chev';
        chev.textContent = '‹';
        card.appendChild(chev);
      }
      item.appendChild(card);

      if (hasQ) {
        var panel = document.createElement('div');
        panel.className = 'nbh-snippet-questions';
        s.questions.forEach(function (q) {
          var qb = document.createElement('button');
          qb.type = 'button';
          qb.className = 'nbh-q';
          qb.textContent = q;
          qb.addEventListener('click', function (e) {
            e.stopPropagation();
            send(q);
          });
          panel.appendChild(qb);
        });
        item.appendChild(panel);

        card.addEventListener('click', function () {
          var willOpen = !item.classList.contains('nbh-open');
          // accordion: only one category open at a time
          var open = grid.querySelectorAll('.nbh-snippet-item.nbh-open');
          for (var i = 0; i < open.length; i++) open[i].classList.remove('nbh-open');
          if (willOpen) {
            item.classList.add('nbh-open');
            setTimeout(function () { item.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 80);
          }
        });
      } else {
        card.addEventListener('click', function () { send(s.query || s.title); });
      }

      grid.appendChild(item);
    });

    section.appendChild(grid);
    els.messages.appendChild(section);
    scrollToBottom();
  }

  function addMessage(html, who) {
    var msg = document.createElement('div');
    msg.className = 'nbh-msg nbh-' + who;
    msg.innerHTML = html;
    els.messages.appendChild(msg);
    scrollToBottom();
    return msg;
  }

  function addSuggestions(list) {
    if (!list || !list.length) return;
    var wrap = document.createElement('div');
    wrap.className = 'nbh-suggestions';
    list.forEach(function (text) {
      var chip = document.createElement('button');
      chip.className = 'nbh-chip';
      chip.type = 'button';
      chip.textContent = text;
      chip.addEventListener('click', function () {
        wrap.remove();
        send(text);
      });
      wrap.appendChild(chip);
    });
    els.messages.appendChild(wrap);
    scrollToBottom();
  }

  // Render structured Course/Product cards inside the chat scroll area.
  function addCards(cards) {
    if (!cards || !cards.length) return;
    var wrap = document.createElement('div');
    wrap.className = 'nbh-cards';

    cards.forEach(function (card) {
      if (!card || !card.title || !card.url) return;
      if (!/^https?:\/\//i.test(card.url)) return; // safety: links only

      var el = document.createElement('div');
      el.className = 'nbh-card';

      if (card.badge) {
        var ribbon = document.createElement('span');
        ribbon.className = 'nbh-card-ribbon';
        ribbon.textContent = card.badge;
        el.appendChild(ribbon);
      }

      var head = document.createElement('div');
      head.className = 'nbh-card-head';

      var title = document.createElement('h4');
      title.className = 'nbh-card-title';
      title.textContent = card.title;
      head.appendChild(title);

      var price = document.createElement('span');
      if (card.price) {
        price.className = 'nbh-card-price';
        price.textContent = toArabicDigits(card.price);
      } else {
        price.className = 'nbh-card-price nbh-card-price-quote';
        price.textContent = 'اطلب عرض السعر';
      }
      head.appendChild(price);
      el.appendChild(head);

      // 5-star rating layout (gold)
      var rating = typeof card.rating === 'number' && card.rating > 0 ? card.rating : 5;
      if (rating > 5) rating = 5;
      var stars = document.createElement('div');
      stars.className = 'nbh-card-stars';
      var full = Math.round(rating);
      for (var s = 0; s < 5; s++) {
        var star = document.createElement('span');
        star.className = 'nbh-star' + (s < full ? '' : ' nbh-star-empty');
        star.textContent = '★';
        stars.appendChild(star);
      }
      var rval = document.createElement('span');
      rval.className = 'nbh-card-rating-val';
      rval.textContent = toArabicDigits(rating.toFixed(1)).replace('.', '٫');
      stars.appendChild(rval);
      el.appendChild(stars);

      if (card.description) {
        var desc = document.createElement('p');
        desc.className = 'nbh-card-desc';
        desc.textContent = card.description;
        el.appendChild(desc);
      }

      var cta = document.createElement('a');
      cta.className = 'nbh-card-cta';
      cta.href = card.url;
      cta.target = '_blank';
      cta.rel = 'noopener noreferrer';
      cta.textContent = card.cta || 'سجل الآن 🚀';
      el.appendChild(cta);

      wrap.appendChild(el);
    });

    if (wrap.children.length) {
      els.messages.appendChild(wrap);
      scrollToBottom();
    }
  }

  // Render a contact card with tappable channel buttons (WhatsApp/call/email/page).
  function addContact(contact) {
    if (!contact || !contact.actions || !contact.actions.length) return;
    var ICONS_C = { whatsapp: '💬', call: '📞', email: '✉️', page: '🔗' };

    var wrap = document.createElement('div');
    wrap.className = 'nbh-contact';

    if (contact.title) {
      var t = document.createElement('div');
      t.className = 'nbh-contact-title';
      t.textContent = contact.title;
      wrap.appendChild(t);
    }

    var grid = document.createElement('div');
    grid.className = 'nbh-contact-actions';

    contact.actions.forEach(function (a) {
      if (!a || !a.url) return;
      if (!/^(https?:|tel:|mailto:)/i.test(a.url)) return; // safety: known schemes only
      var btn = document.createElement('a');
      btn.className = 'nbh-contact-btn nbh-contact-' + (a.type || 'page');
      btn.href = a.url;
      if (/^https?:/i.test(a.url)) { btn.target = '_blank'; btn.rel = 'noopener noreferrer'; }

      var ic = document.createElement('span');
      ic.className = 'nbh-contact-ic';
      ic.textContent = ICONS_C[a.type] || '🔗';
      btn.appendChild(ic);

      var lbl = document.createElement('span');
      lbl.className = 'nbh-contact-lbl';
      lbl.textContent = a.label || a.type;
      btn.appendChild(lbl);

      if (a.display) {
        var sub = document.createElement('span');
        sub.className = 'nbh-contact-sub';
        // Arabic-Indic only for phone numbers; keep emails/URLs as-is (Latin).
        sub.textContent =
          a.type === 'call' || a.type === 'whatsapp' ? toArabicDigits(a.display) : a.display;
        btn.appendChild(sub);
      }
      grid.appendChild(btn);
    });

    wrap.appendChild(grid);
    els.messages.appendChild(wrap);
    scrollToBottom();
  }

  function showTyping() {
    var t = document.createElement('div');
    t.className = 'nbh-typing';
    t.innerHTML = '<span></span><span></span><span></span>';
    els.messages.appendChild(t);
    scrollToBottom();
    return t;
  }

  function scrollToBottom() {
    requestAnimationFrame(function () {
      els.messages.scrollTop = els.messages.scrollHeight;
    });
  }

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // Localize Western digits to Arabic-Indic (499 → ٤٩٩). Keeps punctuation
  // intact so the currency abbreviation "ر.س" is preserved.
  function toArabicDigits(str) {
    var map = '٠١٢٣٤٥٦٧٨٩';
    return String(str).replace(/[0-9]/g, function (d) { return map[+d]; });
  }

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Safe, minimal markdown renderer for bot replies: escapes everything first,
  // then promotes markdown links [text](http(s)://...), **bold**, and newlines.
  // Only http/https links are emitted, so it cannot inject scripts.
  function renderRich(raw) {
    function inline(s) {
      return escapeHtml(s)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
    }
    var out = '';
    var last = 0;
    var re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    var m;
    while ((m = re.exec(raw)) !== null) {
      out += inline(raw.slice(last, m.index));
      out +=
        '<a class="nbh-link" href="' +
        escapeAttr(m[2]) +
        '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(m[1]) +
        '</a>';
      last = re.lastIndex;
    }
    out += inline(raw.slice(last));
    return out;
  }

  /* ---- Sending ---------------------------------------------------------- */
  function send(raw) {
    var text = (raw || '').trim();
    if (!text || isSending) return;

    isSending = true;
    els.send.disabled = true;
    els.input.value = '';

    // Remove any lingering suggestion chips from the previous turn.
    var stale = els.messages.querySelectorAll('.nbh-suggestions');
    stale.forEach(function (n) { n.remove(); });

    addMessage(escapeHtml(text), 'user');
    var typing = showTyping();

    fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: history.slice(-MAX_HISTORY) }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        typing.remove();
        var reply = data.reply || '...';
        addMessage(renderRich(reply), 'bot');
        addCards(data.cards);
        addContact(data.contact);
        addSuggestions(data.suggestions);
        // Record the turn for follow-up context.
        history.push({ role: 'user', content: text });
        history.push({ role: 'assistant', content: reply });
        if (history.length > MAX_HISTORY * 2) {
          history = history.slice(-MAX_HISTORY * 2);
        }
      })
      .catch(function () {
        typing.remove();
        addMessage('تعذّر الاتصال بالمساعد حالياً، يرجى المحاولة مرة أخرى. 🙏', 'bot');
      })
      .finally(function () {
        isSending = false;
        els.send.disabled = false;
        // Only auto-focus on desktop. On mobile/tablet this would force the
        // on-screen keyboard to jump up in the user's face after every reply.
        if (window.innerWidth > 1023) els.input.focus();
      });
  }

  /* ---- Boot + resilience against Salla SPA re-renders ------------------- */
  function mount() {
    if (document.getElementById(ROOT_ID)) return; // already present
    ensureStylesheet();
    build();
  }

  function boot() {
    mount();
    // Salla can swap large DOM sections on navigation; if our root gets
    // removed, quietly re-mount it. Cheap, debounced observer.
    var pending = false;
    var observer = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        if (!document.getElementById(ROOT_ID)) {
          // Preserve open state across a re-mount.
          var wasOpen = isOpen;
          mount();
          if (wasOpen) toggle();
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: false });
  }

  if (document.body) {
    boot();
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
})();
