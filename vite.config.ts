import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { APP_DESCRIPTION, APP_NAME, BACKGROUND_COLOR, THEME_COLOR } from './src/app/branding'

/** GitHub Pages risponde 404 ai percorsi profondi: con 404.html uguale a index.html l'app parte comunque. */
function spaFallback() {
  return {
    name: 'spa-fallback-404',
    // Scrive nell'HTML dove sta il backend: utile per controllare un deploy guardando il sorgente.
    transformIndexHtml(html: string) {
      return html.replace('</head>', `    <meta name="ricettario-backend" content="${process.env.VITE_DEFAULT_PROXY ?? ''}" />\n  </head>`)
    },
    async writeBundle(options: { dir?: string }) {
      const { copyFile } = await import('node:fs/promises')
      const dir = options.dir ?? 'dist'
      await copyFile(`${dir}/index.html`, `${dir}/404.html`).catch(() => undefined)
    },
  }
}

/**
 * Dove sta il backend per l'app compilata. Su Cloudflare (Workers Builds o Pages) è sempre
 * sullo stesso indirizzo, sotto /api: lo si deduce dalle variabili della build, così nel
 * cruscotto non c'è nulla da impostare. Altrove (GitHub Pages, locale) resta vuoto, salvo
 * VITE_DEFAULT_PROXY esplicita.
 */
const onCloudflare = Boolean(process.env.WORKERS_CI || process.env.CF_PAGES || process.env.CLOUDFLARE_ACCOUNT_ID)
if (process.env.VITE_DEFAULT_PROXY === undefined && onCloudflare) process.env.VITE_DEFAULT_PROXY = '/api'
console.log(`[ricettario] backend per l'app: ${process.env.VITE_DEFAULT_PROXY || '(nessuno: chiave personale)'}${onCloudflare ? ', build su Cloudflare' : ''}`)

export default defineConfig({
  plugins: [
    spaFallback(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      // in dev non serve e confonde le prove in locale
      devOptions: { enabled: false },
      manifest: {
        name: APP_NAME,
        short_name: APP_NAME,
        description: APP_DESCRIPTION,
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        display: 'standalone',
        lang: 'it',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
