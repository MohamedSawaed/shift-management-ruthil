import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const THEME_KEY = 'myshift_theme';
const ThemeContext = createContext({ isDark: false, preference: 'system', setPreference: () => {}, toggle: () => {} });

// preference: 'system' (follow the OS/browser, and keep tracking it live),
// 'light' or 'dark' (explicit choice, stamped on <html data-theme>).
export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch { return 'system'; }
  });
  const [systemDark, setSystemDark] = useState(() => {
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
  });

  useEffect(() => {
    let mq;
    try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch { return undefined; }
    const handler = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const isDark = preference === 'system' ? systemDark : preference === 'dark';

  useEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', preference);
    try {
      if (preference === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, preference);
    } catch { /* ignore */ }
    // Keep the mobile browser chrome in step with the app background.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#0b0c14' : '#f3f4f8');
  }, [preference, isDark]);

  const toggle = useCallback(() => setPreference(isDark ? 'light' : 'dark'), [isDark]);

  return (
    <ThemeContext.Provider value={{ isDark, preference, setPreference, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
