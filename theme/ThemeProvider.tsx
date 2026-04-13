import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type ThemeName = 'engineering-dark' | 'mint-clean' | 'high-contrast';

export interface ThemeInfo {
  name: ThemeName;
  label: string;
  description: string;
}

export const THEMES: ThemeInfo[] = [
  {
    name: 'engineering-dark',
    label: 'Ingeniería Oscuro',
    description: 'Profesional técnico'
  },
  {
    name: 'mint-clean',
    label: 'Mint Presentación',
    description: 'Limpio para clientes'
  },
  {
    name: 'high-contrast',
    label: 'Alto Contraste',
    description: 'Máxima visibilidad obra'
  }
];

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  getThemeInfo: () => ThemeInfo;
  themeVersion: number;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'smcalc-alc-theme';
const DEFAULT_THEME: ThemeName = 'engineering-dark';

function getStoredTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (stored === 'engineering-dark' || stored === 'mint-clean' || stored === 'high-contrast')) {
      return stored as ThemeName;
    }
  } catch {
    // localStorage no disponible
  }
  return DEFAULT_THEME;
}

function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute('data-theme', theme);
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    return getStoredTheme();
  });
  const [themeVersion, setThemeVersion] = useState<number>(0);

  useEffect(() => {
    applyTheme(theme);
    setThemeVersion(v => v + 1);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage no disponible
    }
  }, [theme]);

  const setTheme = useCallback((newTheme: ThemeName) => {
    setThemeState(newTheme);
  }, []);

  const getThemeInfo = useCallback(() => {
    return THEMES.find(t => t.name === theme) || THEMES[0];
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, getThemeInfo, themeVersion }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function getTheme(): ThemeName {
  return getStoredTheme();
}

export function setThemeDirect(theme: ThemeName): void {
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage no disponible
  }
}
