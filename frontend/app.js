/**
 * Worthwise — API Service Layer
 * ---------------------------------------------------
 * Every function below simulates a future REST endpoint served by a
 * Spring Boot backend (PostgreSQL persistence + a decision engine).
 * UI code never touches raw objects directly — it always calls one of
 * these functions, so swapping the body for a `fetch()` later requires
 * no changes anywhere else in the app.
 *
 * Mapping to future endpoints is noted above each function.
 */

// ---- Theme (dark default, light optional, persisted) -------------------
const ThemeManager = (() => {
  const STORAGE_KEY = 'worthwise_theme';

  function apply(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    document.querySelectorAll('.theme-toggle-label').forEach(el => {
      el.textContent = theme === 'light' ? 'Dark mode' : 'Light mode';
    });
  }

  function current() {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  }

  function toggle() {
    const next = current() === 'light' ? 'dark' : 'light';
    localStorage.setItem(STORAGE_KEY, next);
    apply(next);
  }

  function init() {
    apply(current());
    document.addEventListener('click', (e) => {
      if (e.target.closest('.theme-toggle')) toggle();
    });
  }

  return { init, apply, current, toggle };
})();
document.addEventListener('DOMContentLoaded', ThemeManager.init);

const SpendWiseAPI = (() => {

  // ---- Entity: User -------------------------------------------------
  const user = {
    id: "u_001",
    name: "Guest",
    email: "",
    financialHealthScore: 82,
    financialHealthLabel: "Good",
  };

  // ---- Entity: FinancialProfile --------------------------------------
  const financialProfile = {
    userId: "u_001",
    monthlyIncome: 0,
    monthlyExpenses: 0,
    expenseBreakdown: {
      housing: 0,
      food: 0,
      transport: 0,
      subscriptions: 0,
      other: 0,
    },
    currentSavings: 0,
    savingsGoalId: "",
    existingEmi: 0,
    emergencyFundTarget: 0,
    commitments: [],
    preferences: {
      riskTolerance: "MODERATE",
      savingPriority: "GOAL_FIRST",
      purchasePreference: "VALUE_OVER_BRAND",
    },
    savingsRate: 0,
    debtBurden: "LOW",
    emergencyBuffer: "LOW",
    updatedAt: "",
  };

  // ---- Entity: FinancialGoal[] ---------------------------------------
  const goals = [];

  // ---- Entity: Purchase[] + PurchaseAnalysis[] (= Decisions) ---------
  const decisions = [];

  // ---- Entity: PlannedPurchase[] --------------------------------------
  const plannedPurchases = [];

  // ---------------------------------------------------------------
  // Public "endpoint" functions — async to mirror real network calls
  // ---------------------------------------------------------------

  const delay = (ms) => new Promise((res) => setTimeout(res, ms));
  // ⚠️ IMPORTANT: replace with your actual Render backend URL (no trailing slash).
  const API_BASE = 'https://worthwise-snwh.onrender.com/api';
  let authToken = localStorage.getItem('spendwise_token') || '';

  function isAuthenticated(){
    return Boolean(localStorage.getItem('spendwise_token'));
  }

  async function ensureAuth(){
    if (authToken) return authToken;
    throw new Error('Login required');
  }

  async function authenticate(path, body){
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Authentication failed');
    const data = await res.json();
    authToken = data.token;
    localStorage.setItem('spendwise_token', authToken);
    return data.user;
  }

  // Keep every signed-in screen backend-first. A failed request should be
  // visible to the user instead of being hidden behind local placeholder data.
  async function api(path, options = {}){
    const token = await ensureAuth();
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    if (res.status === 401) {
      localStorage.removeItem('spendwise_token');
      authToken = '';
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      let msg = 'Request failed';
      try { msg = (await res.json()).message || (await res.text()) || msg; } catch (_) { try { msg = await res.text(); } catch (__) {} }
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  function toUiDecision(decision){
    return decision === 'BUY_NOW' ? 'BUY' : decision === 'DONT_BUY' ? 'SKIP' : decision;
  }

  function adaptAnalysis(a){
    return {
      ...a,
      decision: toUiDecision(a.decision),
      estimatedAffordableDate: a.estimatedPurchaseDate,
      goalCompletionAfter: a.goalCompletionDate,
      reasons: a.reasons || [],
      alternatives: a.alternatives || [],
      actionPlan: a.actionPlan || [],
    };
  }

  function adaptProfile(profile){
    const fallbackBreakdown = financialProfile.expenseBreakdown;
    const expenseBreakdown = profile.expenseBreakdown || fallbackBreakdown;
    return {
      ...financialProfile,
      ...profile,
      expenseBreakdown,
      monthlyExpenses: Number(profile.monthlyExpenses ?? Object.values(expenseBreakdown).reduce((sum, val) => sum + Number(val || 0), 0)),
      commitments: profile.commitments || financialProfile.commitments,
      preferences: profile.preferences || financialProfile.preferences,
      savingsRate: Number(profile.savingsRate ?? financialProfile.savingsRate),
      debtBurden: profile.debtBurden || financialProfile.debtBurden,
      emergencyBuffer: profile.emergencyBuffer || financialProfile.emergencyBuffer,
    };
  }

  function adaptDecisionItem(d){
    return { purchase: d.purchase, analysis: adaptAnalysis(d.analysis) };
  }

  // Unauthenticated reads return empty state. Signed-in reads always use the
  // backend and let real errors surface.
  return {
    // GET /api/users/me
    async getCurrentUser() {
      if (!isAuthenticated()) { await delay(80); return { ...user }; }
      return await api('/auth/me');
    },
    isAuthenticated,
    async login(email, password){ return authenticate('/auth/login', { email, password }); },
    async register(email, password, name, gender){ return authenticate('/auth/register', { email, password, name, gender }); },
    logout(){
      authToken = '';
      localStorage.removeItem('spendwise_token');
      window.location.hash = '#/auth';
    },

    // GET /api/profile
    async getFinancialProfile() {
      if (!isAuthenticated()) { await delay(80); return JSON.parse(JSON.stringify(financialProfile)); }
      return adaptProfile(await api('/profile'));
    },

    // PUT /api/profile
    async updateFinancialProfile(patch) {
      if (!isAuthenticated()) {
        await delay(150);
        Object.assign(financialProfile, patch);
        return JSON.parse(JSON.stringify(financialProfile));
      }
      return adaptProfile(await api('/profile', { method: 'PUT', body: JSON.stringify(patch) }));
    },

    // GET /api/goals
    async getGoals() {
      if (!isAuthenticated()) { await delay(80); return JSON.parse(JSON.stringify(goals)); }
      return await api('/goals');
    },

    // GET /api/goals/{id}
    async getGoal(id) {
      if (!isAuthenticated()) {
        await delay(60);
        return JSON.parse(JSON.stringify(goals.find((g) => g.id === id)));
      }
      const all = await api('/goals');
      return all.find((g) => g.id === id) || null;
    },

    // POST /api/goals
    async createGoal(goal) {
      if (!isAuthenticated()) {
        await delay(150);
        const newGoal = { id: "g_" + Date.now(), status: "ACTIVE", currentAmount: 0, ...goal };
        goals.push(newGoal);
        return newGoal;
      }
      return await api('/goals', { method: 'POST', body: JSON.stringify(goal) });
    },

    // GET /api/purchases/history
    async getDecisions() {
      if (!isAuthenticated()) { await delay(100); return []; }
      return (await api('/purchases/history')).map(adaptDecisionItem);
    },

    // GET /api/purchases/{id}
    async getDecision(id) {
      if (!isAuthenticated()) { await delay(80); return null; }
      return adaptDecisionItem(await api(`/purchases/${id}`));
    },

    // GET /api/purchases/planned (derived client-side from history)
    async getPlannedPurchases() {
      if (!isAuthenticated()) { await delay(80); return []; }
      const history = (await api('/purchases/history')).map(adaptDecisionItem);
      return history
        .filter(d => d.analysis.decision === 'WAIT' || d.analysis.decision === 'CONSIDER_ALTERNATIVE')
        .slice(0, 5)
        .map(d => ({
          id: d.purchase.id,
          name: d.purchase.name,
          price: d.purchase.price,
          targetDate: d.analysis.estimatedAffordableDate || d.purchase.createdAt,
          progress: Math.max(5, Math.min(95, d.analysis.score || 20)),
        }));
    },

    // POST /api/purchases/evaluate
    async analyzePurchase(purchaseInput) {
      const payload = {
        productName: purchaseInput.name,
        name: purchaseInput.name,
        category: purchaseInput.category,
        price: purchaseInput.price,
        purchaseType: purchaseInput.purchaseType,
        monthlyEmi: purchaseInput.monthlyEmi || 0,
        durationMonths: purchaseInput.durationMonths || null,
        reason: purchaseInput.reason,
        productUrl: purchaseInput.productUrl,
      };
      if (!isAuthenticated()) {
        await delay(1600); // simulated engine latency for the loading sequence
        return DecisionEngineMock.run(purchaseInput, financialProfile, goals);
      }
      return adaptAnalysis(await api('/purchases/evaluate', { method: 'POST', body: JSON.stringify(payload) }));
    },
  };
})();

/**
 * A safe placeholder goal used anywhere the user has not created a real
 * FinancialGoal yet. Keeps every downstream consumer (the mock decision
 * engine, the narrative builder, and the results/timeline UI) from having
 * to special-case "no goal" — they can always assume goal.name,
 * goal.targetAmount, goal.currentAmount, and goal.targetDate exist.
 */
function withGoalFallback(goal, profile){
  if (goal) return goal;
  return {
    id: null,
    name: 'General Savings',
    targetAmount: 0,
    currentAmount: (profile && profile.currentSavings) || 0,
    targetDate: new Date().toISOString(),
    priority: 'MEDIUM',
    isPlaceholder: true,
  };
}

/**
 * DecisionEngineMock
 * -------------------------------------------------------------
 * Stands in for the future Spring Boot decision engine. Contains just
 * enough logic to produce believable, internally-consistent output for
 * the "What if?" simulator. This entire block is disposable — it will
 * be deleted once POST /api/purchases/{id}/analyze exists server-side.
 */
const DecisionEngineMock = (() => {
  function run(purchase, profile, goalsList) {
    const goal = withGoalFallback(goalsList.find((g) => g.id === profile.savingsGoalId) || goalsList[0], profile);
    return simulate(purchase, profile, goal, { waitMonths: 0, extraSaving: 0, discount: 0 });
  }

  // Re-runs the engine for arbitrary simulator inputs (used by analyze.js)
  function simulate(purchase, profile, goal, { waitMonths = 0, extraSaving = 0, discount = 0 }) {
    goal = withGoalFallback(goal, profile);
    const monthlySurplus = profile.monthlyIncome - profile.monthlyExpenses;
    const effectivePrice = Math.max(purchase.price - discount, 0);
    const savingsAfterPurchase = profile.currentSavings - effectivePrice + monthlySurplus * waitMonths + extraSaving * waitMonths;
    const surplusAfterPurchase = monthlySurplus - (purchase.monthlyEmi || 0) + (waitMonths > 0 ? extraSaving : 0) - (waitMonths > 0 ? extraSaving : 0);
    const monthlyAvailableForGoal = monthlySurplus - (purchase.monthlyEmi || 0);

    const remainingForGoal = Math.max(goal.targetAmount - goal.currentAmount, 0);
    const baselineMonths = monthlySurplus > 0 ? remainingForGoal / monthlySurplus : Infinity;
    const impactedMonths = (monthlyAvailableForGoal + extraSaving) > 0
      ? remainingForGoal / (monthlyAvailableForGoal + extraSaving)
      : Infinity;

    const goalDelayMonthsRaw = (isFinite(impactedMonths) && isFinite(baselineMonths)) ? (impactedMonths - baselineMonths) : 0;
    const goalDelayMonths = Math.max(Math.round(goalDelayMonthsRaw), 0);

    const bufferRatio = profile.currentSavings > 0 ? savingsAfterPurchase / profile.currentSavings : 0;
    let decision = "BUY";
    if (effectivePrice > profile.currentSavings * 0.6 && goalDelayMonths >= 2) decision = "WAIT";
    if (effectivePrice > profile.currentSavings) decision = "SKIP";
    if (waitMonths >= 3 || discount >= purchase.price * 0.15) decision = waitMonths > 0 ? "BUY" : decision;
    if (bufferRatio < 0.1 && waitMonths === 0) decision = "SKIP";

    const addMonths = (dateStr, months) => {
      const d = new Date(dateStr);
      d.setMonth(d.getMonth() + months);
      return d;
    };

    const purchaseDate = addMonths(new Date().toISOString(), waitMonths);
    const goalCompletionAfter = addMonths(goal.targetDate, waitMonths > 0 ? Math.max(goalDelayMonths - waitMonths, 0) : goalDelayMonths);

    return {
      decision,
      affordability: effectivePrice <= profile.currentSavings ? "AFFORDABLE" : "CONDITIONALLY_AFFORDABLE",
      estimatedPurchaseDate: purchaseDate.toISOString(),
      goalCompletionDate: goalCompletionAfter.toISOString(),
      goalDelayMonths: Math.max(goalDelayMonths - waitMonths, 0),
      savingsAfterPurchase: Math.round(savingsAfterPurchase),
      monthlySurplusAfterPurchase: Math.round(monthlyAvailableForGoal + extraSaving),
    };
  }

  return { run, simulate };
})();
/**
 * Worthwise — shared shell logic used across every app page.
 */

const Fmt = {
  currency(n){
    const rounded = Math.round(n);
    return '₹' + rounded.toLocaleString('en-IN');
  },
  compactMonth(dateStr){
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  },
  fullMonth(dateStr){
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  },
  shortDate(dateStr){
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  },
  relativeDays(dateStr){
    const diff = Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000);
    if (diff <= 0) return 'today';
    if (diff === 1) return '1 day ago';
    if (diff < 7) return `${diff} days ago`;
    const weeks = Math.round(diff / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
};

// Animate a number counting up — used for headline stats.
function animateCount(el, target, { prefix = '', duration = 900, decimals = 0 } = {}){
  const start = 0;
  const startTime = performance.now();
  function tick(now){
    const p = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = start + (target - start) * eased;
    el.textContent = prefix + Math.round(val).toLocaleString('en-IN');
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = prefix + Math.round(target).toLocaleString('en-IN');
  }
  requestAnimationFrame(tick);
}

const NAV_ITEMS = [
  { href: 'dashboard.html', route: '#/dashboard', label: 'Overview', icon: 'grid' },
  { href: 'analyze.html', route: '#/analyze', label: 'Analyze Purchase', icon: 'scan' },
  { href: 'decisions.html', route: '#/decisions', label: 'My Decisions', icon: 'list' },
  { href: 'goals.html', route: '#/goals', label: 'Goals', icon: 'target' },
  { href: 'profile.html', route: '#/profile', label: 'Financial Profile', icon: 'sliders' },
  { href: 'profile.html#settings', route: '#/profile', scrollTarget: 'settings-card', label: 'Settings', icon: 'settings' },
];

let currentUserCache = { name: 'User', email: '' };

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  scan: '<path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/><circle cx="12" cy="12" r="3.2"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.4"/><circle cx="3.5" cy="12" r="1.4"/><circle cx="3.5" cy="18" r="1.4"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M9 12h11M4 18h13M19 18h1"/><circle cx="14" cy="6" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
};

/* ============================================================================
 * COLORFUL ICON SET (inline SVG, no external requests)
 * Multi-colour flat icons drawn in the style of free sets such as Fluent
 * Emoji / Flaticon / Icons8 "color" - kept inline so they never break offline.
 * Use: cIcon('grid', 20)
 * ========================================================================== */
const CICONS = {
  grid: '<rect x="3" y="3" width="8" height="8" rx="2.2" fill="#60A5FA"/><rect x="13" y="3" width="8" height="8" rx="2.2" fill="#F472B6"/><rect x="3" y="13" width="8" height="8" rx="2.2" fill="#FBBF24"/><rect x="13" y="13" width="8" height="8" rx="2.2" fill="#34D399"/>',
  scan: '<circle cx="10.5" cy="10.5" r="7" fill="#DDD6FE" stroke="#8B5CF6" stroke-width="2.2"/><path d="M8 10.5h5M10.5 8v5" stroke="#7C3AED" stroke-width="1.8" stroke-linecap="round"/><path d="m15.8 15.8 5.2 5.2" stroke="#F59E0B" stroke-width="3.2" stroke-linecap="round"/>',
  list: '<rect x="4" y="4" width="16" height="17" rx="3" fill="#38BDF8"/><rect x="8.5" y="2" width="7" height="4.5" rx="2" fill="#0284C7"/><path d="M8 11.5h8M8 15.5h5" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/><circle cx="17" cy="16.5" r="3.6" fill="#22C55E"/><path d="m15.4 16.5 1.2 1.2 2-2.3" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
  target: '<circle cx="12" cy="12" r="9.5" fill="#F87171"/><circle cx="12" cy="12" r="6.6" fill="#FFF"/><circle cx="12" cy="12" r="3.8" fill="#EF4444"/><circle cx="12" cy="12" r="1.4" fill="#FFF"/><path d="m12 12 8.2-8.2M17.5 3.5h3v3" stroke="#FBBF24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  sliders: '<rect x="2" y="6" width="20" height="14" rx="3.5" fill="#10B981"/><path d="M2 10a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v.5H2V10Z" fill="#059669"/><rect x="14" y="11.5" width="8" height="5.2" rx="2.6" fill="#FBBF24"/><circle cx="17.3" cy="14.1" r="1.2" fill="#fff"/><rect x="5" y="3" width="11" height="4" rx="2" fill="#6EE7B7"/>',
  settings: '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" fill="#FB923C" stroke="#EA580C" stroke-width="1"/><circle cx="12" cy="12" r="3.4" fill="#FFF7ED" stroke="#EA580C" stroke-width="1.4"/>',
  user: '<circle cx="12" cy="8" r="4.5" fill="#FBBF24"/><path d="M3.5 21c0-4.7 3.8-8 8.5-8s8.5 3.3 8.5 8v.5h-17V21Z" fill="#6366F1"/><circle cx="10.4" cy="7.6" r=".8" fill="#78350F"/><circle cx="13.6" cy="7.6" r=".8" fill="#78350F"/>',
  logout: '<path d="M10 3H6a2.5 2.5 0 0 0-2.5 2.5v13A2.5 2.5 0 0 0 6 21h4" stroke="#94A3B8" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M11 12h10M17 7.5l4.5 4.5-4.5 4.5" stroke="#F87171" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  income: '<circle cx="12" cy="12" r="10" fill="#FBBF24"/><circle cx="12" cy="12" r="7.6" fill="#FCD34D" stroke="#F59E0B" stroke-width="1"/><path d="M8.5 8h7M8.5 11h7M10 8c3.3 0 4.6 1.4 4.6 2.8S13.3 13.6 10 13.6l4.6 4" stroke="#92400E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  expense: '<rect x="2" y="5" width="20" height="14" rx="3" fill="#F87171"/><rect x="2" y="9" width="20" height="3.4" fill="#7F1D1D"/><rect x="5" y="15" width="6" height="2" rx="1" fill="#FECACA"/><circle cx="18" cy="16" r="1.4" fill="#FCA5A5"/>',
  surplus: '<rect x="3" y="14" width="4" height="7" rx="1.2" fill="#86EFAC"/><rect x="10" y="10" width="4" height="11" rx="1.2" fill="#4ADE80"/><rect x="17" y="6" width="4" height="15" rx="1.2" fill="#16A34A"/><path d="m3 9 5-4.5 3.5 2.8L18 2.5" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M14.5 2.3H18.3v3.8" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  savings: '<path d="M12 2 2.5 7.5h19L12 2Z" fill="#818CF8"/><rect x="4.5" y="9.5" width="3" height="8" rx="1" fill="#C7D2FE"/><rect x="10.5" y="9.5" width="3" height="8" rx="1" fill="#C7D2FE"/><rect x="16.5" y="9.5" width="3" height="8" rx="1" fill="#C7D2FE"/><rect x="2.5" y="18.5" width="19" height="3" rx="1.2" fill="#6366F1"/><circle cx="12" cy="5.6" r="1.1" fill="#FBBF24"/>',
  shield: '<path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z" fill="#34D399"/><path d="M12 2v20c4.5-2.5 8-6 8-11V5l-8-3Z" fill="#10B981"/><path d="m8.6 11.8 2.5 2.5 4.5-4.8" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  laptop: '<rect x="4" y="4" width="16" height="11" rx="2" fill="#60A5FA"/><rect x="6" y="6" width="12" height="7" rx="1" fill="#DBEAFE"/><path d="M2 18h20l-1.4-3H3.4L2 18Z" fill="#94A3B8"/><rect x="2" y="18" width="20" height="2" rx="1" fill="#64748B"/>',
  plane: '<path d="M21.5 2.5 2.5 10l7 2.5 2.5 7 9.5-17Z" fill="#38BDF8"/><path d="M21.5 2.5 9.5 12.5l.4 4.2L12 19.5l9.5-17Z" fill="#0EA5E9"/><path d="m9.5 12.5 12-10" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17Z" fill="#F59E0B"/><path d="M20 19H6.5A2.5 2.5 0 0 0 4 21.5H20V19Z" fill="#FEF3C7"/><rect x="8" y="5.5" width="8" height="2.2" rx="1.1" fill="#FEF3C7"/><rect x="8" y="9.5" width="6" height="2" rx="1" fill="#FDE68A"/>',
  electronics: '<rect x="2.5" y="3.5" width="19" height="13" rx="2.2" fill="#A78BFA"/><rect x="4.5" y="5.5" width="15" height="9" rx="1" fill="#EDE9FE"/><path d="m8 12 2.6-3 2 2 1.8-1.6L17 12" stroke="#8B5CF6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><rect x="10.5" y="16.5" width="3" height="3" fill="#7C3AED"/><rect x="7" y="19.5" width="10" height="2" rx="1" fill="#6D28D9"/>',
  fitness: '<rect x="2" y="9" width="3" height="6" rx="1.2" fill="#F87171"/><rect x="5" y="6.5" width="3.5" height="11" rx="1.5" fill="#EF4444"/><rect x="8.5" y="10.8" width="7" height="2.4" fill="#94A3B8"/><rect x="15.5" y="6.5" width="3.5" height="11" rx="1.5" fill="#EF4444"/><rect x="19" y="9" width="3" height="6" rx="1.2" fill="#F87171"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3" stroke="#EC4899" stroke-width="2.4" stroke-linecap="round" fill="none"/><rect x="2.5" y="13.5" width="5" height="8" rx="2.2" fill="#F472B6"/><rect x="16.5" y="13.5" width="5" height="8" rx="2.2" fill="#F472B6"/><rect x="4" y="15.5" width="2" height="4" rx="1" fill="#BE185D"/><rect x="18" y="15.5" width="2" height="4" rx="1" fill="#BE185D"/>',
  plus: '<circle cx="12" cy="12" r="10" fill="#2FD196"/><path d="M12 7v10M7 12h10" stroke="#06281C" stroke-width="2.4" stroke-linecap="round"/>',
};
// Icons loaded directly from the Flaticon CDN (credits are in the landing-page footer).
// Any name not listed here falls back to the built-in colorful SVG in CICONS.
const IMG_ICONS = {
  grid: 'https://cdn-icons-png.flaticon.com/512/10397/10397171.png',
  scan: 'https://cdn-icons-png.flaticon.com/512/2586/2586879.png',
  list: 'https://cdn-icons-png.flaticon.com/512/11689/11689173.png',
  target: 'https://cdn-icons-png.flaticon.com/512/860/860511.png',
  settings: 'https://cdn-icons-png.flaticon.com/512/1790/1790042.png',
  logout: 'https://cdn-icons-png.flaticon.com/512/10309/10309341.png',
  income: 'https://cdn-icons-png.flaticon.com/512/2806/2806360.png',
  expense: 'https://cdn-icons-png.flaticon.com/512/18558/18558197.png',
  savings: 'https://cdn-icons-png.flaticon.com/512/584/584052.png',
  user: 'https://cdn-icons-png.flaticon.com/512/3135/3135768.png',
  sliders: 'https://cdn-icons-png.flaticon.com/512/3135/3135768.png',
  surplus: 'https://cdn-icons-png.flaticon.com/512/2285/2285545.png',
  shield: 'https://cdn-icons-png.flaticon.com/512/595/595764.png',
  laptop: 'https://cdn-icons-png.flaticon.com/512/428/428001.png',
  plane: 'https://cdn-icons-png.flaticon.com/512/2831/2831972.png',
  book: 'https://cdn-icons-png.flaticon.com/512/3389/3389081.png',
  electronics: 'https://cdn-icons-png.flaticon.com/512/900/900618.png',
  fitness: 'https://cdn-icons-png.flaticon.com/512/7198/7198839.png',
  headphones: 'https://cdn-icons-png.flaticon.com/512/6190/6190871.png',
};
function cIcon(name, size = 20){
  if (IMG_ICONS[name]) return `<img class="cicon cicon-img cicon-${name}" src="${IMG_ICONS[name]}" width="${size}" height="${size}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  return `<svg class="cicon cicon-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">${CICONS[name] || CICONS.grid}</svg>`;
}

function logoMarkup(){
  return `
  <div class="logo">
    <svg class="logo-mark" width="28" height="28" viewBox="0 0 26 26" fill="none">
      <rect x="1" y="6" width="24" height="17" rx="4" fill="#2FD196"/>
      <path d="M1 10.5C1 8.01 3.01 6 5.5 6H21c2.21 0 4 1.79 4 4v1H1v-.5Z" fill="#1B9E75"/>
      <circle cx="18.5" cy="14.5" r="3.1" fill="#0A0C0F"/>
      <path d="M17 14.6l1.1 1.1 2-2.2" stroke="#2FD196" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
    <span class="logo-word">Worthwise</span>
  </div>`;
}

function sidebarMarkup(activePath){
  const activeRoute = '#/' + activePath.replace('.html','');
  const items = NAV_ITEMS.map(item => {
    const isActive = item.scrollTarget ? false : (activeRoute === item.route);
    return `<a class="nav-link${isActive ? ' active' : ''}" href="${item.route}"${item.scrollTarget ? ` data-scroll-target="${item.scrollTarget}"` : ''}>
      ${cIcon(item.icon, 20)}
      ${item.label}
    </a>`;
  }).join('');

  return `
    ${logoMarkup()}
    <nav class="nav-group">${items}</nav>
    <div class="sidebar-spacer"></div>
    <button class="sidebar-cta btn-block" onclick="window.location.hash='#/analyze'">
      ${cIcon('plus', 18)}
      Analyze a Purchase
    </button>
    <div class="health-mini mt-16">
      <div class="label">Your Financial Health</div>
      <div class="value"><span class="dot"></span> Good</div>
    </div>
    <a class="profile-mini" href="#/profile">
      <div class="avatar">CH</div>
      <div>
        <div class="pname">${currentUserCache.name || 'User'}</div>
        <div class="pemail">${currentUserCache.email || ''}</div>
      </div>
    </a>
    <button type="button" id="theme-toggle" class="theme-toggle theme-toggle-sidebar btn-block mt-8" aria-label="Toggle light/dark theme" title="Toggle theme">
      <span class="theme-toggle-icon icon-sun">☀</span>
      <span class="theme-toggle-icon icon-moon">☾</span>
      <span class="theme-toggle-label">Light mode</span>
    </button>
    <button class="btn btn-ghost btn-block btn-sm mt-8" onclick="SpendWiseAPI.logout()">Logout</button>
  `;
}

/**
 * FIX (issue 3): this used to render the full topbar — including the
 * hamburger drawer-toggle — unconditionally, on every page including the
 * logged-out auth screen. The backend already refuses those routes, but
 * the UI still showed the button and, once tapped, the full app nav
 * inside the drawer. Now it takes the auth state explicitly: logged-out
 * users get just the logo (no toggle button, nothing to open), logged-in
 * users get the normal topbar with the drawer + quick-analyze shortcut.
 */
function mobileTopbarMarkup(authed){
  if (!authed) {
    return `<div class="mobile-topbar">${logoMarkup()}</div>`;
  }
  return `
    <div class="mobile-topbar">
      <button class="drawer-toggle" aria-label="Open menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      ${logoMarkup()}
      <a href="#/analyze" class="mobile-cta" aria-label="Analyze a purchase">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </a>
    </div>
    <div class="drawer-overlay"></div>
  `;
}

/**
 * FIX (issue 3, continued): initShell() now checks SpendWiseAPI.isAuthenticated()
 * before rendering anything into the sidebar. When logged out, the sidebar
 * element is emptied AND hidden (display:none) and the mobile topbar renders
 * without a drawer toggle — so there is nothing to click and nothing to see,
 * on desktop or mobile, until the user actually logs in. This does not touch
 * any backend/auth call — isAuthenticated() itself is unchanged.
 */
function initShell(){
  const path = (SpendWiseRouter.currentRoute || 'dashboard') + '.html';
  const sidebar = document.getElementById('sidebar');
  const topbarSlot = document.getElementById('mobile-topbar-slot');
  const authed = SpendWiseAPI.isAuthenticated();

  if (topbarSlot) topbarSlot.innerHTML = mobileTopbarMarkup(authed);

  if (!authed) {
    if (sidebar) { sidebar.innerHTML = ''; sidebar.style.display = 'none'; }
    removeMobileBottomNav();
    return;
  }

  if (sidebar) {
    sidebar.style.display = '';
    sidebar.innerHTML = sidebarMarkup(path);
  }

  // Mobile-only bottom navigation + account sheet (hidden on desktop via CSS).
  renderMobileBottomNav(SpendWiseRouter.currentRoute || 'dashboard');

  // Mobile drawer behaviour (only relevant when the toggle button exists,
  // i.e. only for logged-in users — see mobileTopbarMarkup above).
  const toggle = document.querySelector('.drawer-toggle');
  const overlay = document.querySelector('.drawer-overlay');
  function openDrawer(){
    sidebar.classList.add('open');
    overlay.classList.add('visible');
  }
  function closeDrawer(){
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
  }
  if (toggle) toggle.addEventListener('click', openDrawer);
  if (overlay) overlay.addEventListener('click', closeDrawer);
  sidebar?.addEventListener('click', (e) => {
    if (e.target.closest('a.nav-link') || e.target.closest('a.profile-mini')) closeDrawer();
  });
}

/* ==========================================================================
 * Mobile bottom navigation + Account sheet (phones/tablets <= 900px only).
 * On desktop the sidebar is used and none of this is visible (see CSS).
 * Tabs: Overview, Analyze, Decisions, Goals, Account. The Account tab opens
 * a sheet with the logged-in email, Financial Profile, Settings and Logout.
 * ========================================================================== */
const BOTTOM_TABS = [
  { key: 'dashboard', route: '#/dashboard', label: 'Overview',  icon: 'grid'   },
  { key: 'analyze',   route: '#/analyze',   label: 'Analyze',   icon: 'scan'   },
  { key: 'decisions', route: '#/decisions', label: 'Decisions', icon: 'list'   },
  { key: 'goals',     route: '#/goals',     label: 'Goals',     icon: 'target' },
];
const EXTRA_ICONS = {
  user:   '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
};
function bnSvg(inner, size = 22){
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
function userInitials(user){
  const src = (user && user.name && user.name !== 'User') ? user.name : ((user && user.email) || '');
  const base = src.split('@')[0].replace(/[^a-zA-Z0-9 ._-]/g, '');
  const parts = base.split(/[ ._-]+/).filter(Boolean);
  const ini = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || 'U').slice(0, 2);
  return ini.toUpperCase();
}

function removeMobileBottomNav(){
  ['mobile-bottom-nav', 'account-overlay', 'account-sheet'].forEach(id => document.getElementById(id)?.remove());
  document.body.classList.remove('sheet-open');
}

function renderMobileBottomNav(activeKey){
  removeMobileBottomNav();

  const accountActive = activeKey === 'profile';
  const nav = document.createElement('nav');
  nav.id = 'mobile-bottom-nav';
  nav.className = 'bottom-nav';
  nav.setAttribute('aria-label', 'Main navigation');
  nav.innerHTML = BOTTOM_TABS.map(t => `
    <a class="bn-item${activeKey === t.key ? ' active' : ''}" href="${t.route}"${activeKey === t.key ? ' aria-current="page"' : ''}>
      <span class="bn-ico">${cIcon(t.icon, 24)}</span><span class="bn-label">${t.label}</span>
    </a>`).join('') + `
    <button type="button" class="bn-item${accountActive ? ' active' : ''}" id="bn-account" aria-haspopup="dialog" aria-expanded="false">
      <span class="bn-ico">${cIcon('user', 24)}</span><span class="bn-label">Account</span>
    </button>`;

  const overlay = document.createElement('div');
  overlay.id = 'account-overlay';
  overlay.className = 'account-overlay';

  const sheet = document.createElement('div');
  sheet.id = 'account-sheet';
  sheet.className = 'account-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Account');
  sheet.innerHTML = `
    <div class="as-grabber"></div>
    <div class="as-user">
      <div class="avatar as-avatar" id="as-avatar">U</div>
      <div class="as-user-text">
        <div class="as-label">Signed in as</div>
        <div class="as-email" id="as-email"></div>
      </div>
    </div>
    <div class="as-health"><span>Your financial health</span><b><span class="dot"></span> Good</b></div>
    <a class="as-link" href="#/profile">
      <span class="as-ico as-ico-profile">${cIcon('sliders', 22)}</span>
      <span class="as-link-text"><b>Financial Profile</b><small>Income, expenses, savings &amp; preferences</small></span>
    </a>
    <a class="as-link" href="#/profile?view=settings">
      <span class="as-ico as-ico-settings">${cIcon('settings', 22)}</span>
      <span class="as-link-text"><b>Settings</b><small>Notifications &amp; currency</small></span>
    </a>
    <button type="button" class="as-logout" id="as-logout">${cIcon('logout', 20)}<span>Logout</span></button>`;

  document.body.append(nav, overlay, sheet);

  const accountBtn = nav.querySelector('#bn-account');
  function openSheet(){
    // Read the user at open-time so the email is always the current login.
    const u = currentUserCache || {};
    sheet.querySelector('#as-email').textContent = u.email || u.name || 'Your account';
    sheet.querySelector('#as-avatar').textContent = userInitials(u);
    sheet.classList.add('open');
    overlay.classList.add('visible');
    document.body.classList.add('sheet-open');
    accountBtn.setAttribute('aria-expanded', 'true');
  }
  function closeSheet(){
    sheet.classList.remove('open');
    overlay.classList.remove('visible');
    document.body.classList.remove('sheet-open');
    accountBtn.setAttribute('aria-expanded', 'false');
  }
  accountBtn.addEventListener('click', () => sheet.classList.contains('open') ? closeSheet() : openSheet());
  overlay.addEventListener('click', closeSheet);
  sheet.addEventListener('click', (e) => { if (e.target.closest('a.as-link')) closeSheet(); });
  sheet.querySelector('#as-logout').addEventListener('click', () => {
    closeSheet();
    SpendWiseAPI.logout();
  });

  // One-time global listeners (Esc to close, close if resized up to desktop).
  if (!window.__bottomNavGlobals) {
    window.__bottomNavGlobals = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.getElementById('account-overlay')?.click();
    });
    window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => {
      if (e.matches) document.getElementById('account-overlay')?.click();
    });
  }
}

/**
 * Builds an SVG semi-circular "Decision Dial" — the product's signature
 * visual motif. Used on the dashboard (financial health) and on the
 * analysis results page (the big recommendation).
 * value: 0-100, color: css color, size: px
 */
function decisionDial({ value, color = 'var(--pine)', size = 180, trackColor = 'var(--surface-sunk)' }){
  const r = 70;
  const cx = 90, cy = 90;
  const circumference = Math.PI * r; // half circle
  const offset = circumference * (1 - value / 100);
  return `
  <svg width="${size}" height="${size * 0.62}" viewBox="0 0 180 112" fill="none">
    <path d="M20 90 A70 70 0 0 1 160 90" stroke="${trackColor}" stroke-width="14" stroke-linecap="round"/>
    <path d="M20 90 A70 70 0 0 1 160 90" stroke="${color}" stroke-width="14" stroke-linecap="round"
      stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
      style="transition: stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1);"/>
  </svg>`;
}

document.addEventListener('DOMContentLoaded', initShell);

// Cursor-reactive spotlight on the landing hero card (see .hero-frame::after
// in styles.css). Plain CSS custom properties, no per-frame layout work.
document.addEventListener('DOMContentLoaded', () => {
  const heroFrame = document.querySelector('.hero-frame');
  if (!heroFrame) return;
  heroFrame.addEventListener('mousemove', (e) => {
    const rect = heroFrame.getBoundingClientRect();
    heroFrame.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    heroFrame.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
  });
});

// Greeting based on the user's current local (device) time.
function timeGreeting(date = new Date()){
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 21) return 'Good evening';
  return 'Good night';
}

// Salutation based on the user's gender, chosen at registration.
function genderTitle(gender){
  if (gender === 'MALE') return 'Mr.';
  if (gender === 'FEMALE') return 'Ms.';
  return '';
}

async function loadDashboard(){
  if (!SpendWiseAPI.isAuthenticated()) return;
  if (!document.getElementById('greeting')) return; // not on the dashboard page
  try {
    const [user, profile, goals, decisions, planned] = await Promise.all([
      SpendWiseAPI.getCurrentUser(),
      SpendWiseAPI.getFinancialProfile(),
      SpendWiseAPI.getGoals(),
      SpendWiseAPI.getDecisions(),
      SpendWiseAPI.getPlannedPurchases(),
    ]);

    currentUserCache = user;
    const title = genderTitle(user.gender);
    const who = user.name ? `${title} ${user.name}`.trim() : 'there';
    document.getElementById('greeting').textContent = `${timeGreeting()}, ${who}`;
    initShell();

    renderSnapshot(profile);
    renderHealth(user, profile);
    renderGoal(goals[0] || null);
    renderDecisions(decisions);
    renderPlanned(planned);
  } catch (err) {
    console.error('Failed to load dashboard from backend:', err);
    const greeting = document.getElementById('greeting');
    if (greeting) greeting.textContent = 'Could not load your data — is the backend running?';
    if (err && err.message === 'Unauthorized') window.location.hash = '#/auth';
  }
}
document.addEventListener('DOMContentLoaded', loadDashboard);

function iconSvg(path, size = 18){
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

const ICON = {
  income: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  expense: '<path d="M3 7h18M3 12h18M3 17h11"/>',
  surplus: '<path d="M3 17l6-6 4 4 8-8M21 7h-6M21 7v6"/>',
  savings: '<rect x="2" y="7" width="20" height="13" rx="2"/><path d="M16 7V5a4 4 0 0 0-8 0v2"/><circle cx="12" cy="13.5" r="2"/>',
  shield: '<path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z"/>',
  laptop: '<rect x="4" y="4" width="16" height="10" rx="1.5"/><path d="M2 18h20l-1.5-3H3.5L2 18Z"/>',
  plane: '<path d="M12 2 3 14l4-1 2 4 3-6 3 6 2-4 4 1L12 2Z"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17Z"/><path d="M20 19H6.5A2.5 2.5 0 0 0 4 21.5"/>',
  electronics: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
  fitness: '<path d="M6 8v8M18 8v8M2 12h2M20 12h2M6 12h12"/>',
  headphones: '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="2.5" y="14" width="5" height="7" rx="1.5"/><rect x="16.5" y="14" width="5" height="7" rx="1.5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  warn: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
};

function renderSnapshot(profile){
  const income = Number(profile.monthlyIncome || 0);
  const expenses = Number(profile.monthlyExpenses || 0);
  const savings = Number(profile.currentSavings || 0);
  const emergencyTarget = Number(profile.emergencyFundTarget || 0);
  const surplus = income - expenses;
  const expenseRatio = income > 0 ? Math.round(expenses / income * 100) : 0;
  const savingsRate = income > 0 ? Math.round(Math.max(surplus, 0) / income * 100) : 0;
  const emergencyPct = emergencyTarget > 0 ? Math.round(Math.min(savings / emergencyTarget * 100, 999)) : 0;
  const cards = [
    { title: 'Monthly Income', value: income, icon: 'income', indicator: income > 0 ? 'Saved in your profile' : 'Add income in profile', tone: 'flat' },
    { title: 'Monthly Expenses', value: expenses, icon: 'expense', indicator: `${expenseRatio}% of income`, tone: expenseRatio > 80 ? 'down' : 'flat' },
    { title: 'Available Monthly Surplus', value: surplus, icon: 'surplus', indicator: `${savingsRate}% savings rate`, tone: surplus >= 0 ? 'up' : 'down' },
    { title: 'Current Savings', value: savings, icon: 'savings', indicator: emergencyTarget > 0 ? `${emergencyPct}% toward emergency target` : 'Set emergency target', tone: savings >= emergencyTarget ? 'up' : 'flat' },
  ];

  const grid = document.getElementById('snapshot-grid');
  grid.innerHTML = cards.map((c, i) => `
    <div class="snapshot-card fade-up" style="animation-delay:${i*60}ms">
      <div class="top-row">
        <span class="title">${c.title}</span>
        <span class="icon-wrap">${cIcon(c.icon, 22)}</span>
      </div>
      <div class="value num" data-target="${c.value}">₹0</div>
      <div class="indicator ${c.tone}">
        ${c.tone === 'up' ? iconSvg('<path d="M18 6 6 18M18 6H9M18 6v9"/>', 12) : ''}
        ${c.indicator}
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.value').forEach(el => {
    animateCount(el, Number(el.dataset.target), { prefix: '₹' });
  });
}

