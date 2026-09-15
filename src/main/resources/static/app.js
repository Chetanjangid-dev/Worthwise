/* ============================================================================
   Worthwise — auth-aware UI layer
   ----------------------------------------------------------------------------
   Reads the *existing* backend auth state. Renders the correct navigation,
   shows/hides the public landing vs. the authenticated app, and wires the
   logout inside the profile menu.

   This file does NOT create its own auth system. It trusts the backend.
   ============================================================================ */
(function () {
  'use strict';

  /* ---- endpoints (adjust to your existing routes) --------------------- */
  const ENDPOINTS = {
    me:     '/api/auth/me',
    logout: '/api/auth/logout',
    login:  '/api/auth/login',
    register: '/api/auth/register',
  };

  /* ---- state ---------------------------------------------------------- */
  const state = {
    user: null,
    ready: false,
  };
  const listeners = new Set();
  function emit() { listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } }); }

  /* ---- icons (Lucide, inline) ----------------------------------------- */
  const ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    analyse:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    goals:     '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>',
    purchases: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    decisions: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    profile:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    settings:  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    logout:    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
    plus:      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  };

  /* ---- nav config ----------------------------------------------------- */
  const NAV_ITEMS = [
    { href: '#/dashboard', label: 'Dashboard', icon: ICONS.dashboard },
    { href: '#/analyze',   label: 'Analyse',   icon: ICONS.analyse },
    { href: '#/goals',     label: 'Goals',     icon: ICONS.goals },
    { href: '#/decisions', label: 'Purchases', icon: ICONS.purchases },
    { href: '#/profile',   label: 'Profile',   icon: ICONS.profile },
  ];

  /* ---- backend calls -------------------------------------------------- */
  async function fetchMe() {
    try {
      const res = await fetch(ENDPOINTS.me, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.user || data || null;
    } catch {
      return null;
    }
  }

  async function doLogout() {
    try {
      await fetch(ENDPOINTS.logout, { method: 'POST', credentials: 'include' });
    } catch { /* ignore — clear client state regardless */ }
    state.user = null;
    emit();
    render();
    if (location.hash && location.hash !== '#/') location.hash = '#/';
  }

  /* ---- rendering ------------------------------------------------------ */
  const initials = (u) => {
    const src = (u && (u.name || u.email)) || '?';
    return src.trim().slice(0, 2).toUpperCase();
  };

  function renderSidebar() {
    const el = document.getElementById('sidebar');
    if (!el) return;
    const u = state.user || {};
    const active = location.hash || '#/dashboard';

    el.innerHTML = `
      <a class="logo" href="#/dashboard">
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
          <rect x="1" y="6" width="24" height="17" rx="4" fill="#22C08A"/>
          <path d="M1 10.5C1 8.01 3.01 6 5.5 6H21c2.21 0 4 1.79 4 4v1H1v-.5Z" fill="#0F3D2E"/>
          <circle cx="18.5" cy="14.5" r="3.1" fill="#0A0C0F"/>
          <path d="M17 14.6l1.1 1.1 2-2.2" stroke="#22C08A" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
        <span class="logo-word">Worthwise</span>
      </a>

      <button class="sidebar-cta" type="button" data-nav="#/analyze">
        ${ICONS.plus} Analyze a Purchase
      </button>

      <nav class="nav-group" aria-label="Primary">
        ${NAV_ITEMS.map(item => `
          <a class="nav-link ${active.startsWith(item.href) ? 'active' : ''}" href="${item.href}">
            ${item.icon}<span>${item.label}</span>
          </a>`).join('')}
      </nav>

      <div class="sidebar-spacer"></div>

      <div class="profile-mini" id="profile-mini" role="button" tabindex="0" aria-haspopup="menu" aria-expanded="false">
        <div class="avatar">${initials(u)}</div>
        <div style="min-width:0;">
          <div class="pname">${(u.name || 'Your account').replace(/</g,'&lt;')}</div>
          <div class="pemail">${(u.email || '').replace(/</g,'&lt;')}</div>
        </div>
      </div>

      <div class="profile-menu" id="profile-menu" role="menu" hidden>
        <a href="#/profile" role="menuitem">${ICONS.profile} My Profile</a>
        <a href="#/profile" data-scroll-target="settings-card" role="menuitem">${ICONS.settings} Settings</a>
        <div class="menu-sep"></div>
        <button type="button" class="menu-danger" id="logout-btn" role="menuitem">${ICONS.logout} Logout</button>
      </div>
    `;

    // dropdown behaviour
    const mini = el.querySelector('#profile-mini');
    const menu = el.querySelector('#profile-menu');
    const toggle = (open) => {
      const next = typeof open === 'boolean' ? open : menu.hidden;
      menu.hidden = !next;
      mini.setAttribute('aria-expanded', String(next));
    };
    mini.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    mini.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      if (e.key === 'Escape') toggle(false);
    });
    document.addEventListener('click', () => toggle(false));

    el.querySelector('#logout-btn').addEventListener('click', (e) => {
      e.preventDefault();
      doLogout();
    });

    el.querySelector('.sidebar-cta').addEventListener('click', () => { location.hash = '#/analyze'; });
  }

  function renderBottomNav() {
    const el = document.getElementById('bottom-nav');
    if (!el) return;
    const active = location.hash || '#/dashboard';
    el.innerHTML = NAV_ITEMS.map(item => `
      <a class="bottom-nav-link ${active.startsWith(item.href) ? 'active' : ''}" href="${item.href}">
        ${item.icon}<span>${item.label}</span>
      </a>`).join('');
  }

  function renderMobileTopbar() {
    const slot = document.getElementById('mobile-topbar-slot');
    if (!slot) return;
    slot.innerHTML = `
      <div class="mobile-topbar">
        <a class="logo" href="#/dashboard">
          <svg width="24" height="24" viewBox="0 0 26 26" fill="none" aria-hidden="true">
            <rect x="1" y="6" width="24" height="17" rx="4" fill="#22C08A"/>
            <path d="M1 10.5C1 8.01 3.01 6 5.5 6H21c2.21 0 4 1.79 4 4v1H1v-.5Z" fill="#0F3D2E"/>
            <circle cx="18.5" cy="14.5" r="3.1" fill="#0A0C0F"/>
            <path d="M17 14.6l1.1 1.1 2-2.2" stroke="#22C08A" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
          <span class="logo-word">Worthwise</span>
        </a>
        <button class="mobile-cta" type="button" id="mobile-logout" aria-label="Logout">${ICONS.logout}</button>
      </div>
    `;
    slot.querySelector('#mobile-logout').addEventListener('click', doLogout);
  }

  /* ---- view switching ------------------------------------------------- */
  const ROUTES = {
    landing: ['', '#/', '#/home'],
    auth:    ['#/auth'],
  };

  function isAuthRoute(hash) { return hash.startsWith('#/auth'); }
  function isLandingRoute(hash) {
    return !hash || hash === '#/' || hash === '#/home' || hash === '#';
  }
  function isProtectedRoute(hash) {
    return ['#/dashboard','#/analyze','#/decisions','#/goals','#/profile'].some(p => hash.startsWith(p));
  }

  function showView(id) {
    ['view-landing','view-auth','app-views'].forEach(v => {
      const el = document.getElementById(v);
      if (el) el.hidden = (v !== id);
    });
  }

  function render() {
    const hash = location.hash || '';
    const authed = !!state.user;

    if (authed) {
      if (isAuthRoute(hash) || isLandingRoute(hash)) {
        // logged-in user landing on public routes → send to dashboard
        location.hash = '#/dashboard';
        return;
      }
      showView('app-views');
      renderSidebar();
      renderBottomNav();
      renderMobileTopbar();
    } else {
      if (isLandingRoute(hash)) {
        showView('view-landing');
        // re-trigger landing reveal animations
        requestAnimationFrame(() => initLandingReveals());
      } else if (isAuthRoute(hash)) {
        showView('view-auth');
        applyAuthModeFromQuery();
      } else if (isProtectedRoute(hash)) {
        // Frontend guard — backend still enforces on the API.
        // Send the user to login, remember where they wanted to go.
        sessionStorage.setItem('ww:redirect', hash);
        location.hash = '#/auth';
      } else {
        showView('view-landing');
      }
    }

    // cross-link auth buttons so ?mode=register is honoured
    document.querySelectorAll('[data-auth="register"]').forEach(a => {
      if (!a.getAttribute('href') || a.getAttribute('href') === '#/auth') {
        a.setAttribute('href', '#/auth?mode=register');
      }
    });
  }

  /* ---- auth page tab logic ------------------------------------------- */
  function activateAuthTab(tab) {
    const slider = document.getElementById('auth-tab-slider');
    const tabs = document.querySelectorAll('.auth-tab');
    const loginPanel = document.getElementById('panel-login');
    const regPanel = document.getElementById('panel-register');
    if (!slider || !loginPanel || !regPanel) return;

    tabs.forEach(t => t.classList.toggle('active', t.dataset.authTab === tab));
    const isReg = tab === 'register';
    slider.classList.toggle('to-register', isReg);
    loginPanel.hidden = isReg;
    regPanel.hidden = !isReg;
  }
  function applyAuthModeFromQuery() {
    const q = new URLSearchParams((location.hash.split('?')[1] || ''));
    activateAuthTab(q.get('mode') === 'register' ? 'register' : 'login');
  }

  /* ---- landing reveals (so the page never looks "empty") ------------- */
  let revealObserver = null;
  function initLandingReveals() {
    const els = document.querySelectorAll('#view-landing .reveal');
    if (!els.length) return;
    if (revealObserver) revealObserver.disconnect();
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('revealed'); revealObserver.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach(el => revealObserver.observe(el));

    // Also auto-reveal the hero frame (it's above the fold anyway)
    document.querySelectorAll('#view-landing .hero-frame, #view-landing .hero').forEach(el => el.classList.add('revealed'));
  }

  /* ---- public API ----------------------------------------------------- */
  window.WorthwiseAuth = {
    get user() { return state.user; },
    isAuthed: () => !!state.user,
    setUser(user) { state.user = user || null; emit(); render(); },
    refresh: async () => { state.user = await fetchMe(); state.ready = true; emit(); render(); return state.user; },
    logout: doLogout,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };

  /* ---- boot ----------------------------------------------------------- */
  async function boot() {
    // landing footer year (cheap, no-op elsewhere)
    const y = document.getElementById('footer-year'); if (y) y.textContent = new Date().getFullYear();

    // wire auth tabs
    document.querySelectorAll('[data-auth-tab]').forEach(t => {
      t.addEventListener('click', () => {
        const target = t.dataset.authTab;
        const newHash = target === 'register' ? '#/auth?mode=register' : '#/auth';
        if (location.hash !== newHash) location.hash = newHash;
        else activateAuthTab(target);
      });
    });
    window.addEventListener('hashchange', () => { applyAuthModeFromQuery(); render(); });

    state.user = await fetchMe();
    state.ready = true;
    emit();
    render();
    initLandingReveals();

    // expose a small event so app.js can react without polling
    window.dispatchEvent(new CustomEvent('worthwise:auth-ready', { detail: { user: state.user } }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
