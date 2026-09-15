/* =========================================================
   WORTH WISE — application logic
   Vanilla JS SPA. Talks to the real Spring Boot backend at /api.
   No mock data, no fabricated numbers — every rendered figure
   comes straight from a controller response.
========================================================= */

const API_BASE = '/api';
const TOKEN_KEY = 'worthwise_token';

/* ---------------------------------------------------------
   API layer
--------------------------------------------------------- */
const Api = (() => {
  function token(){ return localStorage.getItem(TOKEN_KEY) || ''; }
  function setToken(t){ localStorage.setItem(TOKEN_KEY, t); }
  function clearToken(){ localStorage.removeItem(TOKEN_KEY); }
  function isAuthed(){ return Boolean(token()); }

  async function request(path, options = {}){
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (res.status === 401){
      clearToken();
      if (location.hash !== '#/auth' && location.hash !== '#/' && location.hash !== ''){
        Router.go('#/auth');
      }
      throw new ApiError('Your session expired. Please sign in again.', 401);
    }
    if (!res.ok){
      let msg = 'Something went wrong. Please try again.';
      try { const body = await res.json(); msg = body.error || body.message || msg; }
      catch(_) { /* non-JSON error body */ }
      throw new ApiError(msg, res.status);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    isAuthed, clearToken,
    async register(email, password){
      const data = await request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
      setToken(data.token);
      return data.user;
    },
    async login(email, password){
      const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setToken(data.token);
      return data.user;
    },
    logout(){ clearToken(); Router.go('#/'); },
    me(){ return request('/auth/me'); },
    dashboard(){ return request('/dashboard'); },
    getProfile(){ return request('/profile'); },
    updateProfile(payload){ return request('/profile', { method: 'PUT', body: JSON.stringify(payload) }); },
    getGoals(){ return request('/goals'); },
    createGoal(payload){ return request('/goals', { method: 'POST', body: JSON.stringify(payload) }); },
    updateGoal(id, payload){ return request(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(payload) }); },
    deleteGoal(id){ return request(`/goals/${id}`, { method: 'DELETE' }); },
    evaluatePurchase(payload){ return request('/purchases/evaluate', { method: 'POST', body: JSON.stringify(payload) }); },
    getHistory(){ return request('/purchases/history'); },
    getDecision(id){ return request(`/purchases/${id}`); },
  };
})();

class ApiError extends Error {
  constructor(message, status){ super(message); this.status = status; }
}

/* ---------------------------------------------------------
   Formatting helpers
--------------------------------------------------------- */
const Fmt = {
  money(n){
    const v = Number(n || 0);
    return '₹' + Math.round(v).toLocaleString('en-IN');
  },
  compactMoney(n){
    const v = Number(n || 0);
    if (Math.abs(v) >= 10000000) return '₹' + (v/10000000).toFixed(1) + 'Cr';
    if (Math.abs(v) >= 100000) return '₹' + (v/100000).toFixed(1) + 'L';
    if (Math.abs(v) >= 1000) return '₹' + (v/1000).toFixed(1) + 'k';
    return '₹' + Math.round(v);
  },
  date(d){
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return '—';
    return dt.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
  },
  monthYear(d){
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return '—';
    return dt.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  },
  relative(d){
    if (!d) return '';
    const diff = Math.round((Date.now() - new Date(d).getTime()) / 86400000);
    if (diff <= 0) return 'today';
    if (diff === 1) return '1 day ago';
    if (diff < 7) return `${diff} days ago`;
    const weeks = Math.round(diff / 7);
    if (weeks < 5) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
    const months = Math.round(diff / 30);
    return months === 1 ? '1 month ago' : `${months} months ago`;
  },
  titleCase(s){
    if (!s) return '';
    return String(s).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  },
};

function decisionMeta(decision){
  switch(decision){
    case 'BUY_NOW': return { label: 'Buy now', short: 'Bought', cls: 'v-buy', color: 'var(--moss-strong)' };
    case 'WAIT': return { label: 'Wait', short: 'Wait', cls: 'v-wait', color: 'var(--gold)' };
    case 'DONT_BUY': return { label: "Don't buy", short: 'Skipped', cls: 'v-skip', color: 'var(--rust)' };
    case 'CONSIDER_ALTERNATIVE': return { label: 'Consider alternative', short: 'Alternative', cls: 'v-alt', color: '#7fa8c9' };
    default: return { label: decision || 'Unknown', short: decision || '—', cls: 'v-wait', color: 'var(--ink-dim)' };
  }
}

/* Animate a number counting up from 0 — used for headline stats. */
function animateCount(el, target, { prefix = '', duration = 900, formatter = null } = {}){
  if (!el) return;
  const startTime = performance.now();
  function tick(now){
    const p = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = target * eased;
    el.textContent = formatter ? formatter(val) : (prefix + Math.round(val).toLocaleString('en-IN'));
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = formatter ? formatter(target) : (prefix + Math.round(target).toLocaleString('en-IN'));
  }
  requestAnimationFrame(tick);
}

function toast(message, type = 'success'){
  const host = document.getElementById('toast-host');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3800);
}

