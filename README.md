# Ricettario

App ricettario personale, installabile come PWA e funzionante offline, con tre idee al centro:

1. **Ricette strutturate**: ingredienti con quantità tipizzate e passaggi che citano gli ingredienti per id, così ogni passaggio mostra sempre la quantità giusta.
2. **Configuratore di quantità**: si cambiano le porzioni, la resa totale, oppure *un singolo ingrediente* ("ho solo 300 g di farina") e tutta la ricetta si adatta. La scalatura non è ingenuamente lineare: sale e lievito crescono meno, le uova restano intere, le percentuali del panettiere seguono la farina.
3. **Modalità cucina**: un passaggio per schermata, caratteri grandi, timer con notifica, schermo sempre acceso, checklist di mise en place e diario di fine cottura.

L'integrazione con un modello AI (import da foto/testo, valutazione di varianti, evoluzione delle ricette) è prevista nella [roadmap](docs/ROADMAP.md).

## Avvio

```bash
pnpm install
pnpm dev        # sviluppo su http://localhost:5173
pnpm test       # test del motore di scalatura
pnpm build      # build di produzione in dist/
pnpm preview    # anteprima del build
```

Richiede Node 22+. Il progetto usa `pnpm`.

## Struttura

```
src/
  core/        dominio puro, senza React: modello, unità, formattazione, scalatura, passaggi
    __tests__/ test vitest del motore
  data/        Dexie (IndexedDB): schema, ricette di esempio, funzioni CRUD, export/import
  app/         interfaccia React
    pages/     RecipeList, RecipeView (lettura + configuratore), CookMode, RecipeWizard, Settings
    components/ScalerPanel, IngredientList, StepText, TimerButton, Layout
    hooks/     useScaler (fattore nell'URL, `?f=1.5`)
docs/
  MODELLO-DATI.md  schema della ricetta e regole di scalatura
  ROADMAP.md       prossimi passi
```

Il motore di scalatura (`src/core/scaling.ts`) è deterministico e testato: l'interfaccia lo usa, non lo reimplementa. Vedi [docs/MODELLO-DATI.md](docs/MODELLO-DATI.md) per le regole.

## Dati

Le ricette vivono in IndexedDB sul dispositivo. Da *Impostazioni* si esporta e importa un file JSON. Alla prima apertura vengono caricate tre ricette di esempio (impasto per pizza, carbonara, tiramisù) che mostrano le diverse regole di scalatura.
