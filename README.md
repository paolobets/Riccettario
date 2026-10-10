# Ricettario

App ricettario personale, installabile come PWA e funzionante offline, con tre idee al centro:

1. **Ricette strutturate**: ingredienti con quantità tipizzate e passaggi che citano gli ingredienti per id, così ogni passaggio mostra sempre la quantità giusta.
2. **Configuratore di quantità**: si cambiano le porzioni, la resa totale, oppure *un singolo ingrediente* ("ho solo 300 g di farina") e tutta la ricetta si adatta. La scalatura non è ingenuamente lineare: sale e lievito crescono meno, le uova restano intere, le percentuali del panettiere seguono la farina.
3. **Modalità cucina**: un passaggio per schermata, caratteri grandi, timer multipli sempre visibili e persistenti, passaggi paralleli ("nel frattempo puoi"), schermo sempre acceso, checklist di mise en place e diario di fine cottura.

4. **Assistente AI** (Claude): importa una ricetta da testo incollato, foto o indirizzo web e la trasforma nella struttura con le regole di scalatura già proposte; risponde a domande sulla ricetta tenendo conto del fattore di scalatura e del diario di cottura; crea varianti complete da un'istruzione ("senza lattosio", "applica le note dell'ultima volta").

## Come provarla

**Dal telefono o dal browser, senza installare nulla.** Ogni push su `main` pubblica l'app su GitHub Pages tramite `.github/workflows/deploy.yml`: l'indirizzo è `https://<utente>.github.io/<nome-repo>/` (per questo repository: https://paolobets.github.io/Riccettario/). Aprila, poi "Aggiungi alla schermata Home" per averla come app: funziona anche offline. Le ricette restano nel browser del dispositivo; usa *Impostazioni → Esporta* per il backup.

Se la pubblicazione non parte al primo push, in *Settings → Pages* del repository imposta la sorgente su "GitHub Actions" e rilancia il workflow.

**In locale:**

```bash
pnpm install
pnpm dev        # sviluppo su http://localhost:5173
```

Per l'assistente AI serve una chiave API Anthropic (da https://console.anthropic.com), da inserire in *Impostazioni → Assistente AI*.

## Comandi

```bash
pnpm install
pnpm dev        # sviluppo su http://localhost:5173
pnpm test       # test del motore di scalatura
pnpm build      # build di produzione in dist/
pnpm preview    # anteprima del build
```

Richiede Node 22+. Il progetto usa `pnpm`. In CI girano test e typecheck prima della pubblicazione.

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
    timers/    store dei timer attivi, persistito in localStorage
  ai/          client Anthropic, schema di scambio (zod) e conversione in Recipe, import, domande, varianti
proxy/         worker Cloudflare opzionale che custodisce la chiave API
    branding.ts nome, descrizione e colori dell'app
docs/
  MODELLO-DATI.md  schema della ricetta e regole di scalatura
  ROADMAP.md       prossimi passi
```

Il motore di scalatura (`src/core/scaling.ts`) è deterministico e testato: l'interfaccia lo usa, non lo reimplementa. Vedi [docs/MODELLO-DATI.md](docs/MODELLO-DATI.md) per le regole.

## Assistente AI

Serve una chiave API Anthropic, da inserire in *Impostazioni → Assistente AI*. La chiave resta in IndexedDB sul dispositivo e viene inviata solo ad Anthropic. Ogni richiesta ha un costo sul tuo account: il modello predefinito è Claude Opus 5.5, si può scegliere Sonnet o Haiku per spendere meno.

Chi preferisce non tenere la chiave nel browser può pubblicare `proxy/cloudflare-worker.js` su Cloudflare Workers (istruzioni nel file): l'app parla col proxy usando una password e il proxy aggiunge la vera chiave.

Il codice dell'AI è in `src/ai/` e viene caricato solo quando serve, così il resto dell'app resta leggero e offline. Ogni risposta mostra il costo reale della richiesta (dai token riportati dall'API) e in *Impostazioni* c'è il totale speso. Le conversazioni restano salvate per ricetta e sono disponibili anche in modalità cucina, dove il bottone "Chiedi" passa all'AI il passaggio corrente.

## Aspetto

Tema chiaro e scuro: automatico in base al dispositivo, oppure a scelta in *Impostazioni → Aspetto*. I colori sono token semantici in `src/index.css` (`--bg`, `--surface`, `--accent`…): i componenti usano solo classi come `bg-surface` o `text-muted`, quindi cambiare palette o aggiungere un tema significa toccare un solo file. Le icone sono SVG a tratto in `src/app/components/Icon.tsx`.

## Dati

Le ricette vivono in IndexedDB sul dispositivo. Da *Impostazioni* si esporta e importa un file JSON. Alla prima apertura vengono caricate tre ricette di esempio (impasto per pizza, carbonara, tiramisù) che mostrano le diverse regole di scalatura.