/* ---------------------------------------------------------
   Gamification — derived purely from real backend data.
   Level = financialHealthScore band. Streak = consecutive
   most-recent decisions (by date) with score >= 60.
--------------------------------------------------------- */
function levelFromScore(score){
  const s = Number(score || 0);
  if (s >= 90) return { level: 6, title: 'Money Guardian' };
  if (s >= 75) return { level: 5, title: 'Strategist' };
  if (s >= 60) return { level: 4, title: 'Planner' };
  if (s >= 45) return { level: 3, title: 'Builder' };
  if (s >= 25) return { level: 2, title: 'Apprentice' };
  return { level: 1, title: 'Beginner' };
}

function computeStreak(decisions){
  // decisions: array of DecisionItem sorted by most-recent first
  let streak = 0;
  for (const d of decisions){
    const decision = d.analysis?.decision;
    const good = decision === 'BUY_NOW' || decision === 'WAIT';
    if (good) streak++; else break;
  }
  return streak;
}

/* ---------------------------------------------------------
   Icons (inline, stroke-based, consistent 1.8-2.3 weight)
--------------------------------------------------------- */
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
  scan: '<path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/><circle cx="12" cy="12" r="3.2"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M9 12h11M4 18h13M19 18h1"/><circle cx="14" cy="6" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
};

function svgIcon(name, size = 18){
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

const NAV_ITEMS = [
  { route: '#/dashboard', label: 'Overview', icon: 'grid' },
  { route: '#/analyze', label: 'Analyze purchase', icon: 'scan' },
  { route: '#/history', label: 'Decisions', icon: 'clock' },
  { route: '#/goals', label: 'Goals', icon: 'target' },
  { route: '#/profile', label: 'Profile', icon: 'sliders' },
];

let currentUserCache = null;

/* ---------------------------------------------------------
   Shell (sidebar / mobile bar / tab bar)
--------------------------------------------------------- */
function renderShell(activeRoute){
  const sidebar = document.getElementById('sidebar');
  const mobileBar = document.getElementById('mobile-bar');
  const tabBar = document.getElementById('tab-bar');
  const authed = Api.isAuthed();

  if (!authed){
    sidebar.innerHTML = '';
    mobileBar.innerHTML = '';
    tabBar.innerHTML = '';
    return;
  }

  const navLinks = NAV_ITEMS.map(item => `
    <a class="sb-link${activeRoute === item.route ? ' active' : ''}" href="${item.route}">
      ${svgIcon(item.icon, 17)}${item.label}
    </a>`).join('');

  const initials = (currentUserCache?.name || currentUserCache?.email || 'U').slice(0,2).toUpperCase();

  sidebar.innerHTML = `
    <div class="brand"><span class="brand-mark">WW</span><span class="brand-word">Worth Wise</span></div>
    <nav class="sb-nav">${navLinks}</nav>
    <div class="sb-spacer"></div>
    <button class="sb-cta" data-nav="#/analyze">+ Analyze a purchase</button>
    <a class="sb-user" href="#/profile">
      <div class="sb-avatar">${initials}</div>
      <div class="sb-user-meta">
        <div class="sb-user-name">${currentUserCache?.name || 'Your account'}</div>
        <div class="sb-user-email">${currentUserCache?.email || ''}</div>
      </div>
    </a>
    <button class="sb-logout" id="sb-logout-btn">Log out</button>
  `;

  mobileBar.innerHTML = `
    <div class="brand"><span class="brand-mark">WW</span><span class="brand-word">Worth Wise</span></div>
    <a class="sb-avatar" href="#/profile" style="text-decoration:none;">${initials}</a>
  `;

  tabBar.innerHTML = NAV_ITEMS.map(item => `
    <button class="tab-item${activeRoute === item.route ? ' active' : ''}" data-nav="${item.route}">
      ${svgIcon(item.icon, 19)}<span>${item.label.split(' ')[0]}</span>
    </button>`).join('');

  sidebar.querySelector('#sb-logout-btn')?.addEventListener('click', () => Api.logout());
}

/* ---------------------------------------------------------
   Router
--------------------------------------------------------- */
const Router = {
  currentRoute: '',
  go(hash){ if (location.hash === hash) { render(); } else { location.hash = hash; } },
};

document.addEventListener('click', (e) => {
  const navEl = e.target.closest('[data-nav]');
  if (navEl){ e.preventDefault(); Router.go(navEl.getAttribute('data-nav')); return; }
  const scrollEl = e.target.closest('[data-scroll]');
  if (scrollEl){ document.getElementById(scrollEl.getAttribute('data-scroll'))?.scrollIntoView({ behavior: 'smooth' }); }
});

window.addEventListener('hashchange', render);
document.addEventListener('DOMContentLoaded', render);

async function render(){
  const rawHash = location.hash || '#/';
  const [routePath, queryStr] = rawHash.split('?');
  const query = Object.fromEntries(new URLSearchParams(queryStr || ''));
  const authed = Api.isAuthed();
  const view = document.getElementById('view');

  let route = routePath === '#/' || routePath === '' ? '#/' : routePath;

  const protectedRoutes = ['#/dashboard', '#/analyze', '#/goals', '#/history', '#/profile'];
  if (protectedRoutes.includes(route) && !authed){
    route = '#/auth';
  }
  if ((route === '#/' || route === '#/auth') && authed){
    route = '#/dashboard';
  }

  Router.currentRoute = route;
  renderShell(route);
  window.scrollTo(0, 0);

  try {
    switch(route){
      case '#/':
        mount('tpl-landing');
        initLanding();
        break;
      case '#/auth':
        mount('tpl-auth');
        initAuth(query.mode === 'register' ? 'register' : 'login');
        break;
      case '#/dashboard':
        mount('tpl-dashboard');
        await initDashboard();
        break;
      case '#/analyze':
        mount('tpl-analyze');
        initAnalyze();
        break;
      case '#/goals':
        mount('tpl-goals');
        await initGoals();
        break;
      case '#/history':
        mount('tpl-history');
        await initHistory();
        break;
      case '#/profile':
        mount('tpl-profile');
        await initProfile();
        break;
      default:
        mount('tpl-landing');
        initLanding();
    }
  } catch (err) {
    console.error(err);
  }

  function mount(tplId){
    const tpl = document.getElementById(tplId);
    view.innerHTML = '';
    view.appendChild(tpl.content.cloneNode(true));
  }
}

/* =========================================================
   LANDING
========================================================= */
function initLanding(){
  const dial = document.getElementById('landing-dial-fill');
  if (dial){
    requestAnimationFrame(() => {
      setTimeout(() => { dial.style.strokeDashoffset = '68'; }, 200);
    });
  }
}

/* =========================================================
   AUTH
========================================================= */
function initAuth(initialMode){
  const tabs = document.querySelectorAll('.auth-tab');
  const indicator = document.querySelector('.auth-tab-indicator');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  function setMode(mode){
    tabs.forEach(t => t.classList.toggle('active', t.dataset.authTab === mode));
    loginForm.classList.toggle('active', mode === 'login');
    registerForm.classList.toggle('active', mode === 'register');
    indicator.style.transform = mode === 'login' ? 'translateX(0)' : 'translateX(100%)';
  }

  tabs.forEach(t => t.addEventListener('click', () => setMode(t.dataset.authTab)));
  setMode(initialMode);

  const ring = document.getElementById('auth-side-ring');
  if (ring) requestAnimationFrame(() => { ring.style.background = 'conic-gradient(var(--moss-strong) 82%, rgba(255,255,255,0.08) 0)'; });

  async function handleSubmit(form, errEl, apiFn){
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      const data = new FormData(form);
      const email = data.get('email').trim();
      const password = data.get('password');
      errEl.textContent = '';
      btn.classList.add('is-loading');
      btn.disabled = true;
      try {
        const user = await apiFn(email, password);
        currentUserCache = user;
        toast(`Welcome${user?.name ? ', ' + user.name : ''}.`, 'success');
        Router.go('#/dashboard');
      } catch (err) {
        errEl.textContent = err.message || 'Something went wrong.';
      } finally {
        btn.classList.remove('is-loading');
        btn.disabled = false;
      }
    });
  }

  handleSubmit(loginForm, document.getElementById('login-error'), (e,p) => Api.login(e,p));
  handleSubmit(registerForm, document.getElementById('register-error'), (e,p) => Api.register(e,p));
}

