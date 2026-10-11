# Pubblicare su Cloudflare Pages

L'app e il suo backend girano insieme su Cloudflare Pages, nel piano gratuito: l'app come sito statico, il backend come funzione su `/api` (`functions/api/[[path]].js`) con un database D1. Ogni persona ha una password personale, un budget mensile e il proprio archivio sincronizzato tra i dispositivi; la chiave Anthropic sta solo nei segreti del progetto.

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

## 2. Crea il database D1 e collegalo

1. Menu a sinistra → **Storage & Databases** → **D1 SQL Database** → **Create**. Nome: `ricettario`. Crea. Non serve eseguire nulla: le tabelle si creano da sole alla prima richiesta (lo schema, per chi vuole leggerlo, è in `functions/schema.sql`).
2. Torna su **Workers & Pages** → progetto `ricettario` → **Settings** → **Bindings** → **Add** → **D1 database**.
   - **Variable name**: `DB` (esattamente così, maiuscolo)
   - **D1 database**: `ricettario`
3. Salva. Ripeti il binding anche per l'ambiente *Preview* se viene chiesto separatamente.

Il database tiene utenti e password (con hash), l'archivio sincronizzato di ogni persona (ricette, diario, conversazioni) e una riga per ogni richiesta all'AI con il suo costo. Senza questo passo l'app funziona ma senza sincronizzazione, budget e conteggio.

## 3. Inserisci i segreti

Sempre in **Settings** del progetto → **Variables and Secrets** → **Add**, tipo **Secret**, ambiente *Production* (e *Preview* se vuoi provare l'AI anche sulle anteprime):

| Nome | Valore |
|---|---|
| `ANTHROPIC_API_KEY` | la chiave da https://console.anthropic.com, `sk-ant-…` |
| `ADMIN_TOKEN` | una password lunga solo tua, per creare utenti e leggere i consumi |

Facoltativi, come variabili normali (non segreti):

| Nome | Valore | Default |
|---|---|---|
| `MONTHLY_BUDGET_USD` | budget per persona al mese, in dollari, per chi non ne ha uno proprio | `3` |
| `DAILY_BUDGET_USD` | tetto giornaliero per tutti insieme | `5` |

Gli utenti **non** si mettono nei segreti: si creano con un comando (passo 5), senza rifare il deploy. (Il segreto `USERS` con un JSON nome→password resta accettato per compatibilità: quegli utenti vengono creati nel database alla prima richiesta.)

## 4. Rifai il deploy

Segreti e binding valgono solo per i deploy successivi: **Deployments** → sui tre puntini dell'ultimo deploy → **Retry deployment**. Da qui in poi ogni push su `main` pubblica da solo.

## 5. Crea gli utenti e verifica

Dal terminale del computer. Prima lo stato:

```bash
curl https://ricettario.pages.dev/api/health
```

Deve rispondere `{"ok":true,"database":true,"key":true,"admin":true,...}`: `database` dice che D1 è collegato, `key` che la chiave c'è, `admin` che la password amministratore è impostata.

Poi un utente per persona (il nome: minuscolo, senza spazi). La password la genera il server e la mostra una volta sola: copiala subito.

```bash
curl -X POST -H "x-admin-token: LA_TUA_PASSWORD_ADMIN" -H "content-type: application/json" \
  -d '{"name":"paolo"}' https://ricettario.pages.dev/api/admin/users
```

Risposta: `{"id":"u_…","name":"paolo","plan":"tester","password":"farro-nuvola-brocca-timo-41",…}`. Si può passare anche `"budgetUsd": 5` per un budget diverso dal predefinito, o `"password": "…"` per sceglierla.

Altri comandi dell'amministratore:

```bash
# consumi del mese per persona e totale di oggi (aggiungi ?month=2026-09 per un mese passato)
curl -H "x-admin-token: …" https://ricettario.pages.dev/api/admin/usage
# elenco utenti
curl -H "x-admin-token: …" https://ricettario.pages.dev/api/admin/users
# nuova password, sospensione, riattivazione
curl -X POST -H "x-admin-token: …" https://ricettario.pages.dev/api/admin/users/paolo/reset
curl -X POST -H "x-admin-token: …" https://ricettario.pages.dev/api/admin/users/paolo/disable
curl -X POST -H "x-admin-token: …" https://ricettario.pages.dev/api/admin/users/paolo/enable
```

Verifica come utente:

```bash
curl -H "x-api-key: farro-nuvola-brocca-timo-41" https://ricettario.pages.dev/api/me
```

Risponde con utente, piano, mese, budget, consumo (zero all'inizio) e quante righe ha sul server.

Poi nell'app: *Impostazioni → Assistente AI*, inserisci la tua password e salva. Compaiono "Il tuo mese: 0,00 $ su 3,00 $" e la sezione **Sincronizzazione** con "Ultima sincronizzazione" e il numero di ricette sul server. Fai una domanda a una ricetta e ricontrolla: il costo è aggiornato.

## 6. Porta le tue ricette dal vecchio indirizzo

Sul telefono, apri la vecchia app su GitHub Pages, *Impostazioni → Esporta tutto*, salva il file; apri la nuova su `pages.dev`, inserisci la password, poi *Impostazioni → Importa da file*. Da quel momento le ricette sono sul server: su qualsiasi altro dispositivo basta installare l'app e inserire la stessa password. Poi "Aggiungi alla schermata Home" dal nuovo indirizzo e togli la vecchia icona.

## Dopo

- **Dominio tuo** (facoltativo): progetto → **Custom domains** → aggiungi il dominio; se è già su Cloudflare basta un clic, altrimenti un record CNAME.
- **Anteprime**: ogni branch diverso da `main` ha un indirizzo proprio tipo `nome-branch.ricettario.pages.dev`, utile per far provare una modifica a una persona sola.
- **GitHub Pages** può restare acceso come specchio o essere spento da *Settings → Pages* del repository. Il workflow `.github/workflows/deploy.yml` non dà fastidio.
- **Cambiare budget**: modifica `MONTHLY_BUDGET_USD` e rifai il deploy. Il conteggio riparte da solo il primo di ogni mese.
- **Il worker a sé** (`proxy/cloudflare-worker.js`) resta per chi usa l'app da un altro host: stesso codice, stesse variabili; per D1 serve il binding `DB` nel suo `wrangler.toml`.
- **Verso il pubblico**: quando l'app uscirà dalla cerchia dei tester, la creazione degli utenti via amministratore si sostituirà con una registrazione con email; tabelle e sincronizzazione restano le stesse.
