'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { getTheme, setTheme as persistTheme } from '@/lib/store';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeCtx {
  theme: ThemeMode;
  resolved: 'light' | 'dark';
  setTheme: (t: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: 'system',
  resolved: 'light',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = getTheme();
    setThemeState(saved);
  }, []);

  useEffect(() => {
    function apply(t: ThemeMode) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = t === 'dark' || (t === 'system' && prefersDark);
      document.documentElement.classList.toggle('dark', isDark);
      setResolved(isDark ? 'dark' : 'light');
    }

    apply(theme);

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => apply(theme);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme]);

  function setTheme(t: ThemeMode) {
    setThemeState(t);
    persistTheme(t);
  }

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
