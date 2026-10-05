import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { useLang } from './i18n/LangContext';
import { useTheme } from './lib/theme';
import Dashboard from './pages/Dashboard';
import Roles from './pages/Roles';
import Departments from './pages/Departments';
import Workers from './pages/Workers';
import Shifts from './pages/Shifts';
import Planner from './pages/Planner';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import {
  Home, CalendarPlus, CalendarDays, Users, Building2, BadgeCheck, BarChart3, Settings as SettingsIcon,
  MoreHorizontal, Languages, Sun, Moon, AlertTriangle, CalendarClock, Plus, X,
} from 'lucide-react';
import './App.css';

// Navigation grouped by what you're doing, rather than one flat list.
const NAV_GROUPS = [
  { items: [{ to: '/', icon: Home, key: 'navToday' }] },
  { labelKey: 'navGroupSchedule', items: [
    { to: '/shifts', icon: CalendarPlus, key: 'navBuild' },
    { to: '/planner', icon: CalendarDays, key: 'navWeek' },
  ] },
  { labelKey: 'navGroupTeam', items: [
    { to: '/workers', icon: Users, key: 'navWorkers' },
    { to: '/departments', icon: Building2, key: 'navDepartments' },
    { to: '/roles', icon: BadgeCheck, key: 'navRoles' },
  ] },
  { labelKey: 'navGroupInsights', items: [{ to: '/analytics', icon: BarChart3, key: 'navAnalytics' }] },
];

const MORE_ITEMS = [
  { to: '/departments', icon: Building2, key: 'navDepartments' },
  { to: '/roles', icon: BadgeCheck, key: 'navRoles' },
  { to: '/analytics', icon: BarChart3, key: 'navAnalytics' },
  { to: '/settings', icon: SettingsIcon, key: 'navSettings' },
];

function Brand() {
  const { t } = useLang();
  return (
    <Link to="/" className="brand">
      <span className="brand-mark"><CalendarClock size={18} strokeWidth={2.4} /></span>
      <span className="brand-name">{t('appName')}</span>
    </Link>
  );
}

function SyncPill() {
  const { cloudEnabled, syncCode, syncStatus } = useApp();
  const { t } = useLang();
  if (!cloudEnabled) return null;
  let tone = 'off';
  let label = t('localOnly');
  if (syncCode) {
    if (syncStatus === 'error') { tone = 'error'; label = t('syncIssue'); }
    else if (syncStatus === 'syncing') { tone = 'syncing'; label = t('syncing'); }
    else { tone = 'ok'; label = t('synced'); }
  }
  return (
    <Link to="/settings" className={`sync-pill sync-pill-${tone}`} title={label}>
      <span className="sync-pill-dot" />
      <span className="sync-pill-label">{label}</span>
    </Link>
  );
}

// Cloud sync failing (e.g. a paused Supabase project) used to be visible only
// as a small status dot on the Settings page — easy to miss entirely. Surface
// it everywhere so it's obvious something needs attention, while making clear
// that local data on this device is unaffected.
function SyncErrorBanner() {
  const { cloudEnabled, syncCode, syncStatus } = useApp();
  const { t } = useLang();
  if (!cloudEnabled || !syncCode || syncStatus !== 'error') return null;
  return (
    <div className="sync-error-banner" role="status">
      <AlertTriangle size={16} />
      <span>{t('syncErrorBanner')}</span>
      <Link to="/settings">{t('navSettings')}</Link>
    </div>
  );
}

function ThemeLangButtons({ variant = 'icon' }) {
  const { t, lang, toggle: toggleLang } = useLang();
  const { isDark, toggle: toggleTheme } = useTheme();
  return (
    <div className={`pref-buttons pref-buttons-${variant}`}>
      <button type="button" className="pref-btn" onClick={toggleTheme} title={isDark ? t('lightMode') : t('darkMode')} aria-label={isDark ? t('lightMode') : t('darkMode')}>
        {isDark ? <Sun size={17} /> : <Moon size={17} />}
        {variant === 'full' && <span>{isDark ? t('lightMode') : t('darkMode')}</span>}
      </button>
      <button type="button" className="pref-btn" onClick={toggleLang} title={lang === 'en' ? 'עברית' : 'English'} aria-label={lang === 'en' ? 'עברית' : 'English'}>
        <Languages size={17} />
        <span>{lang === 'en' ? 'עב' : 'EN'}</span>
      </button>
    </div>
  );
}