/* =========================================================
   DASHBOARD
========================================================= */
async function initDashboard(){
  const skeleton = document.getElementById('dash-skeleton');
  const content = document.getElementById('dash-content');
  const errorBlock = document.getElementById('dash-error');

  skeleton.innerHTML = `
    <div class="skel skel-card"></div>
    <div class="skel skel-card"></div>
    <div class="skel skel-row"></div>
    <div class="skel skel-row"></div>`;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('dash-greeting-time').textContent = greeting;

  try {
    const [dash, history] = await Promise.all([Api.dashboard(), Api.getHistory().catch(() => [])]);
    currentUserCache = currentUserCache || {};
    const profile = dash.profile;
    const goals = dash.goals || [];
    const recent = dash.recentDecisions || [];

    document.getElementById('dash-greeting-name').textContent = currentUserCache?.name ? `Hey, ${currentUserCache.name}` : 'Command Center';

    // Health score — pulled from the auth user record if present, else derive nothing fake.
    let user;
    try { user = await Api.me(); currentUserCache = user; renderShell('#/dashboard'); } catch(_) { user = currentUserCache; }
    const score = user?.financialHealthScore ?? 0;
    const label = user?.financialHealthLabel || '—';
    document.getElementById('health-score').textContent = score;
    document.getElementById('health-label').textContent = label;
    requestAnimationFrame(() => { document.getElementById('health-bar-fill').style.width = Math.max(3, Math.min(100, score)) + '%'; });

    const surplus = Number(profile.monthlyIncome || 0) - Number(profile.monthlyExpenses || 0);
    document.getElementById('health-facts').innerHTML = `
      <span><b>${Fmt.compactMoney(profile.monthlyIncome)}</b> income</span>
      <span><b>${Fmt.compactMoney(profile.monthlyExpenses)}</b> expenses</span>
      <span><b>${goals.length}</b> active goal${goals.length===1?'':'s'}</span>`;

    // XP ring + level (derived from score, not fabricated)
    const { level, title } = levelFromScore(score);
    const ringFill = document.getElementById('xp-ring-fill');
    const circumference = 2 * Math.PI * 52;
    ringFill.style.strokeDasharray = String(circumference);
    requestAnimationFrame(() => {
      const pct = Math.max(0, Math.min(100, score)) / 100;
      ringFill.style.strokeDashoffset = String(circumference * (1 - pct));
    });
    document.getElementById('xp-level').textContent = 'Lv.' + level;
    document.querySelector('.xp-caption').textContent = title;

    const streak = computeStreak(history);
    document.getElementById('streak-text').textContent = `${streak} decision streak`;

    // Stat row
    animateCount(document.getElementById('stat-surplus'), surplus, { formatter: v => Fmt.money(v) });
    document.getElementById('stat-surplus-sub').textContent = surplus >= 0 ? 'income minus expenses' : 'spending exceeds income';
    animateCount(document.getElementById('stat-savings'), profile.currentSavings, { formatter: v => Fmt.money(v) });
    document.getElementById('stat-savings-sub').textContent = profile.emergencyBuffer ? `${Fmt.titleCase(profile.emergencyBuffer)} emergency buffer` : 'emergency buffer';
    animateCount(document.getElementById('stat-emi'), profile.existingEmi, { formatter: v => Fmt.money(v) });
    document.getElementById('stat-emi-sub').textContent = profile.debtBurden ? `${Fmt.titleCase(profile.debtBurden)} debt burden` : 'per month';

    // Goals
    const goalsList = document.getElementById('dash-goals-list');
    if (!goals.length){
      goalsList.innerHTML = `<p style="font-size:13px;color:var(--ink-faint);padding:8px 0;">No goals yet. <a href="#/goals" style="color:var(--moss-strong);" data-nav="#/goals">Create one →</a></p>`;
    } else {
      goalsList.innerHTML = goals.slice(0,4).map(g => goalMiniMarkup(g)).join('');
    }

    // Recent decisions
    const recentList = document.getElementById('dash-recent-list');
    if (!recent.length){
      recentList.innerHTML = `<p style="font-size:13px;color:var(--ink-faint);padding:8px 0;">No purchases analyzed yet. <a href="#/analyze" style="color:var(--moss-strong);" data-nav="#/analyze">Try one →</a></p>`;
    } else {
      recentList.innerHTML = recent.slice(0,5).map(d => recentItemMarkup(d)).join('');
      recentList.querySelectorAll('[data-decision-id]').forEach(el => {
        el.addEventListener('click', () => Router.go('#/history'));
      });
    }

    skeleton.classList.add('hidden');
    content.classList.remove('hidden');
  } catch (err) {
    skeleton.classList.add('hidden');
    errorBlock.classList.remove('hidden');
    errorBlock.innerHTML = `<h3>Couldn't load your dashboard</h3><p>${err.message || 'Please try again.'}</p><button class="btn btn-solid" onclick="initDashboard()">Retry</button>`;
  }
}

