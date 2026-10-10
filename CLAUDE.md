# Ricettario

PWA React + TypeScript (Vite, Tailwind v4, Dexie, react-router). Package manager: **pnpm**. Lingua dell'interfaccia e della documentazione: italiano.

- `pnpm test` esegue i test del dominio (`src/core/__tests__`). Ogni modifica al motore di scalatura deve avere un test.
- `pnpm typecheck && pnpm build` prima di ogni commit.
- `src/core` non importa React né Dexie: è dominio puro.
- Le regole di scalatura sono documentate in `docs/MODELLO-DATI.md`: aggiornarlo se cambiano.
- Il fattore di scalatura vive nell'URL (`?f=`), non in uno store globale.
