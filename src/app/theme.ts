export type Theme = 'auto' | 'light' | 'dark'

const KEY = 'theme'

export function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

function resolved(theme: Theme): 'light' | 'dark' {
  if (theme !== 'auto') return theme
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Applica il tema all'elemento html e aggiorna il colore della barra del browser. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = resolved(theme) === 'dark' ? '#151614' : '#f8f7f3'
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // storage non disponibile
  }
  applyTheme(theme)
}

export function initTheme(): void {
  applyTheme(loadTheme())
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(loadTheme()))
}