function goalMiniMarkup(g){
  const pct = g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0;
  const r = 16, c = 2 * Math.PI * r;
  return `
    <div class="goal-mini">
      <svg class="goal-mini-ring" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="${r}" fill="none" stroke="var(--bg-raised)" stroke-width="4"/>
        <circle cx="20" cy="20" r="${r}" fill="none" stroke="var(--moss-strong)" stroke-width="4" stroke-linecap="round"
          stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct/100)}" transform="rotate(-90 20 20)"/>
      </svg>
      <div class="goal-mini-meta">
        <div class="goal-mini-name">${escapeHtml(g.name)}</div>
        <div class="goal-mini-sub">${pct}% · ${Fmt.compactMoney(g.currentAmount)} / ${Fmt.compactMoney(g.targetAmount)}</div>
      </div>
    </div>`;
}

function recentItemMarkup(d){
  const meta = decisionMeta(d.analysis?.decision);
  return `
    <div class="recent-item" data-decision-id="${d.purchase.id}">
      <span class="recent-badge" style="background:${meta.color}"></span>
      <div class="recent-meta">
        <div class="recent-name">${escapeHtml(d.purchase.name)}</div>
        <div class="recent-sub">${meta.label} · ${Fmt.relative(d.purchase.createdAt)}</div>
      </div>
      <span class="recent-price">${Fmt.money(d.purchase.price)}</span>
    </div>`;
}

function escapeHtml(s){
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}

