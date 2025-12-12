document.addEventListener('DOMContentLoaded', () => {
  const darkModeToggle = document.getElementById('darkModeToggle');
  const THEME_KEY = 'canvas-theme';

  function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function getStoredTheme() {
    return localStorage.getItem(THEME_KEY);
  }

  function setTheme(theme) {
    document.body.classList.remove('dark-theme', 'light-theme');
    if (theme === 'dark') {
      document.body.classList.add('dark-theme');
      darkModeToggle.textContent = '🌙';
    } else {
      document.body.classList.add('light-theme');
      darkModeToggle.textContent = '☀️';
    }
    localStorage.setItem(THEME_KEY, theme);
  }

  function initTheme() {
    const storedTheme = getStoredTheme();
    if (storedTheme) {
      setTheme(storedTheme);
    } else {
      const systemTheme = getSystemTheme();
      darkModeToggle.textContent = systemTheme === 'dark' ? '🌙' : '☀️';
    }
  }

  darkModeToggle.addEventListener('click', () => {
    const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!getStoredTheme()) {
      const systemTheme = e.matches ? 'dark' : 'light';
      darkModeToggle.textContent = systemTheme === 'dark' ? '🌙' : '☀️';
    }
  });

  initTheme();
});
