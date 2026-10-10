# Ricettario

PWA React + TypeScript (Vite, Tailwind v4, Dexie, react-router). Package manager: **pnpm**. Lingua dell'interfaccia e della documentazione: italiano.

- `pnpm test` esegue i test del dominio (`src/core/__tests__`). Ogni modifica al motore di scalatura deve avere un test.
- `pnpm typecheck && pnpm build` prima di ogni commit.
- `src/core` non importa React né Dexie: è dominio puro.
- Le regole di scalatura sono documentate in `docs/MODELLO-DATI.md`: aggiornarlo se cambiano.
- Il fattore di scalatura vive nell'URL (`?f=`), non in uno store globale.
- Colori solo tramite i token semantici di `src/index.css` (`bg-surface`, `text-muted`, `bg-accent`…): mai classi come `bg-white` o `text-stone-500`, altrimenti il tema scuro si rompe. Icone da `Icon.tsx`, niente emoji nell'interfaccia.
- Design: titoli e quantità in `font-display` (Fraunces), sezioni con `section-title` e filetti (`rule`), schede (`card`) solo per i pannelli interattivi. Niente etichette in maiuscoletto, niente puntini `·` come separatori: usare virgole o icone.
