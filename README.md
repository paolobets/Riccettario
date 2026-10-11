# Ricettario

App ricettario personale, installabile come PWA e funzionante offline, con tre idee al centro:

1. **Ricette strutturate**: ingredienti con quantità tipizzate e passaggi che citano gli ingredienti per id, così ogni passaggio mostra sempre la quantità giusta.
2. **Configuratore di quantità**: si cambiano le porzioni, la resa totale, oppure *un singolo ingrediente* ("ho solo 300 g di farina") e tutta la ricetta si adatta. La scalatura non è ingenuamente lineare: sale e lievito crescono meno, le uova restano intere, le percentuali del panettiere seguono la farina.
3. **Modalità cucina**: un passaggio per schermata, caratteri grandi, timer multipli sempre visibili e persistenti, passaggi paralleli ("nel frattempo puoi"), schermo sempre acceso, checklist di mise en place e diario di fine cottura.

4. **Assistente AI** (Claude): importa una ricetta da testo incollato, foto o indirizzo web e la trasforma nella struttura con le regole di scalatura già proposte; scrive la ricetta di un piatto chiesto per nome; risponde a domande sulla ricetta tenendo conto del fattore di scalatura e del diario di cottura; crea varianti complete da un'istruzione ("senza lattosio", "applica le note dell'ultima volta").

5. **Cosa preparo?**: scegli il pasto, il tempo che hai ai fornelli e cosa c'è in casa; l'app pesca tra le tue ricette (preferendo quelle che usano quello che hai e che non cucini da un po') e, se vuoi, chiede all'AI una seconda opinione o un piatto nuovo.

## Come provarla

**Su Cloudflare Pages, con backend e database (consigliato).** App e backend girano insieme: ogni persona riceve una password, le sue ricette si sincronizzano tra i dispositivi, la chiave Anthropic resta nei segreti del progetto, i consumi sono contati per persona con un budget mensile. La guida passo passo è in [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md); il messaggio da mandare a chi prova l'app in [docs/BENVENUTO-TESTER.md](docs/BENVENUTO-TESTER.md).

**Su GitHub Pages, ognuno con la propria chiave.** Ogni push su `main` pubblica l'app tramite `.github/workflows/deploy.yml` su `https://<utente>.github.io/<nome-repo>/` (per questo repository: https://paolobets.github.io/Riccettario/). Se la pubblicazione non parte al primo push, in *Settings → Pages* del repository imposta la sorgente su "GitHub Actions" e rilancia il workflow.

In entrambi i casi: apri l'indirizzo sul telefono, poi "Aggiungi alla schermata Home" per averla come app, anche offline. Le ricette vivono nel browser del dispositivo; con il backend vengono anche sincronizzate sul server sotto la password, e su un dispositivo nuovo basta inserirla. Senza backend, per cambiare dispositivo si usa *Impostazioni → Esporta / Importa da file*.

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
  data/        Dexie (IndexedDB): schema, ricette di esempio, funzioni CRUD, export/import, sincronizzazione (sync.ts)
  app/         interfaccia React
    pages/     RecipeList, RecipeView (lettura + configuratore), CookMode, RecipeWizard, SuggestPage, ImportPage, Settings
    components/ScalerPanel, IngredientList, StepText, TimerButton, Layout
    hooks/     useScaler (fattore nell'URL, `?f=1.5`)
    timers/    store dei timer attivi, persistito in localStorage
  ai/          client Anthropic, schema di scambio (zod) e conversione in Recipe, import, domande, varianti, suggerimenti
functions/     backend su Cloudflare Pages (/api): proxy AI, utenti, budget, consumi, sincronizzazione; db.js parla con D1
proxy/         lo stesso proxy come worker a sé, per chi tiene l'app su un altro host
    branding.ts nome, descrizione e colori dell'app
docs/
  MODELLO-DATI.md  schema della ricetta e regole di scalatura
  ROADMAP.md       prossimi passi
```

Il motore di scalatura (`src/core/scaling.ts`) è deterministico e testato: l'interfaccia lo usa, non lo reimplementa. Vedi [docs/MODELLO-DATI.md](docs/MODELLO-DATI.md) per le regole.

## Assistente AI

Serve una chiave API Anthropic, da inserire in *Impostazioni → Assistente AI*. La chiave resta in IndexedDB sul dispositivo e viene inviata solo ad Anthropic. Ogni richiesta ha un costo sul tuo account: il modello predefinito è Claude Opus 5.5, si può scegliere Sonnet o Haiku per spendere meno.

Chi pubblica su Cloudflare Pages ha il backend incluso su `/api` (`functions/`) con database D1: utenti con password personale (creati dall'amministratore con `POST /admin/users`), budget mensile per persona e tetto giornaliero, una riga di consumo per ogni richiesta con la funzione che l'ha generata, sincronizzazione dell'archivio con `POST /sync` (ultima modifica vince, cancellazioni comprese), `/fetch` per leggere le pagine dei siti. Lo stesso codice si pubblica anche come worker a sé (`proxy/cloudflare-worker.js`). In Impostazioni l'app mostra "Il tuo mese" e lo stato della sincronizzazione; a budget esaurito l'assistente lo dice chiaramente e riparte il mese dopo.

Il codice dell'AI è in `src/ai/` e viene caricato solo quando serve, così il resto dell'app resta leggero e offline. Ogni risposta mostra il costo reale della richiesta (dai token riportati dall'API, cache compresa) e in *Impostazioni* c'è il totale speso. Le conversazioni restano salvate per ricetta e sono disponibili anche in modalità cucina, dove il bottone "Chiedi" passa all'AI il passaggio corrente.

Quattro accorgimenti tengono basso il conto senza togliere nulla:

- **Cache del prompt**: ricetta e diario stanno in un blocco di sistema con `cache_control`; dalla seconda domanda si pagano a un decimo (un ventesimo su Opus 5.5). In cucina la cache dura un'ora, perché tra una domanda e l'altra passano anche venti minuti.
- **Sforzo di ragionamento** esplicito per funzione: basso per domande e "Cosa preparo?", medio per import, piatto e varianti.
- **Haiku 5.5 per le domande in cucina** (opzione attiva per default in *Impostazioni*): risposte brevi, costo quaranta volte più basso del modello principale.
- **Import da sito senza lettura via AI**: l'app legge i dati strutturati schema.org/Recipe (JSON-LD) della pagina e passa all'AI solo il testo della ricetta, 1-2k token invece dei 10-30k di una pagina intera. Il browser non può scaricare pagine di altri siti, quindi serve il proxy (rotta `GET /fetch`); senza proxy, o se la pagina non espone i dati, l'AI legge la pagina con `web_fetch` come prima.

## Aspetto

Identità da quaderno di cucina: carattere Fraunces (serif variabile, incluso nel bundle, funziona offline) per titoli, quantità e passaggi in cucina; accento verde oliva; sezioni separate da filetti invece che da schede. Tema chiaro e scuro: automatico in base al dispositivo, oppure a scelta in *Impostazioni → Aspetto*. I colori sono token semantici in `src/index.css` (`--bg`, `--surface`, `--accent`…): i componenti usano solo classi come `bg-surface` o `text-muted`, quindi cambiare palette o aggiungere un tema significa toccare un solo file. Le icone sono SVG a tratto in `src/app/components/Icon.tsx`.

## Dati

Le ricette vivono in IndexedDB sul dispositivo. Da *Impostazioni* si esporta e importa un file JSON. Alla prima apertura vengono caricate tre ricette di esempio (impasto per pizza, carbonara, tiramisù) che mostrano le diverse regole di scalatura.
