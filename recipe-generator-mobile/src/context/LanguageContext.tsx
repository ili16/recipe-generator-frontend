import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants';
import { i18n, deviceLanguage, isLanguage, Language } from '../i18n';

// Same shape as ThemeContext, for the same reason: an OS default the user can override, kept
// on the device. The UI language also decides the `language` the backend gets on a chat turn
// (see apiService), so switching here switches what the model writes back.
export type LanguageMode = 'system' | Language;

const isMode = (v: unknown): v is LanguageMode => v === 'system' || isLanguage(v);

interface LanguageContextValue {
  locale: Language;
  mode: LanguageMode;
  setMode: (mode: LanguageMode) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: 'en',
  mode: 'system',
  setMode: () => {},
  t: (key) => key,
});

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // 'system' is also the pre-hydration value, so the first frame is already in the OS language.
  const [mode, setModeState] = useState<LanguageMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.LANGUAGE)
      .then((stored) => { if (isMode(stored)) setModeState(stored); })
      .catch(() => {}); // a missing preference just means "system"
  }, []);

  const setMode = (next: LanguageMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEYS.LANGUAGE, next).catch(() => {});
  };

  const locale: Language = mode === 'system' ? deviceLanguage() : mode;
  // Set during render, not in an effect: non-component callers (date formatters, apiService)
  // read `i18n.locale` at call time and must never see the previous language.
  i18n.locale = locale;

  // Identity changes with the locale — that is what re-renders every consumer on a switch.
  const t = useCallback((key: string, options?: Record<string, unknown>) => i18n.t(key, options), [locale]);

  return (
    <LanguageContext.Provider value={{ locale, mode, setMode, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