function renderHealth(user, profile){
  const el = document.getElementById('health-card');
  const income = Number(profile.monthlyIncome || 0);
  const expenses = Number(profile.monthlyExpenses || 0);
  const savings = Number(profile.currentSavings || 0);
  const emergencyTarget = Number(profile.emergencyFundTarget || 0);
  const surplus = income - expenses;
  const savingsRate = income > 0 ? Math.max(surplus, 0) / income : 0;
  const emergencyRatio = emergencyTarget > 0 ? Math.min(savings / emergencyTarget, 1) : 0;
  const score = Math.round(Math.min(100, savingsRate * 55 + emergencyRatio * 35 + (surplus >= 0 ? 10 : 0)));
  const label = score >= 75 ? 'Good' : score >= 45 ? 'Needs attention' : 'Set up profile';
  const healthCopy = income <= 0
    ? 'Add your real income, expenses, savings, and goals. Worthwise will update this score from your saved database profile.'
    : surplus < 0
      ? 'Your monthly expenses are higher than your income, so purchases should wait until cash flow improves.'
      : 'This score is calculated from your saved income, expenses, surplus, and emergency fund progress.';
  el.innerHTML = `
    <h2 class="section-title">Financial Health</h2>
    <div class="health-top mt-16">
      <div class="health-dial-wrap">
        ${decisionDial({ value: score, color: score >= 75 ? 'var(--buy)' : score >= 45 ? 'var(--wait)' : 'var(--skip)', size: 170 })}
        <div class="health-score-label">
          <div class="n">${score}<span style="font-size:16px;color:var(--ink-faint);">/100</span></div>
          <div class="l">${label}</div>
        </div>
      </div>
      <p class="health-desc">${healthCopy}</p>
    </div>
    <div class="health-metrics">
      <div class="health-metric"><span class="m-label">Savings Rate</span><span class="m-value">${Math.round(profile.savingsRate*100)}%</span></div>
      <div class="health-metric"><span class="m-label">Monthly Surplus</span><span class="m-value">${Fmt.currency(surplus)}</span></div>
      <div class="health-metric"><span class="m-label">Debt Burden</span><span class="m-value">${cap(profile.debtBurden)}</span></div>
      <div class="health-metric"><span class="m-label">Emergency Buffer</span><span class="m-value">${cap(profile.emergencyBuffer)}</span></div>
    </div>
  `;
}

