import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Link } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { useLang } from './i18n/LangContext';
import Dashboard from './pages/Dashboard';
import Roles from './pages/Roles';
import Departments from './pages/Departments';
import Workers from './pages/Workers';
import Shifts from './pages/Shifts';
import Planner from './pages/Planner';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import { LayoutDashboard, Wrench, Building2, Users, CalendarClock, CalendarDays, BarChart3, Menu, X, MoreHorizontal, Languages, Settings as SettingsIcon, AlertTriangle } from 'lucide-react';
import './App.css';

// Cloud sync failing (e.g. a paused Supabase project) used to be visible only
// as a small status dot on the Settings page — easy to miss entirely. Surface
// it everywhere so it's obvious something needs attention, while making clear
// that local data on this device is unaffected.
function SyncErrorBanner() {
  const { cloudEnabled, syncCode, syncStatus } = useApp();
  const { t } = useLang();
  if (!cloudEnabled || !syncCode || syncStatus !== 'error') return null;
  return (
    <div className="sync-error-banner">
      <AlertTriangle size={16} />
      <span>{t('syncErrorBanner')}</span>
      <Link to="/settings">{t('navSettings')}</Link>
    </div>
  );
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { t, lang, toggle } = useLang();

  const mainNav = [
    { to: '/', icon: LayoutDashboard, label: t('navHome') },
    { to: '/shifts', icon: CalendarClock, label: t('navShifts') },
    { to: '/departments', icon: Building2, label: t('navDepts') },
    { to: '/workers', icon: Users, label: t('navWorkers') },
  ];

  const moreNav = [
    { to: '/roles', icon: Wrench, label: t('navRoles') },
    { to: '/planner', icon: CalendarDays, label: t('navPlanner') },
    { to: '/analytics', icon: BarChart3, label: t('navAnalytics') },
    { to: '/settings', icon: SettingsIcon, label: t('navSettings') },
  ];

  const allNav = [
    { to: '/', icon: LayoutDashboard, label: t('navDashboard') },
    { to: '/roles', icon: Wrench, label: t('navRoles') },
    { to: '/departments', icon: Building2, label: t('navDepartments') },
    { to: '/workers', icon: Users, label: t('navWorkers') },
    { to: '/shifts', icon: CalendarClock, label: t('navShifts') },
    { to: '/planner', icon: CalendarDays, label: t('navPlanner') },
    { to: '/analytics', icon: BarChart3, label: t('navAnalytics') },
    { to: '/settings', icon: SettingsIcon, label: t('navSettings') },
  ];

  return (
    <AppProvider>
      <BrowserRouter>
        <div className="app">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <nav className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
            <div className="sidebar-brand">
              <CalendarClock size={22} />
              <span>{t('appName')}</span>
            </div>
            <ul className="sidebar-nav">
              {allNav.map(({ to, icon: Icon, label }) => (
                <li key={to}>
                  <NavLink to={to} end={to === '/'} className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`} onClick={() => setSidebarOpen(false)}>
                    <Icon size={18} /><span>{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
            <div style={{ padding: '0.75rem 1rem', marginTop: 'auto' }}>
              <button className="lang-toggle" onClick={toggle}>
                <Languages size={14} />
                {lang === 'en' ? 'עברית' : 'English'}
              </button>
            </div>
          </nav>

          {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

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

          <nav className="bottom-bar">
            {mainNav.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `bottom-tab ${isActive ? 'bottom-tab-active' : ''}`}>
                <Icon size={20} />
                <span>{label}</span>
              </NavLink>
            ))}
            <button className={`bottom-tab ${moreOpen ? 'bottom-tab-active' : ''}`} onClick={() => setMoreOpen(!moreOpen)}>
              <MoreHorizontal size={20} />
              <span>{t('navMore')}</span>
            </button>
          </nav>

          {moreOpen && (
            <>
              <div className="more-overlay" onClick={() => setMoreOpen(false)} />
              <div className="more-menu">
                {moreNav.map(({ to, icon: Icon, label }) => (
                  <NavLink key={to} to={to} className={({ isActive }) => `more-item ${isActive ? 'more-item-active' : ''}`} onClick={() => setMoreOpen(false)}>
                    <Icon size={20} />
                    <span>{label}</span>
                  </NavLink>
                ))}
                <button className="more-item" onClick={() => { toggle(); setMoreOpen(false); }}>
                  <Languages size={20} />
                  <span>{lang === 'en' ? 'עברית' : 'English'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}