/* =========================================================
   ANALYZE — the hero decision-engine experience
========================================================= */
function initAnalyze(){
  const form = document.getElementById('analyze-form');
  const loadingPanel = document.querySelector('.panel-loading');
  const resultPanel = document.getElementById('analyze-result');
  const errEl = document.getElementById('analyze-error');
  const purchaseTypeSel = form.querySelector('[name=purchaseType]');
  const emiFields = form.querySelectorAll('.emi-field');

  purchaseTypeSel.addEventListener('change', () => {
    const isEmi = purchaseTypeSel.value === 'EMI';
    emiFields.forEach(f => f.classList.toggle('hidden', !isEmi));
    emiFields.forEach(f => { const input = f.querySelector('input'); input.required = isEmi; });
  });

  document.getElementById('result-again-btn')?.addEventListener('click', () => {
    resultPanel.classList.add('hidden');
    form.classList.remove('hidden');
    form.reset();
    emiFields.forEach(f => f.classList.add('hidden'));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.textContent = '';
    const fd = new FormData(form);
    const payload = {
      productName: fd.get('productName').trim(),
      name: fd.get('productName').trim(),
      category: fd.get('category').trim(),
      price: Number(fd.get('price')),
      purchaseType: fd.get('purchaseType'),
      monthlyEmi: Number(fd.get('monthlyEmi') || 0),
      durationMonths: fd.get('durationMonths') ? Number(fd.get('durationMonths')) : null,
      reason: fd.get('reason')?.trim() || '',
    };

    form.classList.add('hidden');
    loadingPanel.classList.remove('hidden');
    runScanSequence();

    try {
      const [analysis] = await Promise.all([
        Api.evaluatePurchase(payload),
        wait(2200), // let the analysis sequence play out fully before revealing
      ]);
      loadingPanel.classList.add('hidden');
      renderAnalysisResult(analysis, payload);
      resultPanel.classList.remove('hidden');
    } catch (err) {
      loadingPanel.classList.add('hidden');
      form.classList.remove('hidden');
      errEl.textContent = err.message || 'Could not analyze this purchase.';
    }
  });
}

function wait(ms){ return new Promise(r => setTimeout(r, ms)); }

function runScanSequence(){
  const steps = document.querySelectorAll('#scan-steps li');
  steps.forEach(s => s.classList.remove('active','done'));
  let i = 0;
  function next(){
    if (i > 0) steps[i-1].classList.remove('active'), steps[i-1].classList.add('done');
    if (i < steps.length){
      steps[i].classList.add('active');
      i++;
      setTimeout(next, 520);
    }
  }
  next();
}

function renderAnalysisResult(a, input){
  const meta = decisionMeta(a.decision);
  document.getElementById('result-badge').textContent = meta.label;
  document.getElementById('result-badge').className = `verdict-badge ${meta.cls}`;
  document.getElementById('result-product-name').textContent = input.productName;
  document.getElementById('result-price-line').textContent = `${Fmt.money(a.purchasePrice ?? input.price)} · ${Fmt.titleCase(input.category)}`;

  const score = Math.max(0, Math.min(100, Number(a.score || 0)));
  const dialFill = document.getElementById('result-dial-fill');
  const circumference = 264; // matches path length approx for the arc drawn
  dialFill.style.stroke = meta.color;
  dialFill.style.strokeDasharray = String(circumference);
  dialFill.style.strokeDashoffset = String(circumference);
  requestAnimationFrame(() => {
    setTimeout(() => { dialFill.style.strokeDashoffset = String(circumference * (1 - score/100)); }, 60);
  });
  animateCount(document.getElementById('result-score'), score, { duration: 1000 });

  // Metrics grid — only real fields, skipped when absent
  const metrics = [];
  if (a.affordability) metrics.push(['Affordability', Fmt.titleCase(a.affordability)]);
  if (a.recommendedWaitMonths != null && a.recommendedWaitMonths > 0) metrics.push(['Suggested wait', `${a.recommendedWaitMonths} month${a.recommendedWaitMonths===1?'':'s'}`]);
  if (a.estimatedPurchaseDate) metrics.push(['Estimated buy date', Fmt.monthYear(a.estimatedPurchaseDate)]);
  if (a.savingsAfterPurchase != null) metrics.push(['Savings after', Fmt.money(a.savingsAfterPurchase)]);
  if (a.monthlySurplusAfterPurchase != null) metrics.push(['Monthly surplus after', Fmt.money(a.monthlySurplusAfterPurchase)]);
  if (a.goalDelayMonths != null && a.goalDelayMonths > 0) metrics.push(['Goal delay', `${a.goalDelayMonths} month${a.goalDelayMonths===1?'':'s'}`]);
  if (a.safePriceRange && (a.safePriceRange.min != null || a.safePriceRange.max != null)){
    metrics.push(['Safe price range', `${Fmt.compactMoney(a.safePriceRange.min)} – ${Fmt.compactMoney(a.safePriceRange.max)}`]);
  }
  document.getElementById('result-metrics').innerHTML = metrics.map(([label,val]) => `
    <div class="metric-tile"><div class="metric-tile-label">${label}</div><div class="metric-tile-value">${val}</div></div>`).join('');

  // Reasons
  const reasons = a.reasons?.length ? a.reasons : (a.reasonCodes || []).map(code => ({ type: code, text: Fmt.titleCase(code) }));
  const reasonsSection = document.getElementById('result-reasons-section');
  if (reasons.length){
    document.getElementById('result-reasons').innerHTML = reasons.map(r => `
      <li><span class="reason-tag">${r.type ? Fmt.titleCase(r.type) : ''}</span><span>${escapeHtml(r.text)}</span></li>`).join('');
    reasonsSection.classList.remove('hidden');
  } else { reasonsSection.classList.add('hidden'); }

  // Alternatives
  const altSection = document.getElementById('result-alt-section');
  if (a.alternatives?.length){
    document.getElementById('result-alternatives').innerHTML = a.alternatives.map(alt => `
      <div class="alt-item"><span>${escapeHtml(alt.name)}</span><span class="alt-item-price">${Fmt.money(alt.price)} · ${escapeHtml(alt.impact || '')}</span></div>`).join('');
    altSection.classList.remove('hidden');
  } else { altSection.classList.add('hidden'); }

  // Action plan
  const planSection = document.getElementById('result-plan-section');
  if (a.actionPlan?.length){
    document.getElementById('result-plan').innerHTML = a.actionPlan.map(step => `<li>${escapeHtml(step)}</li>`).join('');
    planSection.classList.remove('hidden');
  } else { planSection.classList.add('hidden'); }

  // AI explanation
  const aiSection = document.getElementById('result-ai-section');
  if (a.aiExplanation){
    document.getElementById('result-ai-text').textContent = a.aiExplanation;
    aiSection.classList.remove('hidden');
  } else { aiSection.classList.add('hidden'); }

  toast(`${meta.label} — analysis complete.`, 'success');
}