function cap(s){ return s.charAt(0) + s.slice(1).toLowerCase(); }

function renderGoal(goal){
  const el = document.getElementById('goal-card');
  if (!goal) {
    el.innerHTML = emptyState('No goals yet', 'Create a financial goal so purchase decisions can account for your timeline.');
    return;
  }
  const pct = goal.targetAmount > 0 ? Math.round(goal.currentAmount / goal.targetAmount * 100) : 0;
  const remaining = goal.targetAmount - goal.currentAmount;
  el.innerHTML = `
    <div class="goal-icon">${cIcon('shield', 24)}</div>
    <h2 class="section-title" style="margin-bottom:2px;">${goal.name}</h2>
    <p class="section-sub">Your top priority goal right now</p>
    <div class="goal-amounts">
      <span class="cur num">${Fmt.currency(goal.currentAmount)}</span>
      <span class="sep">/</span>
      <span class="tgt num">${Fmt.currency(goal.targetAmount)}</span>
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div class="goal-meta-row">
      <span><strong>${pct}%</strong> complete</span>
      <span><strong class="num">${Fmt.currency(remaining)}</strong> remaining</span>
    </div>
    <div class="goal-meta-row" style="margin-top:4px;">
      <span>Estimated completion</span>
      <span><strong>${Fmt.fullMonth(goal.targetDate)}</strong></span>
    </div>
    <a href="#/goals" class="btn btn-secondary btn-block mt-16">View Goal</a>
  `;
}

