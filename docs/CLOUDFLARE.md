# Pubblicare su Cloudflare Pages

L'app e il suo proxy per l'AI girano insieme su Cloudflare Pages, nel piano gratuito: l'app come sito statico, il proxy come funzione su `/api` (`functions/api/[[path]].js`). Ogni persona ha una password personale e un budget mensile; la chiave Anthropic sta solo nei segreti del progetto.

Tempo richiesto: venti minuti la prima volta. Serve un account Cloudflare (gratuito) e l'accesso al repository GitHub.

## 1. Crea il progetto Pages collegato al repository

1. Entra su https://dash.cloudflare.com e, nel menu a sinistra, apri **Workers & Pages**.
2. **Create** → scheda **Pages** → **Connect to Git**.
3. Autorizza Cloudflare su GitHub e scegli il repository `Riccettario`.
4. Impostazioni di build:
   - **Project name**: `ricettario` (diventa l'indirizzo `ricettario.pages.dev`; se è già preso, un altro nome).
   - **Production branch**: `main`.
   - **Framework preset**: `Vite` (o nessuno).
   - **Build command**: `pnpm build`
   - **Build output directory**: `dist`
5. Apri **Environment variables (advanced)** e aggiungi, per *Production* e *Preview*:
   - `VITE_DEFAULT_PROXY` = `/api` (dice all'app di usare il proxy integrato)
   - `NODE_VERSION` = `22`
6. **Save and Deploy**. Il primo build dura un paio di minuti. A fine build l'app è su `https://ricettario.pages.dev`, ma l'AI non funziona ancora: mancano segreti e misura (passi 2 e 3).

## 2. Crea lo spazio KV per i consumi e collegalo

1. Menu a sinistra → **Storage & Databases** → **KV** → **Create**. Nome: `ricettario-usage`. Crea.
2. Torna su **Workers & Pages** → progetto `ricettario` → **Settings** → **Bindings** → **Add** → **KV namespace**.
   - **Variable name**: `USAGE` (esattamente così, maiuscolo)
   - **KV namespace**: `ricettario-usage`
3. Salva. Ripeti il binding anche per l'ambiente *Preview* se viene chiesto separatamente.

Senza questo passo tutto funziona lo stesso, ma senza budget né conteggio per persona.

## 3. Inserisci i segreti

Sempre in **Settings** del progetto → **Variables and Secrets** → **Add**, tipo **Secret**, ambiente *Production* (e *Preview* se vuoi provare l'AI anche sulle anteprime):

| Nome | Valore |
|---|---|
| `ANTHROPIC_API_KEY` | la chiave da https://console.anthropic.com, `sk-ant-…` |
| `USERS` | una riga JSON con nome e password per ogni persona, vedi sotto |
| `ADMIN_TOKEN` | una password lunga solo tua, per leggere i consumi di tutti |

Facoltativi, come variabili normali (non segreti):

| Nome | Valore | Default |
|---|---|---|
| `MONTHLY_BUDGET_USD` | budget per persona al mese, in dollari | `3` |
| `DAILY_BUDGET_USD` | tetto giornaliero per tutti insieme | `5` |

Formato di `USERS`, tutto su una riga, con password lunghe e diverse (vanno bene tre o quattro parole a caso):

```json
{"paolo":"mela-bollito-ventaglio-72","anna":"cipolla-remo-nuvola-18","luca":"farro-sabbia-tromba-45"}
```

Per aggiungere o togliere una persona si modifica questo segreto e si rifà il deploy (passo 4). Chi perde la password ne riceve una nuova allo stesso modo.

## 4. Rifai il deploy

Segreti e binding valgono solo per i deploy successivi: **Deployments** → sui tre puntini dell'ultimo deploy → **Retry deployment**. Da qui in poi ogni push su `main` pubblica da solo.

## 5. Verifica

Dal terminale del computer (sostituisci indirizzo e password):

```bash
curl https://ricettario.pages.dev/api/health
```

Deve rispondere `{"ok":true,"users":3,"metering":true,"key":true}`: `users` è il numero di password in `USERS`, `metering` dice che il KV è collegato, `key` che la chiave c'è.

```bash
curl -H "x-api-key: mela-bollito-ventaglio-72" https://ricettario.pages.dev/api/me
```

Risponde con utente, mese, budget e consumo (zero all'inizio).

```bash
curl -H "x-admin-token: LA_TUA_PASSWORD_ADMIN" https://ricettario.pages.dev/api/admin/usage
```

Elenca i consumi del mese di tutti, dal più alto. Aggiungi `?month=2026-09` per un mese passato.

Poi nell'app: *Impostazioni → Assistente AI*, inserisci la tua password e salva. Sotto il bottone compare "Il tuo mese: 0,00 $ su 3,00 $". Fai una domanda a una ricetta e ricontrolla: il costo è aggiornato.

## 6. Porta le tue ricette dal vecchio indirizzo

Le ricette vivono nel browser e sono legate all'indirizzo. Sul telefono, apri la vecchia app su GitHub Pages, *Impostazioni → Esporta tutto*, salva il file; apri la nuova su `pages.dev`, *Impostazioni → Importa da file*. Una volta sola. Poi "Aggiungi alla schermata Home" dal nuovo indirizzo e togli la vecchia icona.

## Dopo

- **Dominio tuo** (facoltativo): progetto → **Custom domains** → aggiungi il dominio; se è già su Cloudflare basta un clic, altrimenti un record CNAME.
- **Anteprime**: ogni branch diverso da `main` ha un indirizzo proprio tipo `nome-branch.ricettario.pages.dev`, utile per far provare una modifica a una persona sola.
- **GitHub Pages** può restare acceso come specchio o essere spento da *Settings → Pages* del repository. Il workflow `.github/workflows/deploy.yml` non dà fastidio.
- **Cambiare budget**: modifica `MONTHLY_BUDGET_USD` e rifai il deploy. Il conteggio riparte da solo il primo di ogni mese.
- **Il worker a sé** (`proxy/cloudflare-worker.js`) resta per chi usa l'app da un altro host: stesso codice, stesse variabili.