/* =========================================================
   GOALS
========================================================= */
let goalsCache = [];

async function initGoals(){
  const skeleton = document.getElementById('goals-skeleton');
  const grid = document.getElementById('goals-grid');
  const empty = document.getElementById('goals-empty');
  const errorBlock = document.getElementById('goals-error');
  skeleton.innerHTML = `<div class="skel skel-card"></div><div class="skel skel-card"></div>`;

  document.getElementById('goal-new-btn').addEventListener('click', () => openGoalModal());
  document.getElementById('goals-empty-cta')?.addEventListener('click', () => openGoalModal());
  document.getElementById('goal-modal-close').addEventListener('click', closeGoalModal);
  document.getElementById('goal-cancel-btn').addEventListener('click', closeGoalModal);
  document.getElementById('goal-modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'goal-modal-backdrop') closeGoalModal(); });
  document.getElementById('goal-form').addEventListener('submit', submitGoalForm);

  await loadGoals();

  async function loadGoals(){
    try {
      const goals = await Api.getGoals();
      goalsCache = goals;
      skeleton.classList.add('hidden');
      if (!goals.length){
        empty.classList.remove('hidden');
        grid.classList.add('hidden');
        return;
      }
      empty.classList.add('hidden');
      grid.classList.remove('hidden');
      grid.innerHTML = goals.map(goalCardMarkup).join('');
      grid.querySelectorAll('[data-edit-goal]').forEach(btn => btn.addEventListener('click', () => openGoalModal(btn.dataset.editGoal)));
      grid.querySelectorAll('[data-delete-goal]').forEach(btn => btn.addEventListener('click', () => deleteGoal(btn.dataset.deleteGoal)));
      requestAnimationFrame(() => {
        grid.querySelectorAll('.goal-ring-fill').forEach(el => {
          el.style.strokeDashoffset = el.dataset.finalOffset;
        });
      });
    } catch (err) {
      skeleton.classList.add('hidden');
      errorBlock.classList.remove('hidden');
      errorBlock.innerHTML = `<h3>Couldn't load your goals</h3><p>${err.message}</p><button class="btn btn-solid" onclick="initGoals()">Retry</button>`;
    }
  }

  window.__reloadGoals = loadGoals;

  function openGoalModal(id){
    const backdrop = document.getElementById('goal-modal-backdrop');
    const form = document.getElementById('goal-form');
    const title = document.getElementById('goal-modal-title');
    const errEl = document.getElementById('goal-form-error');
    form.reset();
    errEl.textContent = '';
    if (id){
      const g = goalsCache.find(x => x.id === id);
      title.textContent = 'Edit goal';
      form.id.value = g.id;
      form.name.value = g.name;
      form.targetAmount.value = g.targetAmount;
      form.currentAmount.value = g.currentAmount;
      form.targetDate.value = g.targetDate;
      form.priority.value = g.priority;
    } else {
      title.textContent = 'New goal';
      form.id.value = '';
    }
    backdrop.classList.remove('hidden');
  }

  function closeGoalModal(){ document.getElementById('goal-modal-backdrop').classList.add('hidden'); }

  async function submitGoalForm(e){
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type=submit]');
    const errEl = document.getElementById('goal-form-error');
    const fd = new FormData(form);
    const id = fd.get('id');
    const payload = {
      name: fd.get('name').trim(),
      targetAmount: Number(fd.get('targetAmount')),
      currentAmount: Number(fd.get('currentAmount') || 0),
      targetDate: fd.get('targetDate'),
      priority: fd.get('priority'),
    };
    btn.classList.add('is-loading'); btn.disabled = true; errEl.textContent = '';
    try {
      if (id) await Api.updateGoal(id, payload); else await Api.createGoal(payload);
      closeGoalModal();
      toast(id ? 'Goal updated.' : 'Goal created.', 'success');
      await loadGoals();
    } catch (err) {
      errEl.textContent = err.message || 'Could not save this goal.';
    } finally {
      btn.classList.remove('is-loading'); btn.disabled = false;
    }
  }

  async function deleteGoal(id){
    if (!confirm('Delete this goal? This cannot be undone.')) return;
    try {
      await Api.deleteGoal(id);
      toast('Goal deleted.', 'success');
      await loadGoals();
    } catch (err) {
      toast(err.message || 'Could not delete this goal.', 'error');
    }
  }
}