const CATEGORY_ICON = { 'Electronics': 'electronics', 'Health & Fitness': 'fitness', 'Audio': 'headphones', 'Travel': 'plane', 'Education': 'book', 'Laptops': 'laptop' };

function renderDecisions(decisions){
  const el = document.getElementById('recent-decisions');
  if (!decisions.length){
    el.innerHTML = emptyState('No decisions yet', 'Analyze your first purchase to see it appear here.');
    return;
  }
  el.innerHTML = decisions.map(d => `
    <div class="decision-row" onclick="window.location.hash='#/decisions?id=${d.purchase.id}'">
      <div class="cat-icon">${cIcon(CATEGORY_ICON[d.purchase.category] || 'electronics', 22)}</div>
      <div class="d-main">
        <div class="d-name">${d.purchase.name}</div>
        <div class="d-meta">Analyzed ${Fmt.relativeDays(d.purchase.createdAt)}</div>
      </div>
      <div class="d-right">
        <div class="d-price">${Fmt.currency(d.purchase.price)}</div>
        <span class="badge badge-${d.analysis.decision.toLowerCase()} mt-8" style="margin-top:6px;">${d.analysis.decision}</span>
      </div>
    </div>
  `).join('');
}

function renderPlanned(planned){
  const el = document.getElementById('planned-purchases');
  if (!planned.length){
    el.innerHTML = emptyState('Nothing planned yet', 'Purchases you decide to wait on will show up here.');
    return;
  }
  el.innerHTML = planned.map(p => `
    <div class="planned-row">
      <div class="planned-top">
        <span class="p-name">${p.name}</span>
        <span class="p-price num">${Fmt.currency(p.price)}</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${p.progress}%"></div></div>
      <div class="planned-foot">
        <span>Target: ${Fmt.compactMonth(p.targetDate)}</span>
        <span>${p.progress}%</span>
      </div>
    </div>
  `).join('');
}

