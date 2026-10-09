import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Link, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { useLang } from './i18n/LangContext';
import { useTheme } from './lib/theme';
import Schedule from './pages/Schedule';
import Shifts from './pages/Shifts';
import Team from './pages/Team';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import { CalendarDays, Users, BarChart3, Settings as SettingsIcon, Languages, Sun, Moon, AlertTriangle, CalendarClock, Plus } from 'lucide-react';
import './App.css';

// Four places, named after what you do there.
const NAV = [
  { to: '/', icon: CalendarDays, key: 'navSchedule' },
  { to: '/team', icon: Users, key: 'navTeam' },
  { to: '/insights', icon: BarChart3, key: 'navInsights' },
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

function PrefButtons() {
  const { t, lang, toggle: toggleLang } = useLang();
  const { isDark, toggle: toggleTheme } = useTheme();
  return (
    <div className="pref-buttons">
      <button type="button" className="pref-btn" onClick={toggleTheme} title={isDark ? t('lightMode') : t('darkMode')} aria-label={isDark ? t('lightMode') : t('darkMode')}>
        {isDark ? <Sun size={17} /> : <Moon size={17} />}
      </button>
      <button type="button" className="pref-btn" onClick={toggleLang} title={lang === 'en' ? 'עברית' : 'English'} aria-label={lang === 'en' ? 'עברית' : 'English'}>
        <Languages size={16} />
        <span>{lang === 'en' ? 'עב' : 'EN'}</span>
      </button>
    </div>
  );
}

function TopBar() {
  const { t } = useLang();
  const { pathname } = useLocation();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Brand />
        <nav className="topnav" aria-label={t('appName')}>
          {NAV.map(({ to, icon: Icon, key }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `topnav-link ${isActive ? 'topnav-link-active' : ''}`}>
              <Icon size={17} />
              <span>{t(key)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="topbar-actions">
          <SyncPill />
          <PrefButtons />
          {pathname !== '/build' && (
            <Link to="/build" className="btn btn-primary topbar-cta">
              <Plus size={17} strokeWidth={2.5} /> {t('newShift')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function BottomNav() {
  const { t } = useLang();
  const tab = ({ to, icon: Icon, key }) => (
    <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `tab ${isActive ? 'tab-active' : ''}`}>
      <Icon size={21} />
      <span>{t(key)}</span>
    </NavLink>
  );
  return (
    <nav className="bottom-nav" aria-label={t('appName')}>
      {tab(NAV[0])}
      {tab(NAV[1])}
      <Link to="/build" className="tab tab-build" aria-label={t('newShift')}>
        <span className="tab-build-btn"><Plus size={24} strokeWidth={2.6} /></span>
        <span>{t('newShiftShort')}</span>
      </Link>
      {tab(NAV[2])}
      {tab(NAV[3])}
    </nav>
  );
}

// Old URLs (bookmarks, links shared before the redesign) keep working.
function Redirect({ to }) {
  const { search } = useLocation();
  return <Navigate to={to.includes('?') ? to : `${to}${search}`} replace />;
}

function Shell() {
  const { pathname } = useLocation();
  const focusMode = pathname === '/build';

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className={`app ${focusMode ? 'app-focus' : ''}`}>
      <TopBar />
      <main className="main">
        <SyncErrorBanner />
        <Routes>
          <Route path="/" element={<Schedule />} />
          <Route path="/build" element={<Shifts />} />
          <Route path="/team" element={<Team />} />
          <Route path="/insights" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/shifts" element={<Redirect to="/build" />} />
          <Route path="/planner" element={<Redirect to="/" />} />
          <Route path="/workers" element={<Redirect to="/team?tab=workers" />} />
          <Route path="/departments" element={<Redirect to="/team?tab=departments" />} />
          <Route path="/roles" element={<Redirect to="/team?tab=roles" />} />
          <Route path="/analytics" element={<Redirect to="/insights" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!focusMode && <BottomNav />}
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