function Rail() {
  const { t } = useLang();
  return (
    <aside className="rail">
      <div className="rail-head"><Brand /></div>
      <nav className="rail-nav" aria-label={t('appName')}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className="rail-group">
            {group.labelKey && <div className="rail-group-label">{t(group.labelKey)}</div>}
            {group.items.map(({ to, icon: Icon, key }) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `rail-link ${isActive ? 'rail-link-active' : ''}`}>
                <Icon size={18} />
                <span>{t(key)}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="rail-foot">
        <NavLink to="/settings" className={({ isActive }) => `rail-link ${isActive ? 'rail-link-active' : ''}`}>
          <SettingsIcon size={18} />
          <span>{t('navSettings')}</span>
        </NavLink>
        <ThemeLangButtons variant="rail" />
      </div>
    </aside>
  );
}

function Topbar() {
  const { t, lang } = useLang();
  const { pathname } = useLocation();
  const todayLabel = new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return (
    <header className="topbar">
      <div className="topbar-mobile-brand"><Brand /></div>
      <div className="topbar-date">{todayLabel}</div>
      <div className="topbar-actions">
        <SyncPill />
        <div className="topbar-prefs"><ThemeLangButtons variant="icon" /></div>
        {pathname !== '/shifts' && (
          <Link to="/shifts" className="btn btn-primary topbar-cta">
            <Plus size={16} strokeWidth={2.5} /> {t('newShift')}
          </Link>
        )}
      </div>
    </header>
  );
}

function BottomNav({ moreOpen, setMoreOpen }) {
  const { t } = useLang();
  const { pathname } = useLocation();
  const moreActive = MORE_ITEMS.some((i) => pathname.startsWith(i.to));
  const tab = (to, Icon, key) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `tab ${isActive && !moreOpen ? 'tab-active' : ''}`}>
      <Icon size={21} />
      <span>{t(key)}</span>
    </NavLink>
  );
  return (
    <nav className="bottom-nav" aria-label={t('appName')}>
      {tab('/', Home, 'navToday')}
      {tab('/planner', CalendarDays, 'navWeek')}
      <NavLink to="/shifts" className={({ isActive }) => `tab tab-build ${isActive && !moreOpen ? 'tab-active' : ''}`} aria-label={t('navBuild')}>
        <span className="tab-build-btn"><Plus size={24} strokeWidth={2.5} /></span>
        <span>{t('navBuildShort')}</span>
      </NavLink>
      {tab('/workers', Users, 'navWorkers')}
      <button type="button" className={`tab ${moreOpen || moreActive ? 'tab-active' : ''}`} onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen}>
        {moreOpen ? <X size={21} /> : <MoreHorizontal size={21} />}
        <span>{t('navMore')}</span>
      </button>
    </nav>
  );
}

function MoreSheet({ onClose }) {
  const { t } = useLang();
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={t('navMore')}>
        <div className="sheet-handle" />
        <div className="sheet-grid">
          {MORE_ITEMS.map(({ to, icon: Icon, key }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `sheet-item ${isActive ? 'sheet-item-active' : ''}`} onClick={onClose}>
              <span className="sheet-item-icon"><Icon size={20} /></span>
              <span>{t(key)}</span>
            </NavLink>
          ))}
        </div>
        <ThemeLangButtons variant="full" />
      </div>
    </>
  );
}

function Shell() {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setMoreOpen(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="app">
      <Rail />
      <div className="workspace">
        <Topbar />
        <main className="main">
          <SyncErrorBanner />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/roles" element={<Roles />} />
            <Route path="/departments" element={<Departments />} />
            <Route path="/workers" element={<Workers />} />
            <Route path="/shifts" element={<Shifts />} />
            <Route path="/planner" element={<Planner />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
      <BottomNav moreOpen={moreOpen} setMoreOpen={setMoreOpen} />
      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </AppProvider>
  );
}
