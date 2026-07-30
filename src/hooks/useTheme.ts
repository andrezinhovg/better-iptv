import { useEffect } from 'react';
import { getSetting } from '../lib/tauri';
import type { Theme } from '../components/settings/constants';

// Module-level, not component state: this is the single source of truth for
// "what theme is currently active," shared between the mount-time effect
// below and any component (e.g. Settings.tsx) that calls applyTheme directly
// for a live preview. A plain shared variable is simpler than adding a store
// or event bus for one boolean-ish piece of state.
let activeTheme: Theme = 'system';

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Applies a theme to the document immediately and remembers it as active. */
export function applyTheme(theme: Theme): void {
  activeTheme = theme;
  const isDark = theme === 'system' ? systemPrefersDark() : theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
}

/**
 * Loads the persisted theme setting on mount and applies it, then keeps the
 * page in sync with OS-level theme changes while 'system' is active. Call
 * this once, at the app root.
 */
export function useTheme(): void {
  useEffect(() => {
    getSetting('theme').then((saved) => {
      applyTheme((saved as Theme) || 'system');
    });

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      if (activeTheme === 'system') {
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handleSystemChange);

    return () => {
      mediaQuery.removeEventListener('change', handleSystemChange);
    };
  }, []);
}
