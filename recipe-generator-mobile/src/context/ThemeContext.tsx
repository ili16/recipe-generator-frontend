import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants';
import { darkTheme, lightTheme, Theme } from '../theme';

// The tokens live in `src/theme/` (BACKLOG 5.1); this file only chooses between them.
// Re-exported so the ~29 files that already `import { Theme } from '.../ThemeContext'` keep working.
export type { Theme };

export type ThemeMode = 'system' | 'light' | 'dark';

const isMode = (v: unknown): v is ThemeMode => v === 'system' || v === 'light' || v === 'dark';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: darkTheme,
  mode: 'system',
  isDark: true,
  setMode: () => {},
});

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const scheme = useColorScheme();
  // 'system' is also the pre-hydration value, so the first frame already follows the OS.
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.THEME_MODE)
      .then((stored) => { if (isMode(stored)) setModeState(stored); })
      .catch(() => {}); // a missing preference just means "system"
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEYS.THEME_MODE, next).catch(() => {});
  };

  const isDark = mode === 'system' ? scheme !== 'light' : mode === 'dark';

  return (
    <ThemeContext.Provider value={{ theme: isDark ? darkTheme : lightTheme, mode, isDark, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
