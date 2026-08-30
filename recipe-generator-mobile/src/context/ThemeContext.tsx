import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface Theme {
  dark: boolean;
  bg: string;
  surface: string;
  card: string;
  border: string;
  hairline: string;
  text: string;
  subtext: string;
  muted: string;
  placeholder: string;
  accent: string;
  accentFaded: string;
  shadow: string;
}

const dark: Theme = {
  dark: true,
  bg: '#16161a',
  surface: '#1f1f23',
  card: '#252529',
  border: '#38383f',
  hairline: '#2c2c31',
  text: '#eeeef2',
  subtext: '#b0b0b8',
  muted: '#72727a',
  placeholder: '#72727a',
  accent: '#cc2222',
  accentFaded: '#2e1212',
  shadow: '#cc2222',
};

const light: Theme = {
  dark: false,
  bg: '#f5f5f5',
  surface: '#ffffff',
  card: '#ffffff',
  border: '#e0e0e0',
  hairline: '#ebebeb',
  text: '#111111',
  subtext: '#555555',
  muted: '#999999',
  placeholder: '#aaaaaa',
  accent: '#cc2222',
  accentFaded: '#fff0f0',
  shadow: '#cc2222',
};

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: dark,
  isDark: true,
  toggle: () => {},
});

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState(true);

  const toggle = () => setIsDark((prev) => !prev);

  return (
    <ThemeContext.Provider value={{ theme: isDark ? dark : light, isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
