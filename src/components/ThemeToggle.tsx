'use client';

import React, { useSyncExternalStore } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { getDictionary } from '@/i18n/dictionaries';

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const mounted = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
  const dict = getDictionary('en');

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dict.theme.toggleAria}
      className="p-2 rounded-full border border-black/20 dark:border-white/20 text-black dark:text-white bg-transparent hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center pointer-events-auto"
    >
      {!mounted ? (
        <span className="w-5 h-5 inline-block" />
      ) : theme === 'dark' ? (
        <Sun className="w-5 h-5" strokeWidth={1.75} />
      ) : (
        <Moon className="w-5 h-5" strokeWidth={1.75} />
      )}
    </button>
  );
}
