/**
 * Gerenciamento de Tema Acadêmico (Light / Dark / System)
 * Persistência local e sincronização reativa com o sistema operacional
 */

const THEME_STORAGE_KEY = 'academic_theme';
const DEFAULT_THEME = 'system';

export function getStoredTheme() {
  return localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
}

export function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);

  const select = document.getElementById('themeSelect');
  if (select && select.value !== theme) {
    select.value = theme;
  }

  const mobileSelect = document.getElementById('mobileThemeSelect');
  if (mobileSelect && mobileSelect.value !== theme) {
    mobileSelect.value = theme;
  }
}

export function initTheme() {
  const currentTheme = getStoredTheme();
  applyTheme(currentTheme);

  // Escuta alteração manual no seletor principal
  const select = document.getElementById('themeSelect');
  if (select) {
    select.value = currentTheme;
    select.addEventListener('change', (e) => {
      applyTheme(e.target.value);
    });
  }

  // Escuta alteração manual no seletor mobile
  const mobileSelect = document.getElementById('mobileThemeSelect');
  if (mobileSelect) {
    mobileSelect.value = currentTheme;
    mobileSelect.addEventListener('change', (e) => {
      applyTheme(e.target.value);
    });
  }

  // Escuta alterações na preferência do sistema operacional
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', () => {
    const activePreference = getStoredTheme();
    if (activePreference === 'system') {
      applyTheme('system');
    }
  });
}