function goalCardMarkup(g){
  const pct = g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0;
  const r = 27, c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  const completed = g.status === 'COMPLETED';
  return `
    <div class="goal-card${completed ? ' status-completed' : ''}">
      <div class="goal-card-top">
        <span class="goal-card-name">${escapeHtml(g.name)}</span>
        ${completed ? '<span class="goal-completed-tag">✓ Done</span>' : `<span class="goal-priority p-${g.priority.toLowerCase()}">${g.priority}</span>`}
      </div>
      <div class="goal-progress-row">
        <svg class="goal-ring" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="${r}" class="goal-ring-track"/>
          <circle cx="32" cy="32" r="${r}" class="goal-ring-fill" data-final-offset="${offset}"
            stroke-dasharray="${c}" stroke-dashoffset="${c}" transform="rotate(-90 32 32)"/>
        </svg>
        <div class="goal-amounts">
          <div class="goal-current">${Fmt.compactMoney(g.currentAmount)}</div>
          <div class="goal-target">of ${Fmt.compactMoney(g.targetAmount)} · ${pct}%</div>
        </div>
      </div>
      <div class="goal-facts">
        <span>Target: <b>${Fmt.date(g.targetDate)}</b></span>
        <span>Needs <b>${Fmt.compactMoney(g.requiredMonthlySaving)}</b>/mo</span>
      </div>
      <div class="goal-card-actions">
        <button data-edit-goal="${g.id}">Edit</button>
        <button data-delete-goal="${g.id}">Delete</button>
      </div>
    </div>`;
}

/* =========================================================
   HISTORY
========================================================= */
let historyCache = [];
let historyFilter = 'ALL';

async function initHistory(){
  const skeleton = document.getElementById('history-skeleton');
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  const errorBlock = document.getElementById('history-error');
  skeleton.innerHTML = `<div class="skel skel-row"></div><div class="skel skel-row"></div><div class="skel skel-row"></div>`;
  historyFilter = 'ALL';

  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      historyFilter = chip.dataset.filter;
      renderHistoryList();
    });
  });

  document.getElementById('decision-modal-close').addEventListener('click', closeDecisionModal);
  document.getElementById('decision-modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'decision-modal-backdrop') closeDecisionModal(); });

  try {
    historyCache = (await Api.getHistory()).sort((a,b) => new Date(b.purchase.createdAt) - new Date(a.purchase.createdAt));
    skeleton.classList.add('hidden');
    if (!historyCache.length){
      empty.classList.remove('hidden');
      return;
    }
    list.classList.remove('hidden');
    renderHistoryList();
  } catch (err) {
    skeleton.classList.add('hidden');
    errorBlock.classList.remove('hidden');
    errorBlock.innerHTML = `<h3>Couldn't load your history</h3><p>${err.message}</p><button class="btn btn-solid" onclick="initHistory()">Retry</button>`;
  }

  function renderHistoryList(){
    const filtered = historyFilter === 'ALL' ? historyCache : historyCache.filter(d => d.analysis.decision === historyFilter);
    if (!filtered.length){
      list.innerHTML = `<div class="state-block"><h3>Nothing here</h3><p>No decisions match this filter.</p></div>`;
      return;
    }
    list.innerHTML = filtered.map(d => {
      const meta = decisionMeta(d.analysis.decision);
      return `
      <div class="hist-item" data-id="${d.purchase.id}">
        <span class="hist-badge" style="background:${meta.color}"></span>
        <div class="hist-meta">
          <div class="hist-name">${escapeHtml(d.purchase.name)}</div>
          <div class="hist-sub">${escapeHtml(Fmt.titleCase(d.purchase.category))} · ${Fmt.date(d.purchase.createdAt)}</div>
        </div>
        <div class="hist-right">
          <div class="hist-price">${Fmt.money(d.purchase.price)}</div>
          <div class="hist-verdict" style="color:${meta.color}">${meta.short}</div>
        </div>
      </div>`;
    }).join('');
    list.querySelectorAll('.hist-item').forEach(el => el.addEventListener('click', () => openDecisionModal(el.dataset.id)));
  }
}

