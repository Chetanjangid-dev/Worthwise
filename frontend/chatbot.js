/* ==========================================================================
   Worthwise Assistant — custom chatbot (no third-party service, no iframe)

   What it does
   - Sends every question to the backend (POST /api/chat). The backend owns the
     Worthwise knowledge base: it returns the exact answer when it has one, and
     otherwise asks the LLM using the retrieved knowledge-base data as context.
   - When the user is logged in it can also answer "my ..." questions using
     their own data (financial health, profile numbers, goals) through the
     app's existing SpendWiseAPI (read in the browser, never sent to the LLM).
   - Understands English and Hinglish questions.

   To teach the bot something new, add an entry to
   src/main/resources/chatbot-knowledge.json in the backend.
   ========================================================================== */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Config (override by defining window.WORTHWISE_CHATBOT_CONFIG before
   * this script loads)
   * ------------------------------------------------------------------ */
  var CONFIG = {
    name: 'Worthwise Assistant',
    // Backend chat endpoint: knowledge base + LLM fallback live on the server.
    chatEndpoint: (['localhost', '127.0.0.1', ''].indexOf(root.location && root.location.hostname) !== -1)
      ? 'http://localhost:5000/api/chat'
      : 'https://worthwise-snwh.onrender.com/api/chat',
    storageKey: 'worthwise_chat_v1',
    maxMessages: 60,
    greetEveryMs: 19000     // robot waves + shows a small "Hello!" bubble this often
  };
  if (root.WORTHWISE_CHATBOT_CONFIG) {
    for (var ck in root.WORTHWISE_CHATBOT_CONFIG) CONFIG[ck] = root.WORTHWISE_CHATBOT_CONFIG[ck];
  }

  // Shown only when the backend cannot be reached at all.
  var OFFLINE = {
    a: "I can't reach the Worthwise server right now. Please check your connection and try again in a moment.",
    hi: "Abhi Worthwise server se connect nahi ho pa raha. Apna internet check karke thodi der baad dobara try karein.",
    next: ['What is Worthwise?', 'How do I analyze a purchase?']
  };

  var DEFAULT_CHIPS = [
    'What is Worthwise?',
    'How do I analyze a purchase?',
    'What do BUY, WAIT and SKIP mean?',
    'How is the financial health score calculated?',
    'Show my financial health',
    'What is the demo?'
  ];

  /* ------------------------------------------------------------------ *
   * Text helpers
   * ------------------------------------------------------------------ */
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/[\u2019\u2018]/g, "'")
      .replace(/[^a-z0-9\s'\/\-]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  var HINGLISH = /\b(kaise|kya|hai|hain|mujhe|mera|meri|mere|batao|bataiye|chahiye|kitna|kitne|nahi|aap|tum)\b/;
  function isHinglish(t) { return HINGLISH.test(t); }

  /* ------------------------------------------------------------------ *
   * Personalised answers ("my financial health", "my goals", ...)
   * Reads from the app's own SpendWiseAPI — nothing leaves the browser.
   * ------------------------------------------------------------------ */
  function personalKind(text) {
    var t = norm(text);
    // Only treat it as a data request when the user is *asking to see* their numbers,
    // not when they ask "how do I update my profile?".
    var asksForData =
      /\b(show|tell|give|see|view|check|display|dikhao|batao|bataiye|batayiye)\b.*\b(my|mera|meri|mere)\b/.test(t) ||
      /\b(what is|what's|whats|how much is|how much are|how is|how are|what are)\s+my\b/.test(t) ||
      /\b(mera|meri|mere)\b.*\b(kitna|kitni|kya hai|kaisa|kaisi|dikhao|batao)\b/.test(t) ||
      /^my\s+\w+(\s+\w+)?$/.test(t);
    if (!asksForData) return null;
    if (/\b(goal|goals|lakshya)\b/.test(t)) return 'goals';
    if (/\b(health|score|sehat)\b/.test(t)) return 'health';
    if (/\b(savings?|income|expenses?|surplus|salary|profile|numbers?|finances?|financial|bachat|kamai|kharch|kharcha|emergency)\b/.test(t)) return 'profile';
    return null;
  }

  function inr(n) {
    var v = Number(n || 0);
    return '\u20B9' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  function loginPrompt() {
    return {
      text: "\uD83D\uDD10 I can answer that once you are signed in, since I read your numbers from your own account. Log in, or tap **Try Demo** to see it with a sample account.",
      actions: [{ label: 'Log in', hash: '#/auth' }, { label: 'Try demo', demo: true }]
    };
  }

  function personalReply(kind) {
    var api = root.SpendWiseAPI || (typeof SpendWiseAPI !== 'undefined' ? SpendWiseAPI : null);
    if (!api || typeof api.isAuthenticated !== 'function' || !api.isAuthenticated()) {
      return Promise.resolve(loginPrompt());
    }

    if (kind === 'goals') {
      return api.getGoals().then(function (goals) {
        goals = (goals || []).filter(function (g) { return g && !g.isPlaceholder; });
        if (!goals.length) {
          return { text: "You have not saved any goals yet. Add one so Worthwise can check purchases against it.", actions: [{ label: 'Add a goal', hash: '#/goals' }] };
        }
        var lines = goals.slice(0, 5).map(function (g) {
          var tgt = Number(g.targetAmount || 0), cur = Number(g.currentAmount || 0);
          var pct = tgt > 0 ? Math.round(cur / tgt * 100) : 0;
          var d = g.targetDate ? new Date(g.targetDate) : null;
          var when = d && !isNaN(d) ? ' by ' + d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '';
          return '- **' + (g.name || 'Goal') + ':** ' + inr(cur) + ' of ' + inr(tgt) + ' (' + pct + '%)' + when + (g.priority ? ', ' + String(g.priority).toLowerCase() + ' priority' : '');
        });
        return { text: "Here are your goals:\n" + lines.join('\n'), actions: [{ label: 'Open Goals', hash: '#/goals' }] };
      }).catch(function () {
        return { text: "I could not load your goals right now. Please try again in a moment.", actions: [{ label: 'Open Goals', hash: '#/goals' }] };
      });
    }

    return api.getFinancialProfile().then(function (p) {
      var income = Number(p.monthlyIncome || 0), exp = Number(p.monthlyExpenses || 0);
      if (income <= 0) {
        return { text: "Your financial profile is still empty, so there is nothing to score yet. Add your income, expenses and savings first.", actions: [{ label: 'Set up profile', hash: '#/profile' }] };
      }
      var surplus = income - exp, savings = Number(p.currentSavings || 0);
      var health = (typeof computeHealth === 'function') ? computeHealth(p) : null;

      if (kind === 'health') {
        var rate = Math.round(Number(p.savingsRate || 0) * 100);
        var msg = health
          ? "Your financial health is **" + health.score + "/100 (" + health.label + ")**.\n"
          : "Here is your financial position.\n";
        msg += "- Savings rate: **" + rate + "%**\n- Monthly surplus: **" + inr(surplus) + "**\n- Savings: **" + inr(savings) + "**";
        if (Number(p.emergencyFundTarget || 0) > 0) {
          msg += "\n- Emergency fund target: **" + inr(p.emergencyFundTarget) + "** (" + Math.round(Math.min(savings / p.emergencyFundTarget, 9.99) * 100) + "% covered by savings)";
        }
        if (surplus < 0) msg += "\n\nYour expenses are higher than your income, so purchases should wait until cash flow improves.";
        return { text: msg, actions: [{ label: 'Open dashboard', hash: '#/dashboard' }] };
      }

      var out = "Your numbers right now:\n- Monthly income: **" + inr(income) + "**\n- Monthly expenses: **" + inr(exp) + "**\n- Monthly surplus: **" + inr(surplus) + "**\n- Current savings: **" + inr(savings) + "**";
      if (health) out += "\n- Financial health: **" + health.score + "/100 (" + health.label + ")**";
      return { text: out, actions: [{ label: 'Edit profile', hash: '#/profile' }] };
    }).catch(function () {
      return { text: "I could not load your profile right now. Please try again in a moment.", actions: [{ label: 'Open Profile', hash: '#/profile' }] };
    });
  }

  /* ------------------------------------------------------------------ *
   * Reply pipeline
   * ------------------------------------------------------------------ */
  var history = [];   // [{ role: 'user'|'bot', text, actions?, ts }]

  var EMOJI = {
    'greeting': '\uD83D\uDC4B', 'good-morning': '\u2600\uFE0F', 'good-afternoon': '\uD83C\uDF24\uFE0F', 'good-evening': '\uD83C\uDF07', 'good-night': '\uD83C\uDF19',
    'creator': '\uD83D\uDC68\u200D\uD83D\uDCBB', 'how-are-you': '\uD83D\uDE04', 'name': '\uD83E\uDD16', 'joke': '\uD83D\uDE02', 'compliment': '\uD83E\uDD70',
    'sorry-ok': '\uD83D\uDC4D', 'language': '\uD83D\uDDE3\uFE0F', 'age-place': '\uD83E\uDD16', 'saving-tip': '\uD83D\uDC37',
    'about': '\uD83D\uDCA1', 'how-it-works': '\u2699\uFE0F', 'get-started': '\uD83D\uDE80', 'verdicts': '\uD83D\uDEA6', 'affordability': '\uD83D\uDCB0',
    'goal-impact': '\uD83C\uDFAF', 'analyze': '\uD83D\uDD0D', 'emi': '\uD83C\uDFE6', 'results': '\uD83D\uDCCB', 'future': '\u23F3', 'alternatives': '\uD83D\uDCB8',
    'market': '\uD83D\uDED2', 'usage': '\uD83D\uDCC8', 'health': '\uD83D\uDC9A', 'dashboard': '\uD83D\uDCCA', 'decisions': '\uD83D\uDDC2\uFE0F', 'reevaluate': '\uD83D\uDD04',
    'done': '\u2705', 'planned': '\uD83D\uDCCC', 'goals': '\uD83C\uDFAF', 'profile': '\uD83D\uDC64', 'preferences': '\uD83C\uDF9B\uFE0F', 'settings': '\u2699\uFE0F',
    'signup': '\uD83D\uDCDD', 'login': '\uD83D\uDD10', 'demo': '\uD83C\uDFAE', 'logout': '\uD83D\uDEAA', 'theme': '\uD83C\uDF17', 'mobile': '\uD83D\uDCF1',
    'privacy': '\uD83D\uDD12', 'pricing': '\uD83C\uDFF7\uFE0F', 'slow': '\uD83D\uDE34', 'troubleshoot': '\uD83D\uDEE0\uFE0F', 'advice': '\u2696\uFE0F',
    'tech': '\uD83E\uDDD1\u200D\uD83D\uDCBB', 'capabilities': '\uD83E\uDD16', 'who': '\uD83E\uDD16', 'thanks': '\uD83D\uDE0A', 'bye': '\uD83D\uDC4B'
  };
  EMOJI['demo-limit'] = '\uD83C\uDF9F\uFE0F'; EMOJI['account-limit'] = '\uD83D\uDCE6'; EMOJI['delete-account'] = '\uD83D\uDDD1\uFE0F'; EMOJI['delete-decision'] = '\uD83D\uDDD1\uFE0F';
  EMOJI['add-goal'] = '\uD83C\uDFAF'; EMOJI['emergency-fund'] = '\uD83D\uDEDF'; EMOJI['why-verdict'] = '\uD83E\uDDD0'; EMOJI['ai-explanation'] = '\u2728';
  function withEmoji(text, e) { return e ? e + ' ' + text : text; }

  function offlineReply(text) {
    var hing = isHinglish(norm(text));
    return { text: withEmoji(hing ? OFFLINE.hi : OFFLINE.a, '\uD83D\uDCF6'), actions: [], next: OFFLINE.next };
  }

  // POST { message, history } -> { reply, entryId, actions, next, source }
  function backendReply(text) {
    return fetch(CONFIG.chatEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: history.slice(-8).map(function (m) { return { role: m.role, text: m.text }; })
      })
    }).then(function (res) {
      if (!res.ok) throw new Error('bad status');
      return res.json();
    }).then(function (data) {
      if (!data || !data.reply) throw new Error('empty');
      var emoji = data.source === 'ai' ? '\u2728' : data.source === 'fallback' ? '\uD83E\uDD14' : EMOJI[data.entryId];
      return { text: withEmoji(String(data.reply), emoji), actions: data.actions || [], next: data.next || [] };
    });
  }

  function respond(text) {
    var kind = personalKind(text);
    if (kind) return personalReply(kind).then(function (r) {
      if (!/^[\u2600-\u27BF\uD83C-\uDBFF]/.test(r.text)) r.text = withEmoji(r.text, { goals: '\uD83C\uDFAF', health: '\uD83D\uDC9A', profile: '\uD83D\uDCCA' }[kind]);
      return r;
    });
    return backendReply(text).catch(function () { return offlineReply(text); });
  }

  /* ------------------------------------------------------------------ *
   * Public API (also lets you test the engine without a browser)
   * ------------------------------------------------------------------ */
  var engine = { personalKind: personalKind, norm: norm };
  root.WorthwiseChatbot = { engine: engine, config: CONFIG };

  /* ------------------------------------------------------------------ *
   * UI (only runs in a browser)
   * ------------------------------------------------------------------ */
  if (typeof document === 'undefined') return;

  var els = {};
  var isOpen = false, busy = false;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // tiny, safe markdown: **bold**, *italic*, "- " bullets, blank-line paragraphs
  function format(text) {
    var s = esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    var out = [], inList = false;
    s.split('\n').forEach(function (line) {
      if (/^\s*[-\u2022]\s+/.test(line)) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + line.replace(/^\s*[-\u2022]\s+/, '') + '</li>');
      } else {
        if (inList) { out.push('</ul>'); inList = false; }
        if (line.trim()) out.push('<p>' + line + '</p>');
      }
    });
    if (inList) out.push('</ul>');
    return out.join('');
  }

  var LOGO_SVG = '<svg viewBox="0 0 26 26" fill="none" aria-hidden="true"><rect x="1" y="6" width="24" height="17" rx="4" fill="#2FD196"/><path d="M1 10.5C1 8.01 3.01 6 5.5 6H21c2.21 0 4 1.79 4 4v1H1v-.5Z" fill="#1B9E75"/><circle cx="18.5" cy="14.5" r="3.1" fill="#0A0C0F"/><path d="M17 14.6l1.1 1.1 2-2.2" stroke="#2FD196" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

  // Cute chibi robot mascot used as the launcher
  var ROBOT_SVG =
    '<svg class="wwc-robot" viewBox="0 -8 80 104" fill="none" aria-hidden="true" focusable="false">' +
      '<defs>' +
        '<linearGradient id="wwc-gh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7BA0FF"/><stop offset="1" stop-color="#3F69E8"/></linearGradient>' +
        '<linearGradient id="wwc-gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5E88F7"/><stop offset="1" stop-color="#3558D0"/></linearGradient>' +
      '</defs>' +
      '<ellipse class="wwc-shadow" cx="40" cy="92" rx="17" ry="3.2" fill="#000" opacity=".45"/>' +
      '<g class="wwc-float">' +
        /* feet */
        '<ellipse cx="33" cy="85" rx="6" ry="4.2" fill="#2F55C9"/><ellipse cx="47" cy="85" rx="6" ry="4.2" fill="#2F55C9"/>' +
        /* body + belly terminal */
        '<ellipse cx="40" cy="69" rx="15" ry="15" fill="url(#wwc-gb)"/>' +
        '<ellipse cx="33" cy="60.5" rx="4" ry="2" fill="#fff" opacity=".25"/>' +
        '<rect x="32.5" y="64" width="15" height="10" rx="3.5" fill="#0E1330"/>' +
        '<path d="M35.5 66.4l3 2.6-3 2.6" stroke="#7EF0FF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path class="wwc-cursor" d="M41 71.6h4.5" stroke="#7EF0FF" stroke-width="1.5" stroke-linecap="round"/>' +
        /* antenna */
        '<path d="M40 9V1.5" stroke="#2F55C9" stroke-width="2" stroke-linecap="round"/>' +
        '<circle cx="40" cy="-1.5" r="6.5" fill="#FFD24D" opacity=".22"/>' +
        '<circle class="wwc-ball" cx="40" cy="-1.5" r="3.6" fill="#FFD24D"/>' +
        /* ears + head */
        '<ellipse cx="7.5" cy="31" rx="5" ry="7" fill="#2F55C9"/><ellipse cx="72.5" cy="31" rx="5" ry="7" fill="#2F55C9"/>' +
        '<rect x="9" y="8" width="62" height="46" rx="23" fill="url(#wwc-gh)"/>' +
        '<ellipse cx="26" cy="13.5" rx="9" ry="3" fill="#fff" opacity=".4"/>' +
        /* screen + blush */
        '<rect x="15" y="15" width="50" height="33" rx="15" fill="#0E1330" stroke="#1C2552" stroke-width="1"/>' +
        /* face */
        '<g class="wwc-face">' +
          '<g class="wwc-eyes"><ellipse cx="30.5" cy="29" rx="4" ry="5.2" fill="#7EF0FF"/><ellipse cx="49.5" cy="29" rx="4" ry="5.2" fill="#7EF0FF"/>' +
            '<circle cx="31.8" cy="27" r="1.4" fill="#fff"/><circle cx="50.8" cy="27" r="1.4" fill="#fff"/></g>' +
          '<g class="wwc-happy" stroke="#7EF0FF" stroke-width="2.6" stroke-linecap="round"><path d="M26 31q4.5-8 9 0"/><path d="M45 31q4.5-8 9 0"/></g>' +
          '<path d="M35 37.5q5 5 10 0" stroke="#7EF0FF" stroke-width="2.4" stroke-linecap="round"/>' +
        '</g>' +
        /* typing dots (while the bot is answering) */
        '<g class="wwc-dots" fill="#7EF0FF"><circle cx="31" cy="32" r="2.8"/><circle cx="40" cy="32" r="2.8"/><circle cx="49" cy="32" r="2.8"/></g>' +
        /* arms (mittens) */
        '<g class="wwc-arm-l"><ellipse cx="23.5" cy="70" rx="4.6" ry="7.5" fill="url(#wwc-gb)"/><circle cx="23.5" cy="76.5" r="4.4" fill="#86A9FF"/></g>' +
        '<g class="wwc-arm-r"><ellipse cx="56.5" cy="70" rx="4.6" ry="7.5" fill="url(#wwc-gb)"/><circle cx="56.5" cy="76.5" r="4.4" fill="#86A9FF"/></g>' +
      '</g>' +
    '</svg>';

  function build() {
    var wrap = document.createElement('div');
    wrap.id = 'wwc-root';
    wrap.innerHTML =
      '<button type="button" id="wwc-fab" class="wwc-fab" aria-label="Open ' + esc(CONFIG.name) + '" aria-expanded="false" aria-controls="wwc-panel">' + ROBOT_SVG + '</button>' +
      '<div id="wwc-pop" class="wwc-pop" role="status" aria-live="polite"></div>' +
      '<section id="wwc-panel" class="wwc-panel" role="dialog" aria-label="' + esc(CONFIG.name) + '" aria-hidden="true">' +
        '<header class="wwc-head">' +
          '<div class="wwc-title"><span class="wwc-avatar">' + LOGO_SVG + '</span><div><b>' + esc(CONFIG.name) + '</b><small>Ask anything about Worthwise</small></div></div>' +
          '<div class="wwc-head-btns">' +
            '<button type="button" id="wwc-clear" class="wwc-icon-btn" aria-label="Clear chat" title="Clear chat">\u21BA</button>' +
            '<button type="button" id="wwc-close" class="wwc-icon-btn" aria-label="Close chat">\u2715</button>' +
          '</div>' +
        '</header>' +
        '<div id="wwc-log" class="wwc-log" role="log" aria-live="polite"></div>' +
        '<div id="wwc-chips" class="wwc-chips" aria-label="Suggested questions"></div>' +
        '<form id="wwc-form" class="wwc-form" autocomplete="off">' +
          '<input id="wwc-input" class="wwc-input" type="text" maxlength="300" placeholder="Type your question..." aria-label="Type your question">' +
          '<button type="submit" id="wwc-send" class="wwc-send" aria-label="Send message"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/></svg></button>' +
        '</form>' +
        '<div class="wwc-note">Built-in guide. Not financial advice.</div>' +
      '</section>';
    document.body.appendChild(wrap);

    ['fab', 'pop', 'panel', 'log', 'chips', 'form', 'input', 'send', 'close', 'clear'].forEach(function (id) {
      els[id] = document.getElementById('wwc-' + id);
    });
  }

  function scrollDown() { els.log.scrollTop = els.log.scrollHeight; }

  function addMessage(role, text, actions, save) {
    var row = document.createElement('div');
    row.className = 'wwc-row ' + (role === 'user' ? 'wwc-user' : 'wwc-bot');
    var bubble = document.createElement('div');
    bubble.className = 'wwc-bubble';
    bubble.innerHTML = role === 'user' ? '<p>' + esc(text) + '</p>' : format(text);

    if (role === 'bot' && actions && actions.length) {
      var box = document.createElement('div');
      box.className = 'wwc-actions';
      actions.forEach(function (a) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'wwc-action';
        b.textContent = a.label;
        b.addEventListener('click', function () { runAction(a); });
        box.appendChild(b);
      });
      bubble.appendChild(box);
    }
    row.appendChild(bubble);
    els.log.appendChild(row);
    scrollDown();

    if (save !== false) {
      history.push({ role: role, text: text, actions: actions || [], ts: Date.now() });
      if (history.length > CONFIG.maxMessages) history = history.slice(-CONFIG.maxMessages);
      persist();
    }
  }

  function runAction(a) {
    if (a.demo) {
      var demoBtn = document.querySelector('[data-try-demo]');
      if (demoBtn) { demoBtn.click(); closePanel(); return; }
      if (a.hash) window.location.hash = a.hash; else window.location.hash = '#/auth';
      closePanel();
      return;
    }
    if (a.hash) {
      window.location.hash = a.hash;
      if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) closePanel();
    }
  }

  function showTyping() {
    var row = document.createElement('div');
    row.className = 'wwc-row wwc-bot wwc-typing';
    row.id = 'wwc-typing';
    row.innerHTML = '<div class="wwc-bubble" aria-label="Assistant is typing"><span class="wwc-dot"></span><span class="wwc-dot"></span><span class="wwc-dot"></span></div>';
    els.log.appendChild(row);
    scrollDown();
  }
  function hideTyping() {
    var t = document.getElementById('wwc-typing');
    if (t) t.remove();
  }

  /* ---------- robot popup + "typing" state ---------- */
  var popTimer = null;

  function hidePop() {
    clearTimeout(popTimer);
    els.pop.classList.remove('wwc-pop-show');
  }
  // showPop('typing') shows animated dots; showPop('text', ms) shows text then hides itself;
  // showPop('<html>', ms, true) renders trusted static markup (used for the greeting only)
  function showPop(content, ms, isHtml) {
    if (isOpen) return;                       // inside the open panel the normal typing bubble is used
    clearTimeout(popTimer);
    if (content === 'typing') {
      els.pop.innerHTML = '<div class="wwc-pop-typing" aria-label="Typing"><span class="wwc-dot"></span><span class="wwc-dot"></span><span class="wwc-dot"></span></div>';
    } else if (isHtml) {
      els.pop.innerHTML = content;
    } else {
      els.pop.textContent = content;
    }
    els.pop.classList.add('wwc-pop-show');
    if (ms) popTimer = setTimeout(hidePop, ms);
  }
  function setWave(on) {
    els.fab.classList.toggle('wwc-waving', !!on);
  }
  function setThinking(on) {
    els.fab.classList.toggle('wwc-thinking', !!on);
    if (on) setWave(false);
  }
  function preview(text) {
    var t = String(text).replace(/\*\*/g, '').replace(/\n+/g, ' ').replace(/\s*-\s+/g, ' ').trim();
    var m = t.match(/^.*?[.!?](?=\s|$)/);
    var first = m ? m[0] : t;
    return first.length > 90 ? first.slice(0, 87).trim() + '...' : first;
  }
  var greetTimer = null, waveTimer = null;
  var GREETING_HTML = 'Hello! Can I help you? <span class="wwc-hand">\uD83D\uDC4B</span>';

  // robot raises its hand and a small bubble says hello
  function greetOnce() {
    if (isOpen || busy || els.pop.classList.contains('wwc-pop-show')) return;
    setWave(true);
    showPop(GREETING_HTML, 5200, true);
    clearTimeout(waveTimer);
    waveTimer = setTimeout(function () { setWave(false); }, 5200);
  }
  function startGreetLoop() {
    var tries = 0;
    (function wait() {
      // let Worthwise's own "Waking up" screen finish first
      if (document.getElementById('wake-overlay') && tries++ < 40) { setTimeout(wait, 1000); return; }
      setTimeout(function () {
        greetOnce();
        clearInterval(greetTimer);
        greetTimer = setInterval(greetOnce, Math.max(5000, Number(CONFIG.greetEveryMs) || 19000));
      }, 2500);
    })();
  }

  function setChips(list) {
    els.chips.innerHTML = '';
    (list && list.length ? list : DEFAULT_CHIPS).forEach(function (q) {
      var c = document.createElement('button');
      c.type = 'button';
      c.className = 'wwc-chip';
      c.textContent = q;
      c.addEventListener('click', function () { ask(q); });
      els.chips.appendChild(c);
    });
    els.chips.scrollLeft = 0;
  }

  function ask(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    busy = true;
    els.send.disabled = true;
    els.input.value = '';
    addMessage('user', text, null);
    showTyping();
    setThinking(true);
    showPop('typing');

    var started = Date.now();
    var minDelay = 1000;   // ~1 second so it feels like the bot is thinking

    respond(text).then(function (reply) {
      var wait = Math.max(0, minDelay - (Date.now() - started));
      setTimeout(function () {
        hideTyping();
        addMessage('bot', reply.text, reply.actions);
        setChips(reply.next);
        setThinking(false);
        if (!isOpen) showPop(preview(reply.text), 7000);
        busy = false;
        els.send.disabled = false;
        if (isOpen && !(window.matchMedia && window.matchMedia('(max-width: 900px)').matches)) els.input.focus();
      }, wait);
    });
  }

  /* ---------- persistence (per tab) ---------- */
  function persist() {
    try { sessionStorage.setItem(CONFIG.storageKey, JSON.stringify(history)); } catch (e) {}
  }
  function restore() {
    try {
      var raw = sessionStorage.getItem(CONFIG.storageKey);
      if (!raw) return false;
      var saved = JSON.parse(raw);
      if (!Array.isArray(saved) || !saved.length) return false;
      saved.forEach(function (m) { addMessage(m.role, m.text, m.actions, false); history.push(m); });
      return true;
    } catch (e) { return false; }
  }

  var GREETING = "Hi! I'm the **Worthwise Assistant**. Ask me anything about Worthwise: analyzing a purchase, goals, your financial profile, or your account.";

  function greet() {
    var hello = "\uD83D\uDC4B " + GREETING + "\n\nWhen you are logged in, you can also ask about your own numbers, like \"show my financial health\".";
    addMessage('bot', hello, null);
    setChips(['What is Worthwise?', 'How do I analyze a purchase?', 'What do BUY, WAIT and SKIP mean?', 'Show my financial health']);
  }

  /* ---------- open / close ---------- */
  function openPanel() {
    isOpen = true;
    els.panel.classList.add('wwc-show');
    els.panel.setAttribute('aria-hidden', 'false');
    els.fab.classList.add('wwc-open');
    els.fab.setAttribute('aria-expanded', 'true');
    els.fab.setAttribute('aria-label', 'Close ' + CONFIG.name);
    hidePop();
    setWave(false);
    scrollDown();
    if (!(window.matchMedia && window.matchMedia('(max-width: 900px)').matches)) els.input.focus();
  }
  function closePanel() {
    isOpen = false;
    els.panel.classList.remove('wwc-show');
    els.panel.setAttribute('aria-hidden', 'true');
    els.fab.classList.remove('wwc-open');
    els.fab.setAttribute('aria-expanded', 'false');
    els.fab.setAttribute('aria-label', 'Open ' + CONFIG.name);
    if (busy) showPop('typing');
  }

  function init() {
    if (document.getElementById('wwc-root')) return;
    build();

    if (!restore()) greet(); else setChips();

    els.fab.addEventListener('click', function () { isOpen ? closePanel() : openPanel(); });
    els.close.addEventListener('click', closePanel);
    els.pop.addEventListener('click', openPanel);
    els.clear.addEventListener('click', function () {
      history = [];
      persist();
      els.log.innerHTML = '';
      greet();
    });
    els.form.addEventListener('submit', function (e) { e.preventDefault(); ask(els.input.value); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) closePanel(); });

    startGreetLoop();

    root.WorthwiseChatbot.open = openPanel;
    root.WorthwiseChatbot.close = closePanel;
    root.WorthwiseChatbot.greet = greetOnce;
    root.WorthwiseChatbot.ask = function (q) { openPanel(); ask(q); };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(typeof window !== 'undefined' ? window : globalThis);