function emptyState(title, body){
  return `<div class="empty-state">
    ${iconSvg('<circle cx="12" cy="12" r="9"/><path d="M9 12h6M12 9v6"/>', 30)}
    <h3>${title}</h3><p>${body}</p>
  </div>`;
}
(function(){
  let purchaseType = 'ONE_TIME';
  let currentPurchase = null;
  let currentProfile = null;
  let currentGoal = null;
  let currentAnalysis = null; // baseline (waitMonths=0) analysis object from engine

  const step1 = document.getElementById('step-1');
  const step2 = document.getElementById('step-2');
  const stepLoading = document.getElementById('step-loading');
  const stepResults = document.getElementById('step-results');
  const progress = document.getElementById('step-progress');

  // ---- purchase type toggle ----
  document.querySelectorAll('#purchase-form .radio-pill[data-type]').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#purchase-form .radio-pill[data-type]').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      purchaseType = pill.dataset.type;
      document.getElementById('emi-fields').style.display = purchaseType === 'EMI' ? 'block' : 'none';
    });
  });

  function setProgress(step){
    progress.querySelectorAll('.sp-item').forEach(item => {
      const n = Number(item.dataset.step);
      item.classList.toggle('active', n === step);
      item.classList.toggle('done', n < step);
    });
  }

  // ---- STEP 1 -> STEP 2 ----
  document.getElementById('purchase-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    currentPurchase = {
      id: 'p_new_' + Date.now(),
      name: document.getElementById('p-name').value || 'Untitled purchase',
      category: document.getElementById('p-category').value,
      price: Number(document.getElementById('p-price').value) || 0,
      purchaseType,
      monthlyEmi: purchaseType === 'EMI' ? Number(document.getElementById('p-emi').value) || 0 : 0,
      emiDuration: purchaseType === 'EMI' ? Number(document.getElementById('p-duration').value) || 0 : 0,
      reason: document.getElementById('p-reason').value,
      url: document.getElementById('p-url').value,
    };

    currentProfile = await SpendWiseAPI.getFinancialProfile();
    const goals = await SpendWiseAPI.getGoals();
    // Fall back to a placeholder goal so nothing downstream ever has to
    // null-check `goal` again — this was the source of the crash where
    // buildNarrative tried to read `goal.name` on `undefined`.
    currentGoal = withGoalFallback(goals.find(g => g.id === currentProfile.savingsGoalId) || goals[0], currentProfile);

    renderRecap(currentProfile);
    step1.style.display = 'none';
    step2.style.display = 'block';
    setProgress(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  function renderRecap(profile){
    const el = document.getElementById('profile-recap');
    const rows = [
      ['Monthly income', Fmt.currency(profile.monthlyIncome)],
      ['Monthly expenses', Fmt.currency(profile.monthlyExpenses)],
      ['Current savings', Fmt.currency(profile.currentSavings)],
      ['Savings goal', (currentGoal && !currentGoal.isPlaceholder) ? Fmt.currency(currentGoal.targetAmount) : 'No goal saved yet'],
      ['Existing EMI', Fmt.currency(profile.existingEmi)],
    ];
    el.innerHTML = rows.map(([label, value]) => `
      <div class="recap-row"><span class="r-label">${label}</span><span class="r-value">${value}</span></div>
    `).join('');
  }

  document.getElementById('back-to-1').addEventListener('click', () => {
    step2.style.display = 'none';
    step1.style.display = 'block';
    setProgress(1);
  });

  // ---- STEP 2 -> LOADING -> RESULTS ----
  document.getElementById('analyze-btn').addEventListener('click', async () => {
    step2.style.display = 'none';
    stepLoading.style.display = 'block';
    setProgress(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    let apiDone = false;
    const loadingAnimation = runLoadingSequence(() => apiDone);

    const analysisRaw = await SpendWiseAPI.analyzePurchase(currentPurchase);
    currentAnalysis = analysisRaw;
    apiDone = true;
    await loadingAnimation;

    // Merge with a canned "reasons/alternatives/actionPlan" narrative so the
    // results read naturally regardless of what the numeric engine produced.
    const narrative = buildNarrative(currentPurchase, currentProfile, currentGoal, analysisRaw);

    stepLoading.style.display = 'none';
    stepResults.style.display = 'block';
    renderResults(currentPurchase, currentProfile, currentGoal, analysisRaw, narrative);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Loops through the loading steps and fills the gauge progressively while
  // the real API request is in flight. `isDone()` is checked between steps;
  // once it returns true the sequence finishes its current pass, jumps the
  // gauge to 100%, and resolves — so the animation never "freezes" waiting
  // on a slow response, no matter how long the request actually takes.
  function runLoadingSequence(isDone){
    return new Promise((resolve) => {
      const items = document.querySelectorAll('#loading-steps li');
      const dialEl = document.getElementById('loading-dial');
      const stepTargets = [15, 35, 55, 72, 86];
      let maxReached = 8;
      let i = 0;

      function renderDial(pct){
        if (dialEl) dialEl.innerHTML = decisionDial({ value: pct, color: 'var(--indigo)', size: 130 });
      }
      renderDial(maxReached);

      function tick(){
        const idx = i % items.length;
        items.forEach((it, n) => {
          it.classList.toggle('active', n === idx);
          it.classList.toggle('done', n < idx || (n !== idx && i >= items.length));
        });
        maxReached = Math.max(maxReached, stepTargets[idx]);
        renderDial(maxReached);
        i++;

        if (isDone() && idx === items.length - 1){
          items.forEach((it) => { it.classList.remove('active'); it.classList.add('done'); });
          renderDial(100);
          setTimeout(resolve, 220);
          return;
        }
        setTimeout(tick, 650);
      }
      tick();
    });
  }

  function buildNarrative(purchase, profile, goal, analysis){
    // Defensive fallback: buildNarrative can in principle be called with a
    // missing goal (e.g. if this function is ever reused elsewhere without
    // going through the step-1 handler above), so guard here too rather
    // than assuming callers always pass a valid object.
    goal = withGoalFallback(goal, profile);
    const decision = analysis.decision;
    const supportText = {
      BUY: 'This fits comfortably within your monthly surplus without meaningfully affecting your goal timeline.',
      WAIT: `You can technically afford this purchase, but buying it today would slow down your ${goal.name} goal. A short wait improves the outcome significantly.`,
      SKIP: 'This purchase would use up a large share of your safety buffer and meaningfully delay your top financial goal.',
      CONSIDER_ALTERNATIVE: 'A lower-cost alternative would meet the same need with far less impact on your goals.',
    }[decision];

    const reasons = [
      { type: 'positive', text: 'Your monthly cash flow can support the ongoing cost of this purchase.' },
      { type: decision === 'BUY' ? 'positive' : 'warning', text: decision === 'BUY' ? 'Your savings buffer stays well above your comfort threshold.' : 'Your savings buffer would fall below your comfort threshold.' },
      { type: analysis.goalDelayMonths > 0 ? 'warning' : 'positive', text: analysis.goalDelayMonths > 0 ? `Your ${goal.name} goal would be delayed by roughly ${analysis.goalDelayMonths} month${analysis.goalDelayMonths === 1 ? '' : 's'}.` : `Your ${goal.name} goal timeline is not meaningfully affected.` },
      { type: 'positive', text: 'Waiting a few months and saving the surplus removes most of the impact.' },
    ];

    const actionPlan = decision === 'BUY'
      ? ['Proceed with the purchase — it fits your current plan.', `Keep contributing toward your ${goal.name} goal as usual.`]
      : [
          `Save an additional ${Fmt.currency(Math.max(profile.monthlyIncome*0.12,3000))} per month toward this purchase.`,
          'Maintain at least ₹60,000 in your emergency buffer at all times.',
          'Re-evaluate this decision in a few months.',
          `Watch for a discount that brings the price below ${Fmt.currency(purchase.price*0.9)}.`,
        ];

    const alternatives = [
      { name: suggestAlternativeName(purchase), price: Math.round(purchase.price * 0.72), impact: 'LOWER' },
      { name: 'Certified refurbished option', price: Math.round(purchase.price * 0.65), impact: 'LOWER' },
    ];

    return { supportText, reasons, actionPlan, alternatives };
  }

  function suggestAlternativeName(purchase){
    const map = {
      Electronics: 'Lenovo IdeaPad Slim 5',
      'Home & Furniture': 'A comparable mid-range option',
      Fashion: 'A similar style, mid-tier brand',
      'Health & Fitness': 'A month-to-month plan',
      Travel: 'An off-peak booking',
      Education: 'A self-paced version of the course',
      Other: 'A comparable lower-cost option',
    };
    return map[purchase.category] || 'A comparable lower-cost option';
  }

  // ------------------------------------------------------------------
  // RESULTS RENDERING
  // ------------------------------------------------------------------
  function decisionMeta(decision){
    return {
      BUY:   { word: 'BUY',  cls: 'buy',  color: 'var(--buy)',  score: 88 },
      WAIT:  { word: 'WAIT', cls: 'wait', color: 'var(--wait)', score: 55 },
      SKIP:  { word: 'SKIP', cls: 'skip', color: 'var(--skip)', score: 22 },
      CONSIDER_ALTERNATIVE: { word: 'CONSIDER ALTERNATIVE', cls: 'alt', color: 'var(--alt)', score: 45 },
    }[decision];
  }

  function renderResults(purchase, profile, goal, analysis, narrative){
    goal = withGoalFallback(goal, profile);
    const meta = decisionMeta(analysis.decision);
    const surplusBefore = profile.monthlyIncome - profile.monthlyExpenses;

    stepResults.innerHTML = `
      <div class="result-head fade-up">
        <div>
          <div class="eyebrow">Purchase Analysis</div>
          <h2 class="rp-name">${purchase.name}</h2>
          <div class="rp-price">${Fmt.currency(purchase.price)}${purchase.purchaseType === 'EMI' ? ` · ${Fmt.currency(purchase.monthlyEmi)}/mo` : ''}</div>
        </div>
        <span class="badge-ai">AI Analysis</span>
      </div>

      <div class="verdict-card fade-up">
        ${decisionDial({ value: Number.isFinite(analysis.score) ? analysis.score : meta.score, color: meta.color, size: 190 })}
        <div class="verdict-word ${meta.cls}">${meta.word}</div>
      </div>

      <div class="card mt-24 fade-up ai-response-card">
        <div class="ai-response-head">
          <span class="badge-ai">🤖 AI take</span>
        </div>
        <p class="ai-response-text" id="ai-response-text"></p>
      </div>

      <div class="card mt-24 fade-up">
        <h2 class="section-title">Why we recommend ${meta.word === 'BUY' ? 'buying' : meta.word === 'WAIT' ? 'waiting' : meta.word === 'SKIP' ? 'skipping' : 'an alternative'}</h2>
        <p class="section-sub">Backend-calculated signals behind this verdict — cash flow, savings buffer, and goal timeline.</p>
        <div>
          ${narrative.reasons.map(r => `
            <div class="reason-row">
              <span class="reason-icon ${r.type}">
                ${r.type === 'positive'
                  ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg>'
                  : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 9v4M12 17h.01"/></svg>'}
              </span>
              <span class="reason-text">${r.text}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card mt-24 fade-up">
        <h2 class="section-title">Financial Impact</h2>
        <p class="section-sub">Side by side, with and without this purchase</p>
        <div class="impact-compare">
          <div class="impact-col before">
            <h4>Without purchase</h4>
            <div class="impact-stat"><div class="is-label">Savings</div><div class="is-value">${Fmt.currency(profile.currentSavings)}</div></div>
            <div class="impact-stat"><div class="is-label">Monthly surplus</div><div class="is-value">${Fmt.currency(surplusBefore)}</div></div>
            <div class="impact-stat"><div class="is-label">Goal completion</div><div class="is-value">${goal.isPlaceholder ? 'No goal saved' : Fmt.compactMonth(goal.targetDate)}</div></div>
          </div>
          <div class="vs-divider">→</div>
          <div class="impact-col after">
            <h4>With purchase</h4>
            <div class="impact-stat"><div class="is-label">Savings</div><div class="is-value">${Fmt.currency(analysis.savingsAfterPurchase)}</div></div>
            <div class="impact-stat"><div class="is-label">Monthly surplus</div><div class="is-value">${Fmt.currency(analysis.monthlySurplusAfterPurchase)}</div></div>
            <div class="impact-stat"><div class="is-label">Goal completion</div><div class="is-value">${Fmt.compactMonth(analysis.goalCompletionDate)}</div></div>
          </div>
        </div>
      </div>

      <div class="card mt-24 fade-up">
        <h2 class="section-title">What if you change the plan?</h2>
        <p class="section-sub">Drag to see how waiting, saving more, or a discount changes the outcome.</p>
        <div class="sim-grid">
          <div>
            <div class="sim-control">
              <div class="sc-top"><span>Wait before buying</span><strong id="sim-wait-val">0 months</strong></div>
              <input type="range" id="sim-wait" min="0" max="6" step="1" value="0">
            </div>
            <div class="sim-control">
              <div class="sc-top"><span>Monthly additional saving</span><strong id="sim-save-val">₹0</strong></div>
              <input type="range" id="sim-save" min="0" max="10000" step="500" value="0">
            </div>
            <div class="sim-control">
              <div class="sc-top"><span>Product discount</span><strong id="sim-disc-val">₹0</strong></div>
              <input type="range" id="sim-disc" min="0" max="20000" step="1000" value="0">
            </div>
          </div>
          <div class="sim-result">
            <div class="sim-result-grid">
              <div class="sim-result-item"><div class="sr-label">Estimated purchase date</div><div class="sr-value" id="sim-purchase-date">—</div></div>
              <div class="sim-result-item"><div class="sr-label">Goal completion date</div><div class="sr-value" id="sim-goal-date">—</div></div>
              <div class="sim-result-item"><div class="sr-label">Savings after purchase</div><div class="sr-value" id="sim-savings">—</div></div>
              <div class="sim-result-item"><div class="sr-label">Monthly surplus</div><div class="sr-value" id="sim-surplus">—</div></div>
            </div>
            <div class="sim-verdict">
              <div class="sv-label">Recommendation</div>
              <div class="sv-word" id="sim-decision">—</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card mt-24 fade-up">
        <h2 class="section-title">Better Options</h2>
        <p class="section-sub">Comparable alternatives that reduce the financial impact</p>
        <div class="alt-compare">
          <div class="alt-card chosen">
            <div class="ac-label">Your choice</div>
            <div class="ac-name">${purchase.name}</div>
            <div class="ac-price num">${Fmt.currency(purchase.price)}</div>
          </div>
          <div class="alt-arrow"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>
          <div class="alt-card suggested">
            <div class="ac-label">Alternative</div>
            <div class="ac-name">${narrative.alternatives[0].name}</div>
            <div class="ac-price num">${Fmt.currency(narrative.alternatives[0].price)}</div>
            <div class="alt-savings">
              Estimated savings <strong class="num">${Fmt.currency(purchase.price - narrative.alternatives[0].price)}</strong><br>
              Financial impact <span class="badge badge-buy" style="margin-top:4px;">${narrative.alternatives[0].impact}</span>
            </div>
          </div>
        </div>
        <button class="btn btn-secondary mt-16">Compare</button>
      </div>

      <div class="card mt-24 fade-up">
        <h2 class="section-title">Future Affordability</h2>
        <p class="section-sub">Based on your current savings rate</p>
        <div class="timeline-rail" id="timeline-rail"></div>
      </div>

      <div class="card mt-24 fade-up">
        <h2 class="section-title">Your Purchase Plan</h2>
        <p class="section-sub">To comfortably buy this</p>
        <div>
          ${narrative.actionPlan.map(step => `
            <div class="plan-item">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg>
              <span>${step}</span>
            </div>
          `).join('')}
        </div>
        <div class="flex mt-24" style="gap:12px; flex-wrap:wrap;">
          <button class="btn btn-primary" id="save-plan-btn">Save Purchase Plan</button>
          <button class="btn btn-secondary" onclick="window.location.reload()">Analyze Another Purchase</button>
        </div>
      </div>
    `;

    renderTimeline(purchase, profile, analysis);
    initSimulator(purchase, profile, goal);

    typewriter(
      document.getElementById('ai-response-text'),
      (analysis.aiExplanation && analysis.aiExplanation.trim()) ? analysis.aiExplanation : narrative.supportText
    );

    document.getElementById('save-plan-btn').addEventListener('click', (e) => {
      e.target.textContent = 'Saved ✓';
      e.target.disabled = true;
    });
  }

  // ChatGPT-style word-by-word typing effect for the AI take.
  let _typeTimer = null;
  function typewriter(el, text){
    if (!el) return;
    clearTimeout(_typeTimer);
    text = String(text || '');
    const words = text.split(/(\s+)/); // keep whitespace tokens
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce){ el.textContent = text; return; }
    const cursor = document.createElement('span');
    cursor.className = 'tw-cursor';
    const textNode = document.createTextNode('');
    el.textContent = '';
    el.appendChild(textNode);
    el.appendChild(cursor);
    let i = 0;
    function tick(){
      if (!el.isConnected) return;
      if (i >= words.length){
        setTimeout(() => cursor.remove(), 1200);
        return;
      }
      const w = words[i++];
      textNode.nodeValue += w;
      const pause = /[.!?]$/.test(w) ? 260 : /[,;:]$/.test(w) ? 140 : 35 + Math.random() * 45;
      _typeTimer = setTimeout(tick, pause);
    }
    // small "thinking" delay before typing starts
    _typeTimer = setTimeout(tick, 500);
  }

  function renderTimeline(purchase, profile, analysis){
    const rail = document.getElementById('timeline-rail');
    const months = ['Today', 'Month 1', 'Month 2', 'Month 3', 'Estimated comfortable purchase'];
    rail.innerHTML = months.map((m, i) => {
      const isLast = i === months.length - 1;
      return `
        <div class="tl-item ${isLast ? 'final' : ''}">
          <div class="tl-label">${isLast ? Fmt.compactMonth(analysis.estimatedPurchaseDate) : m}</div>
          <div class="tl-title">${isLast ? 'Comfortable purchase point' : i === 0 ? 'Current financial position' : `Saving continues toward ${purchase.name}`}</div>
          ${isLast ? `<div class="tl-sub">Based on your current savings rate, you're estimated to reach a comfortable purchase point around ${Fmt.fullMonth(analysis.estimatedPurchaseDate)}.</div>` : ''}
        </div>`;
    }).join('');
  }

  function initSimulator(purchase, profile, goal){
    goal = withGoalFallback(goal, profile);
    const waitEl = document.getElementById('sim-wait');
    const saveEl = document.getElementById('sim-save');
    const discEl = document.getElementById('sim-disc');

    function update(){
      const waitMonths = Number(waitEl.value);
      const extraSaving = Number(saveEl.value);
      const discount = Number(discEl.value);

      document.getElementById('sim-wait-val').textContent = `${waitMonths} month${waitMonths === 1 ? '' : 's'}`;
      document.getElementById('sim-save-val').textContent = Fmt.currency(extraSaving);
      document.getElementById('sim-disc-val').textContent = Fmt.currency(discount);

      const result = DecisionEngineMock.simulate(purchase, profile, goal, { waitMonths, extraSaving, discount });

      document.getElementById('sim-purchase-date').textContent = Fmt.compactMonth(result.estimatedPurchaseDate);
      document.getElementById('sim-goal-date').textContent = Fmt.compactMonth(result.goalCompletionDate);
      document.getElementById('sim-savings').textContent = Fmt.currency(result.savingsAfterPurchase);
      document.getElementById('sim-surplus').textContent = Fmt.currency(result.monthlySurplusAfterPurchase);

      const meta = decisionMeta(result.decision) || decisionMeta('WAIT');
      const word = waitMonths > 0 && result.decision === 'BUY' ? 'BUY AFTER WAITING' : meta.word;
      const decisionWordEl = document.getElementById('sim-decision');
      decisionWordEl.textContent = word;
      decisionWordEl.style.color = meta.color;
    }

    [waitEl, saveEl, discEl].forEach(el => el.addEventListener('input', update));
    update();
  }
})();
(function(){
  let allDecisions = [];
  let activeFilter = 'ALL';
  let searchTerm = '';

  async function init(){
    allDecisions = await SpendWiseAPI.getDecisions();
    render();

    document.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        activeFilter = pill.dataset.filter;
        render();
      });
    });

    document.getElementById('search-input').addEventListener('input', (e) => {
      searchTerm = e.target.value.toLowerCase();
      render();
    });

    document.getElementById('detail-close').addEventListener('click', closeModal);
    document.getElementById('detail-modal').addEventListener('click', (e) => {
      if (e.target.id === 'detail-modal') closeModal();
    });

    // deep-link support: #/decisions?id=p_001
    const hashQuery = (window.location.hash.split('?')[1]) || '';
    const params = new URLSearchParams(hashQuery);
    if (params.get('id')) openDetail(params.get('id'));
  }

  function filtered(){
    return allDecisions.filter(d => {
      const matchesFilter = activeFilter === 'ALL' || d.analysis.decision === activeFilter;
      const matchesSearch = d.purchase.name.toLowerCase().includes(searchTerm);
      return matchesFilter && matchesSearch;
    });
  }

  function render(){
    const list = filtered();
    const tbody = document.getElementById('decisions-tbody');
    const cardsEl = document.getElementById('decisions-cards');
    const emptySlot = document.getElementById('empty-slot');

    if (!list.length){
      tbody.innerHTML = '';
      cardsEl.innerHTML = '';
      emptySlot.innerHTML = `<div class="empty-state">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <h3>No matching decisions</h3><p>Try a different filter or search term.</p>
      </div>`;
      return;
    }
    emptySlot.innerHTML = '';

    tbody.innerHTML = list.map(d => `
      <tr onclick="window.SpendWiseDecisions.open('${d.purchase.id}')">
        <td class="prod-name">${d.purchase.name}</td>
        <td class="num">${Fmt.currency(d.purchase.price)}</td>
        <td><span class="badge badge-${d.analysis.decision.toLowerCase()}">${d.analysis.decision}</span></td>
        <td class="faint">${Fmt.shortDate(d.purchase.createdAt)}</td>
      </tr>
    `).join('');

    cardsEl.innerHTML = list.map(d => `
      <div class="dcard mb-16" onclick="window.SpendWiseDecisions.open('${d.purchase.id}')">
        <div class="dc-top">
          <span class="dc-name">${d.purchase.name}</span>
          <span class="badge badge-${d.analysis.decision.toLowerCase()}">${d.analysis.decision}</span>
        </div>
        <div class="dc-meta"><span class="num">${Fmt.currency(d.purchase.price)}</span><span>${Fmt.shortDate(d.purchase.createdAt)}</span></div>
      </div>
    `).join('');
  }

  async function openDetail(id){
    const d = await SpendWiseAPI.getDecision(id);
    if (!d) return;
    const content = document.getElementById('detail-content');
    content.innerHTML = `
      <span class="badge-ai">AI Analysis</span>
      <h2 class="section-title mt-12">${d.purchase.name}</h2>
      <p class="muted num" style="font-size:15px;">${Fmt.currency(d.purchase.price)} · ${Fmt.shortDate(d.purchase.createdAt)}</p>
      <div class="flex-between mt-16" style="align-items:flex-start;">
        <span class="badge badge-${d.analysis.decision.toLowerCase()}" style="font-size:14px; padding:8px 14px;">${d.analysis.decision}</span>
      </div>
      <p class="muted mt-16" style="font-size:14.5px; line-height:1.6;">${d.purchase.reason}</p>
      <hr class="divider">
      <h3 style="font-size:15px; margin-bottom:12px;">Why this decision</h3>
      ${d.analysis.reasons.map(r => `
        <div class="reason-row">
          <span class="reason-icon ${r.type}">${r.type === 'positive' ? '✓' : '!'}</span>
          <span class="reason-text">${r.text}</span>
        </div>`).join('')}
      <hr class="divider">
      <h3 style="font-size:15px; margin-bottom:12px;">Action plan</h3>
      ${d.analysis.actionPlan.map(a => `<div class="plan-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg><span>${a}</span></div>`).join('')}
    `;
    document.getElementById('detail-modal').style.display = 'flex';
  }

  function closeModal(){
    document.getElementById('detail-modal').style.display = 'none';
    // clean up the URL without a full reload
    history.replaceState(null, '', window.location.pathname + window.location.search + '#/decisions');
  }

  window.SpendWiseDecisions = { open: openDetail, reinit: init };
  document.addEventListener('DOMContentLoaded', init);
})();
/* ------------------------------------------------------------------ *
 * Worthwise — single-file router
 * Shows/hides page sections based on the URL hash instead of loading
 * separate .html files. Routes: #/dashboard #/analyze #/decisions
 * #/goals #/profile  (empty hash = landing page)
 * ------------------------------------------------------------------ */

const ROUTES = ['dashboard', 'analyze', 'decisions', 'goals', 'profile'];
const APP_ROUTES = ['dashboard', 'analyze', 'decisions', 'goals', 'profile'];
const SpendWiseRouter = { currentRoute: 'dashboard' };

function parseHash(){
  let h = window.location.hash || '';
  h = h.replace(/^#\/?/, '');
  const [route, query] = h.split('?');
  return { route: route || '', query: query || '' };
}

function navigate(){
  const { route, query } = parseHash();
  const appViews = document.getElementById('app-views');
  const landing = document.getElementById('view-landing');

  if (!route || route === 'landing') {
    landing.style.display = '';
    appViews.style.display = 'none';
    window.scrollTo(0, 0);
    return;
  }

  const target = [...ROUTES, 'auth'].includes(route) ? route : 'dashboard';
  if (APP_ROUTES.includes(target) && !SpendWiseAPI.isAuthenticated()) {
    window.location.hash = '#/auth';
    return;
  }
  landing.style.display = 'none';
  appViews.style.display = '';

  [...ROUTES, 'auth'].forEach(r => {
    const el = document.getElementById('view-' + r);
    if (el) el.style.display = (r === target) ? '' : 'none';
  });

  SpendWiseRouter.currentRoute = target;
  // FIX (issue 3): initShell() now self-guards on auth state (see shell.js),
  // so it's safe — and necessary — to call it on every route, including
  // '#/auth'. Previously this call was skipped for the auth route, which
  // meant a stale, fully-populated sidebar (rendered by the unconditional
  // DOMContentLoaded -> initShell() call) could be left sitting in the DOM
  // behind the login screen.
  initShell();

  if (target === 'decisions') {
    if (window.SpendWiseDecisions) window.SpendWiseDecisions.reinit();
    const params = new URLSearchParams(query);
    const id = params.get('id');
    if (id && window.SpendWiseDecisions) window.SpendWiseDecisions.open(id);
  }
  if (target === 'dashboard') loadDashboard();
  if (target === 'goals' && window.SpendWiseGoals) window.SpendWiseGoals.reinit();
  if (target === 'profile' && window.SpendWiseProfile) window.SpendWiseProfile.reinit();
  if (target === 'profile') applyProfileMode(new URLSearchParams(query).get('view'));

  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', navigate);

// ---------------------------------------------------------------------------
// Mobile: "Financial Profile" and "Settings" are separate screens.
//   #/profile                -> profile sections only
//   #/profile?view=settings  -> settings only (with its own header)
// CSS (max-width:900px) hides the other half; desktop still shows everything.
// ---------------------------------------------------------------------------
const PROFILE_HEADERS = {
  profile:  null, // keep the original markup text
  settings: { eyebrow: 'Settings', title: 'Account & preferences', sub: 'Manage your notifications and display options.' },
};
function applyProfileMode(view){
  const page = document.getElementById('view-profile');
  if (!page) return;
  const mode = view === 'settings' ? 'settings' : 'profile';
  page.dataset.mode = mode;

  const eyebrow = page.querySelector('.page-header .eyebrow');
  const title = page.querySelector('.page-header .page-title');
  const sub = page.querySelector('.page-header .page-sub');
  if (!eyebrow || !title || !sub) return;
  if (!page.dataset.origHeader) {
    page.dataset.origHeader = JSON.stringify({ eyebrow: eyebrow.textContent, title: title.textContent, sub: sub.textContent });
  }
  const orig = JSON.parse(page.dataset.origHeader);
  const isMobile = window.matchMedia('(max-width: 900px)').matches;
  const h = (mode === 'settings' && isMobile) ? PROFILE_HEADERS.settings : orig;
  eyebrow.textContent = h.eyebrow; title.textContent = h.title; sub.textContent = h.sub;
}
window.matchMedia('(max-width: 900px)').addEventListener('change', () => {
  const page = document.getElementById('view-profile');
  if (page) applyProfileMode(page.dataset.mode);
});


document.addEventListener('DOMContentLoaded', () => {
  navigate();

  // Handle "scroll to section" links (landing page anchors, profile
  // profile sidebar, and the sidebar's Settings item) without disturbing
  // the router's own hash-based navigation.
  document.body.addEventListener('click', (e) => {
    const link = e.target.closest('[data-scroll-target]');
    if (!link) return;
    setTimeout(() => {
      const el = document.getElementById(link.dataset.scrollTarget);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 30);
  });
});

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const status = document.getElementById('auth-status');

  /**
   * FIX (issue 2): the tab bar, the sliding highlight, and the inline
   * "Create an account" / "Login" links already existed in the HTML with
   * data-auth-tab attributes and matching CSS (.auth-tab-slider.to-register,
   * the [hidden] panels) — but nothing ever listened for a click on them,
   * so "Create account" was inert. This wires all four elements
   * (#tab-login, #tab-register, and the two inline links) to one shared
   * handler that swaps the active tab, slides the highlight, and shows the
   * matching panel. Pure UI state — no backend/auth calls are involved.
   */
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const slider = document.getElementById('auth-tab-slider');
  const panelLogin = document.getElementById('panel-login');
  const panelRegister = document.getElementById('panel-register');

  function switchAuthTab(tab){
    const toRegister = tab === 'register';
    if (tabLogin) tabLogin.classList.toggle('active', !toRegister);
    if (tabRegister) tabRegister.classList.toggle('active', toRegister);
    if (slider) slider.classList.toggle('to-register', toRegister);
    if (panelLogin) panelLogin.hidden = toRegister;
    if (panelRegister) panelRegister.hidden = !toRegister;
    if (status) status.textContent = '';
  }

  document.querySelectorAll('[data-auth-tab]').forEach(el => {
    el.addEventListener('click', () => switchAuthTab(el.dataset.authTab));
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = 'Logging in...';
    try {
      currentUserCache = await SpendWiseAPI.login(document.getElementById('login-email').value, document.getElementById('login-password').value);
      window.location.hash = '#/dashboard';
      window.location.reload();
    } catch (err) {
      status.textContent = err.message || 'Login failed';
    }
  });
  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = 'Creating account...';
    try {
      currentUserCache = await SpendWiseAPI.register(
        document.getElementById('register-email').value,
        document.getElementById('register-password').value,
        document.getElementById('register-name').value,
        document.getElementById('register-gender').value
      );
      window.location.hash = '#/profile';
      window.location.reload();
    } catch (err) {
      status.textContent = err.message || 'Registration failed';
    }
  });
});

  const GOAL_ICON_NAMES = ['shield','laptop','plane','book','target'];

  async function loadGoalsPage(){
    if (!SpendWiseAPI.isAuthenticated()) return;
    const goals = await SpendWiseAPI.getGoals();
    const grid = document.getElementById('goals-grid');
    if (!grid) return;
    grid.innerHTML = goals.map(g => {
      const pct = g.targetAmount > 0 ? Math.round(g.currentAmount / g.targetAmount * 100) : 0;
      return `
      <div class="card card-hover goal-card fade-up">
        <div class="g-icon">
          ${cIcon(GOAL_ICON_NAMES.includes(g.icon) ? g.icon : 'shield', 22)}
        </div>
        <div class="g-name">${g.name}</div>
        <div class="g-priority">${g.priority} priority</div>
        <div class="g-amounts">
          <span class="cur">${Fmt.currency(g.currentAmount)}</span>
          <span class="faint">/</span>
          <span class="tgt">${Fmt.currency(g.targetAmount)}</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="g-foot">
          <span><strong style="color:var(--ink)">${pct}%</strong> complete</span>
          <span>Target: ${Fmt.compactMonth(g.targetDate)}</span>
        </div>
      </div>`;
    }).join('') + `
      <form class="create-goal-card goal-create-form" id="goal-create-form">
        <div class="goal-create-title">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          <span>Create Goal</span>
        </div>
        <input class="input" name="name" placeholder="Goal name" required>
        <div class="goal-form-grid">
          <div class="input-prefix"><span>₹</span><input class="input" name="targetAmount" type="number" min="1" placeholder="Target" required></div>
          <div class="input-prefix"><span>₹</span><input class="input" name="currentAmount" type="number" min="0" placeholder="Saved" value="0"></div>
        </div>
        <div class="goal-form-grid">
          <input class="input" name="targetDate" type="date" required>
          <select class="input" name="priority">
            <option value="HIGH">High</option>
            <option value="MEDIUM" selected>Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
        <button class="btn btn-primary btn-block" type="submit">Save Goal</button>
        <div class="inline-status" id="goal-create-status"></div>
      </form>
    `;
    const form = document.getElementById('goal-create-form');
    const status = document.getElementById('goal-create-status');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.textContent = 'Saving...';
      const data = new FormData(form);
      try {
        await SpendWiseAPI.createGoal({
          name: data.get('name'),
          targetAmount: Number(data.get('targetAmount')) || 0,
          currentAmount: Number(data.get('currentAmount')) || 0,
          targetDate: data.get('targetDate'),
          priority: data.get('priority'),
        });
        status.textContent = 'Saved';
        await loadGoalsPage();
        await loadDashboard();
      } catch (err) {
        status.textContent = err.message || 'Could not save goal';
      }
    });
  }
  window.SpendWiseGoals = { reinit: loadGoalsPage };
  document.addEventListener('DOMContentLoaded', loadGoalsPage);

  const EXPENSE_LABELS = { housing: 'Housing', food: 'Food', transport: 'Transport', subscriptions: 'Subscriptions', other: 'Other' };
  let profileState = null;

  async function loadProfilePage(){
    if (!SpendWiseAPI.isAuthenticated()) return;
    if (!document.getElementById('in-income')) return;
    profileState = await SpendWiseAPI.getFinancialProfile();
    document.getElementById('in-income').value = profileState.monthlyIncome;
    document.getElementById('in-savings').value = profileState.currentSavings;

    document.getElementById('expense-fields').innerHTML = Object.entries(profileState.expenseBreakdown).map(([key, val]) => `
      <div class="expense-row">
        <label>${EXPENSE_LABELS[key] || key}</label>
        <div class="input-prefix"><span>₹</span><input class="input" data-expense="${key}" type="number" value="${val}"></div>
      </div>
    `).join('');

    document.getElementById('commitments-list').innerHTML = profileState.commitments.length ? profileState.commitments.map(c => `
      <div class="commitment-row">
        <span>${c.name}</span>
        <span class="num">${Fmt.currency(c.monthlyAmount)}/mo${c.remainingMonths ? ` · ${c.remainingMonths} mo left` : ''}</span>
      </div>
    `).join('') : `<div class="commitment-row"><span>No monthly commitments saved yet</span><span class="badge badge-neutral">Clean</span></div>`;

    setActivePill('pref-risk', profileState.preferences.riskTolerance);
    setActivePill('pref-priority', profileState.preferences.savingPriority);
    setActivePill('pref-purchase', profileState.preferences.purchasePreference);
  }
  window.SpendWiseProfile = { reinit: loadProfilePage };
  document.addEventListener('DOMContentLoaded', loadProfilePage);

  function setActivePill(groupId, val){
    const group = document.getElementById(groupId);
    group.querySelectorAll('.radio-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.val === val);
      p.addEventListener('click', () => {
        group.querySelectorAll('.radio-pill').forEach(x => x.classList.remove('active'));
        p.classList.add('active');
      });
    });
  }

  document.getElementById('save-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('save-btn');
    btn.textContent = 'Saving…'; btn.disabled = true;
    const expenseBreakdown = {};
    document.querySelectorAll('[data-expense]').forEach(input => {
      expenseBreakdown[input.dataset.expense] = Number(input.value) || 0;
    });
    const activeValue = (id) => document.querySelector(`#${id} .radio-pill.active`)?.dataset.val;
    const patch = {
      monthlyIncome: Number(document.getElementById('in-income').value),
      currentSavings: Number(document.getElementById('in-savings').value),
      expenseBreakdown,
      riskTolerance: activeValue('pref-risk'),
      savingPriority: activeValue('pref-priority'),
      purchasePreference: activeValue('pref-purchase'),
    };
    try {
      const savedProfile = await SpendWiseAPI.updateFinancialProfile(patch);
      renderSnapshot(savedProfile);
      renderHealth(currentUserCache, savedProfile);
      document.getElementById('save-status').textContent = 'Saved just now';
      setTimeout(() => document.getElementById('save-status').textContent = '', 3000);
    } catch (err) {
      document.getElementById('save-status').textContent = err.message || 'Could not save profile';
    } finally {
      btn.textContent = 'Save Changes'; btn.disabled = false;
    }
  });
  // initLiveSimulator(); // landing-page gauge demo removed
// goals inline + profile inline + landing inline appended above

// ---------------------------------------------------------------------------
// Landing hero: interactive "try it live" purchase simulator.
// Replaces the old static WAIT gauge. Drag the slider (or let the short
// auto-demo run) and the needle, colour, verdict and impact numbers respond.
// Uses a fixed sample profile — purely illustrative, no real data.
// ---------------------------------------------------------------------------
function initLiveSimulator(){
  const wrap = document.querySelector('.decision-preview .dial-wrap');
  if (!wrap) return;

  const SAMPLE = { savings: 100000, monthlySaving: 12000 };
  const MIN = 2000, MAX = 100000, STEP = 1000, START = 48000;
  const R = 70, CX = 90, CY = 90, ARC = Math.PI * R;
  const inr = n => '\u20B9' + Math.round(n).toLocaleString('en-IN');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // point on the gauge arc for a 0-100 score (0 = far left, 100 = far right)
  const pt = (score, r) => {
    const a = Math.PI * (1 - score / 100);
    return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
  };
  const zone = (from, to, cls) => {
    const [x1, y1] = pt(from, 84), [x2, y2] = pt(to, 84);
    return `<path class="hs-zone ${cls}" d="M${x1.toFixed(1)} ${y1.toFixed(1)} A84 84 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
  };

  wrap.classList.add('hs-host');
  wrap.innerHTML = `
    <div class="hs" data-verdict="WAIT">
      <div class="hs-tag"><span class="hs-live-dot"></span>Try it live \u2014 drag the slider</div>
      <svg class="hs-gauge" viewBox="0 0 180 112" fill="none" aria-hidden="true">
        ${zone(0, 35, 'z-skip')}${zone(35, 65, 'z-wait')}${zone(65, 100, 'z-buy')}
        <path d="M20 90 A70 70 0 0 1 160 90" class="hs-track" stroke-width="14" stroke-linecap="round"/>
        <path d="M20 90 A70 70 0 0 1 160 90" class="hs-arc" stroke-width="14" stroke-linecap="round"
              stroke-dasharray="${ARC}" stroke-dashoffset="${ARC}"/>
        <g class="hs-needle"><line x1="90" y1="90" x2="90" y2="34" stroke-width="3" stroke-linecap="round"/></g>
        <circle class="hs-hub" cx="90" cy="90" r="7"/>
      </svg>
      <div class="hs-verdict" id="hs-verdict">WAIT</div>
      <div class="hs-score" id="hs-score"></div>

      <div class="hs-price-row"><span>If you buy something for</span><strong id="hs-price"></strong></div>
      <input class="hs-range" id="hs-range" type="range" min="${MIN}" max="${MAX}" step="${STEP}" value="${START}" aria-label="Purchase price">

      <div class="hs-stats">
        <div><span>Savings left</span><b id="hs-left"></b></div>
        <div><span>Goal delayed</span><b id="hs-delay"></b></div>
      </div>
      <p class="hs-reason" id="hs-reason"></p>
    </div>`;

  const sim = wrap.querySelector('.hs');
  const tag = wrap.querySelector('.hs-tag');
  const arc = wrap.querySelector('.hs-arc');
  const needle = wrap.querySelector('.hs-needle');
  const verdictEl = wrap.querySelector('#hs-verdict');
  const scoreEl = wrap.querySelector('#hs-score');
  const priceEl = wrap.querySelector('#hs-price');
  const leftEl = wrap.querySelector('#hs-left');
  const delayEl = wrap.querySelector('#hs-delay');
  const reasonEl = wrap.querySelector('#hs-reason');
  const range = wrap.querySelector('#hs-range');

  const REASONS = {
    BUY:  'Fits comfortably \u2014 your safety buffer and goals stay on track.',
    WAIT: 'Affordable, but it dips into your safety buffer. Waiting or saving more helps.',
    SKIP: 'Too much of your savings \u2014 this would drain your safety net.'
  };

  let current = null;
  function render(price){
    const score = clamp(Math.round((SAMPLE.savings - price) / SAMPLE.savings * 100), 0, 100);
    const verdict = score >= 65 ? 'BUY' : score >= 35 ? 'WAIT' : 'SKIP';
    const months = price / SAMPLE.monthlySaving;

    arc.style.strokeDashoffset = ARC * (1 - score / 100);
    needle.style.transform = `rotate(${(score - 50) * 1.8}deg)`;
    range.style.setProperty('--fill', ((price - MIN) / (MAX - MIN) * 100) + '%');

    priceEl.textContent = inr(price);
    leftEl.textContent = inr(Math.max(0, SAMPLE.savings - price));
    delayEl.textContent = months < 0.5 ? 'Minimal' : '~' + months.toFixed(1) + ' mo';
    scoreEl.textContent = 'Affordability ' + score + ' / 100';

    if (verdict !== current){
      current = verdict;
      sim.dataset.verdict = verdict;
      verdictEl.textContent = verdict;
      reasonEl.textContent = REASONS[verdict];
      verdictEl.classList.remove('pop'); void verdictEl.offsetWidth; verdictEl.classList.add('pop');
    }
  }

  render(START);

  // --- user interaction: stops the auto-demo for good ---
  let demoOn = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const takeOver = () => {
    if (!demoOn && tag.dataset.user) return;
    demoOn = false;
    tag.dataset.user = '1';
    tag.lastChild.textContent = 'Your turn \u2014 drag the slider';
    verdictEl.setAttribute('aria-live', 'polite');
  };
  ['pointerdown', 'touchstart', 'keydown'].forEach(ev => range.addEventListener(ev, takeOver, { passive: true }));
  range.addEventListener('input', () => { takeOver(); render(Number(range.value)); });

  // --- auto-demo: gentle sweep through BUY -> WAIT -> SKIP -> back ---
  if (!demoOn) return;
  const stops = [12000, 60000, 92000, 30000, START];
  const HOLD = 700, MOVE = 1900;
  let visible = true, idx = 0, phase = 'hold', t = -500, from = START, last = performance.now();
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(wrap);
  const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

  function tick(now){
    if (!demoOn) return;
    const dt = Math.min(now - last, 50); last = now;
    if (visible && !document.hidden){
      t += dt;
      if (phase === 'hold' && t >= HOLD){ phase = 'move'; t = 0; }
      else if (phase === 'move'){
        const k = clamp(t / MOVE, 0, 1);
        const v = Math.round((from + (stops[idx] - from) * ease(k)) / STEP) * STEP;
        range.value = v; render(v);
        if (k >= 1){ from = stops[idx]; idx = (idx + 1) % stops.length; phase = 'hold'; t = 0; }
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}


// ---------------------------------------------------------------------------
// FIX: Landing page scroll-reveal.
// styles.css hides every `.reveal` element (opacity:0) until it also has the
// `.revealed` class, but nothing ever added that class — so the value cards,
// "How it works" flow and the CTA band stayed invisible, leaving a blank gap.
// This observer adds `.revealed` as each element scrolls into view.
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  // Fallbacks: no IntersectionObserver support, or user prefers reduced motion
  // -> just show everything immediately so content is never stuck hidden.
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('IntersectionObserver' in window) || reduceMotion) {
    items.forEach(el => el.classList.add('revealed'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      // Also reveal anything already scrolled past (e.g. page reload mid-scroll).
      if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
        entry.target.classList.add('revealed');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  // Small stagger for siblings (cards in a row, flow pills) so they cascade in.
  items.forEach(el => {
    const siblings = el.parentElement ? [...el.parentElement.children].filter(c => c.classList.contains('reveal')) : [el];
    const idx = siblings.indexOf(el);
    if (idx > 0) el.style.transitionDelay = `${Math.min(idx, 5) * 80}ms`;
    io.observe(el);
  });
});