function openDecisionModal(id){
  const item = historyCache.find(d => d.purchase.id === id);
  if (!item) return;
  const { purchase, analysis } = item;
  const meta = decisionMeta(analysis.decision);
  document.getElementById('decision-modal-title').textContent = purchase.name;
  document.getElementById('decision-modal-body').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span class="verdict-badge ${meta.cls}">${meta.label}</span>
      <span style="font-family:var(--font-mono);font-size:15px;">${Fmt.money(purchase.price)}</span>
    </div>
    <div class="result-metrics">
      ${analysis.affordability ? metricTile('Affordability', Fmt.titleCase(analysis.affordability)) : ''}
      ${analysis.score != null ? metricTile('Score', analysis.score) : ''}
      ${analysis.recommendedWaitMonths ? metricTile('Suggested wait', analysis.recommendedWaitMonths + ' mo') : ''}
      ${analysis.estimatedPurchaseDate ? metricTile('Est. buy date', Fmt.monthYear(analysis.estimatedPurchaseDate)) : ''}
    </div>
    ${purchase.reason ? `<div class="result-section"><h3>Reason given</h3><p style="font-size:13.5px;color:var(--ink-dim);">${escapeHtml(purchase.reason)}</p></div>` : ''}
    ${analysis.reasons?.length ? `<div class="result-section"><h3>Why</h3><ul class="reason-list">${analysis.reasons.map(r => `<li><span class="reason-tag">${r.type?Fmt.titleCase(r.type):''}</span><span>${escapeHtml(r.text)}</span></li>`).join('')}</ul></div>` : ''}
    ${analysis.aiExplanation ? `<div class="result-section"><h3>Worth Wise's take</h3><p class="ai-explanation">${escapeHtml(analysis.aiExplanation)}</p></div>` : ''}
  `;
  document.getElementById('decision-modal-backdrop').classList.remove('hidden');
}
function metricTile(label, val){ return `<div class="metric-tile"><div class="metric-tile-label">${label}</div><div class="metric-tile-value">${val}</div></div>`; }
function closeDecisionModal(){ document.getElementById('decision-modal-backdrop').classList.add('hidden'); }

/* =========================================================
   PROFILE
========================================================= */
async function initProfile(){
  const skeleton = document.getElementById('profile-skeleton');
  const form = document.getElementById('profile-form');
  const errorBlock = document.getElementById('profile-error-block');
  skeleton.innerHTML = `<div class="skel skel-card"></div><div class="skel skel-card"></div>`;

  document.getElementById('logout-btn').addEventListener('click', () => Api.logout());
  document.getElementById('expense-add-btn').addEventListener('click', () => addExpenseRow('', 0));

  try {
    const [profile, user] = await Promise.all([Api.getProfile(), Api.me().catch(() => currentUserCache)]);
    currentUserCache = user || currentUserCache;
    document.getElementById('account-email-line').textContent = `Signed in as ${currentUserCache?.email || ''}`;

    form.monthlyIncome.value = profile.monthlyIncome ?? '';
    form.currentSavings.value = profile.currentSavings ?? '';
    form.emergencyFundTarget.value = profile.emergencyFundTarget ?? '';
    form.existingEmi.value = profile.existingEmi ?? '';
    form.riskTolerance.value = profile.preferences?.riskTolerance || profile.riskTolerance || 'MODERATE';
    form.savingPriority.value = profile.preferences?.savingPriority || profile.savingPriority || 'BALANCED';
    form.purchasePreference.value = profile.preferences?.purchasePreference || profile.purchasePreference || 'BALANCED';

    const grid = document.getElementById('expense-grid');
    grid.innerHTML = '';
    const breakdown = profile.expenseBreakdown || {};
    const entries = Object.entries(breakdown);
    if (entries.length){
      entries.forEach(([k,v]) => addExpenseRow(k, v));
    } else {
      addExpenseRow('housing', 0);
    }

    skeleton.classList.add('hidden');
    form.classList.remove('hidden');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      const errEl = document.getElementById('profile-error');
      const hint = document.getElementById('profile-save-hint');
      errEl.textContent = '';
      const fd = new FormData(form);
      const expenseBreakdown = {};
      grid.querySelectorAll('.expense-row').forEach(row => {
        const name = row.querySelector('.expense-name').value.trim();
        const amount = Number(row.querySelector('.expense-amount').value || 0);
        if (name) expenseBreakdown[name] = amount;
      });
      const payload = {
        monthlyIncome: Number(fd.get('monthlyIncome') || 0),
        currentSavings: Number(fd.get('currentSavings') || 0),
        emergencyFundTarget: Number(fd.get('emergencyFundTarget') || 0),
        existingEmi: Number(fd.get('existingEmi') || 0),
        expenseBreakdown,
        riskTolerance: fd.get('riskTolerance'),
        savingPriority: fd.get('savingPriority'),
        purchasePreference: fd.get('purchasePreference'),
      };
      btn.classList.add('is-loading'); btn.disabled = true;
      try {
        await Api.updateProfile(payload);
        toast('Profile saved.', 'success');
        hint.textContent = 'Saved just now'; hint.classList.add('show');
        setTimeout(() => hint.classList.remove('show'), 2500);
      } catch (err) {
        errEl.textContent = err.message || 'Could not save your profile.';
      } finally {
        btn.classList.remove('is-loading'); btn.disabled = false;
      }
    });
  } catch (err) {
    skeleton.classList.add('hidden');
    errorBlock.classList.remove('hidden');
    errorBlock.innerHTML = `<h3>Couldn't load your profile</h3><p>${err.message}</p><button class="btn btn-solid" onclick="initProfile()">Retry</button>`;
  }
}

function addExpenseRow(name, amount){
  const grid = document.getElementById('expense-grid');
  const row = document.createElement('div');
  row.className = 'expense-row';
  row.innerHTML = `
    <input type="text" class="expense-name" placeholder="Category" value="${escapeHtml(name)}">
    <input type="number" class="expense-amount" placeholder="0" min="0" step="1" value="${amount || ''}">
    <button type="button" class="expense-row-remove" aria-label="Remove">&times;</button>`;
  row.querySelector('.expense-row-remove').addEventListener('click', () => row.remove());
  grid.appendChild(row);
}
