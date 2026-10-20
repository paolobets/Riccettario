# Pubblicare su Cloudflare

L'app e il suo backend girano insieme su Cloudflare, nel piano gratuito: l'app come sito statico, il backend su `/api` con un database D1. Ogni persona entra con email e password (su invito, finché l'app non è aperta a tutti), ha un budget mensile e il proprio archivio sincronizzato tra i dispositivi; la chiave Anthropic sta solo nei segreti del progetto.

Cloudflare offre due vie, con lo stesso codice: **Workers con risorse statiche** (quella che il cruscotto propone oggi; i file sono `worker.js` e `wrangler.jsonc`) e **Pages** (la via storica, `functions/api/[[path]].js`; su molti account nuovi la scheda Pages non compare più). La prima parte di questa guida segue i Workers; la via Pages è in fondo.

Tempo richiesto: venti minuti la prima volta. Serve un account Cloudflare (gratuito) e l'accesso al repository GitHub.

## Via Workers (consigliata)

### 1. Database D1

Menu a sinistra → **Archiviazione e database** → **D1 SQL Database** → **Crea database**, nome `ricettario`. Nella pagina del database copia l'**ID database** e scrivilo in `wrangler.jsonc` alla voce `database_id` (nel repository ora c'è quello del database di Paolo: chi fa una propria installazione lo sostituisce). Le tabelle si creano da sole alla prima richiesta.

### 2. Applicazione collegata a GitHub

1. **Workers e Pages** → **Crea applicazione** → **Importa un repository** → GitHub → `Riccettario`.
2. Nome progetto `ricettario` (o quello che vuoi: diventa `nome.<tuo-sottodominio>.workers.dev`), comando di generazione `pnpm run build`, comando Distribuisci `npx wrangler deploy`, anteprima com'è.
3. **Distribuisci**. Il build dura due o tre minuti. Il binding del database e i budget arrivano da `wrangler.jsonc`: nel log finale compare `env.DB (ricettario) D1 Database`.

### 3. Indirizzo

Nel Worker, scheda **Domini**: se l'indirizzo `workers.dev` è spento, abilitalo. Per un dominio tuo già su Cloudflare, **Aggiungi → Dominio personalizzato**, per esempio `ricettario.tuodominio.it` (meglio un sottodominio della radice): DNS e certificato li crea da solo. Se sul dominio c'è una policy di Cloudflare Access, escludi il sottodominio dell'app.

### 4. Segreti e variabile di build

Scheda **Impostazioni**, due blocchi diversi:

- **Variabili e segreti** (per il backend), tipo **Segreto**: `ANTHROPIC_API_KEY` (la chiave `sk-ant-…`) e `ADMIN_TOKEN` (una password lunga solo tua, per i comandi da terminale). Facoltativi: `OPEN_SIGNUP`, `RESEND_API_KEY`, `MAIL_FROM`, `APP_ORIGIN` (vedi la tabella più sotto). `MONTHLY_BUDGET_USD` e `DAILY_BUDGET_USD` sono già nel file.
- **Build → Variabili e segreti di build**: `VITE_DEFAULT_PROXY` = `/api`. Dice all'app compilata che il backend sta sullo stesso indirizzo. Dopo averla aggiunta serve una nuova build: **Distribuzioni → Riprova**, o un push.

I segreti del backend si possono aggiungere anche dopo, senza rifare la build. Senza `ANTHROPIC_API_KEY` tutto funziona tranne l'assistente.

### 5. Verifica, registrazione e inviti

Dal terminale, con il tuo indirizzo al posto di `ricettario.pages.dev`, segui il passo 5 della via Pages qui sotto: `/api/health`, l'invito per te (il primo account diventa amministratore), poi gli inviti per gli altri. I comandi sono identici.

## Via Pages

### 1. Crea il progetto Pages collegato al repository

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

### 2. Crea il database D1 e collegalo

1. Menu a sinistra → **Storage & Databases** → **D1 SQL Database** → **Create**. Nome: `ricettario`. Crea. Non serve eseguire nulla: le tabelle si creano da sole alla prima richiesta (lo schema, per chi vuole leggerlo, è in `functions/schema.sql`).
2. Torna su **Workers & Pages** → progetto `ricettario` → **Settings** → **Bindings** → **Add** → **D1 database**.
   - **Variable name**: `DB` (esattamente così, maiuscolo)
   - **D1 database**: `ricettario`
3. Salva. Ripeti il binding anche per l'ambiente *Preview* se viene chiesto separatamente.

Il database tiene account e password (con hash lento), sessioni per dispositivo, inviti, l'archivio sincronizzato di ogni persona (ricette, diario, conversazioni) e una riga per ogni richiesta all'AI con il suo costo. Senza questo passo l'app funziona ma senza accessi, sincronizzazione, budget e conteggio.

### 3. Inserisci i segreti

Sempre in **Settings** del progetto → **Variables and Secrets** → **Add**, tipo **Secret**, ambiente *Production* (e *Preview* se vuoi provare l'AI anche sulle anteprime):

| Nome | Valore |
|---|---|
| `ANTHROPIC_API_KEY` | la chiave da https://console.anthropic.com, `sk-ant-…` |
| `ADMIN_TOKEN` | una password lunga solo tua, per i comandi da terminale (inviti, consumi, utenti) |

Facoltativi, come variabili normali (non segreti):

| Nome | Valore | Default |
|---|---|---|
| `MONTHLY_BUDGET_USD` | budget per persona al mese, in dollari, per chi non ne ha uno proprio | `3` |
| `DAILY_BUDGET_USD` | tetto giornaliero per tutti insieme | `5` |
| `OPEN_SIGNUP` | `true` per far registrare chiunque senza invito (quando l'app sarà aperta al pubblico) | non impostata: serve un invito |
| `MAIL_FROM` | mittente delle email di reset, es. `Ricettario <noreply@tuodominio.it>`; serve insieme a `RESEND_API_KEY` | nessuna email |

Per il reset della password via email serve un account su https://resend.com (gratuito fino a 3 000 email al mese) con un dominio verificato: la chiave va nel segreto `RESEND_API_KEY`. Senza, "Password dimenticata" nell'app spiega di chiedere un link a chi gestisce; il link lo generi tu (passo 5).

Gli utenti **non** si mettono nei segreti: si invitano con un comando (passo 5), senza rifare il deploy. (Il segreto `USERS` con un JSON nome→password resta accettato per compatibilità: quelle persone entrano dalla pagina di accesso con nome e password.)

### 4. Rifai il deploy

Segreti e binding valgono solo per i deploy successivi: **Deployments** → sui tre puntini dell'ultimo deploy → **Retry deployment**. Da qui in poi ogni push su `main` pubblica da solo.

### 5. Registrati, invita e verifica

Dal terminale del computer. Prima lo stato:

```bash
curl https://ricettario.pages.dev/api/health
```

Deve rispondere `{"ok":true,"database":true,"key":true,"admin":true,"signup":"invite","mail":false,...}`: `database` dice che D1 è collegato, `key` che la chiave c'è, `admin` che la password amministratore è impostata, `signup` che si entra su invito, `mail` se le email di reset sono configurate.

Poi un invito per te stesso. **Il primo account che si registra diventa amministratore**: registrati tu prima di invitare gli altri.

```bash
curl -X POST -H "x-admin-token: LA_TUA_PASSWORD_ADMIN" -H "content-type: application/json" \
  -d '{"email":"tu@esempio.it"}' https://ricettario.pages.dev/api/admin/invites
```

Risposta: `{"code":"inv_…","link":"https://ricettario.pages.dev/registrati?invito=inv_…","days":14,…}`. Apri il link sul telefono, scegli una password (almeno 10 caratteri, va bene una frase) e sei dentro. Un invito vale una registrazione e scade dopo 14 giorni (`"days": 30` per cambiare). Senza `"email"` l'invito vale per chiunque lo apra; con, solo per quell'indirizzo. Si può aggiungere `"budgetUsd": 5` per un budget diverso dal predefinito e `"plan": "…"` per il piano.

Per ogni persona da invitare, lo stesso comando con la sua email: le mandi il link (il modello del messaggio è in `docs/BENVENUTO-TESTER.md`). Da amministratore puoi farlo anche dall'app, con la tua sessione al posto del token: stesse rotte, header `x-api-key` con il token che l'app conserva, ma il terminale resta la via più comoda.

Altri comandi dell'amministratore:

```bash
# consumi del mese per persona e totale di oggi (aggiungi ?month=2026-09 per un mese passato)
curl -H "x-admin-token: …" https://ricettario.pages.dev/api/admin/usage
# elenco utenti (nome, email, ruolo, piano, budget, ultimo accesso) e inviti emessi
curl -H "x-admin-token: …" https://ricettario.pages.dev/api/admin/users
curl -H "x-admin-token: …" https://ricettario.pages.dev/api/admin/invites
# password dimenticata senza email configurata: link di reset da mandare alla persona, vale un'ora
curl -X POST -H "x-admin-token: …" https://ricettario.pages.dev/api/admin/users/anna/reset-link
# sospensione (chiude anche le sessioni aperte), riattivazione, ruolo
curl -X POST -H "x-admin-token: …" https://ricettario.pages.dev/api/admin/users/anna/disable
curl -X POST -H "x-admin-token: …" https://ricettario.pages.dev/api/admin/users/anna/enable
curl -X POST -H "x-admin-token: …" -H "content-type: application/json" -d '{"role":"admin"}' https://ricettario.pages.dev/api/admin/users/anna/role
# tester senza email: utente con password generata dal server (entra dalla pagina di accesso con nome e password)
curl -X POST -H "x-admin-token: …" -H "content-type: application/json" -d '{"name":"nonna"}' https://ricettario.pages.dev/api/admin/users
curl -X POST -H "x-admin-token: …" https://ricettario.pages.dev/api/admin/users/nonna/reset
```

Il nome che compare negli elenchi (`anna`, `marta-rossi`) è ricavato dal nome o dall'email alla registrazione.

Nell'app, dopo l'accesso: *Impostazioni → Account* mostra con chi sei collegato, "Il tuo mese: 0,00 $ su 3,00 $", i **dispositivi collegati** (ognuno si può scollegare), "Cambia password" ed "Esci"; la sezione **Sincronizzazione** mostra "Ultima sincronizzazione" e il numero di ricette sul server. Fai una domanda a una ricetta e ricontrolla: il costo è aggiornato.

Cosa fa il server per la sicurezza: hash lento delle password (PBKDF2, 100 000 iterazioni), token di sessione casuali conservati solo come hash e validi 90 giorni dall'ultimo uso, blocco di un quarto d'ora dopo cinque tentativi sbagliati (per account e per indirizzo IP), reset monouso che chiude le altre sessioni, cambio password che scollega gli altri dispositivi.

### 6. Porta le tue ricette dal vecchio indirizzo

Sul telefono, apri la vecchia app su GitHub Pages, *Impostazioni → Esporta tutto*, salva il file; apri la nuova su `pages.dev`, accedi, poi *Impostazioni → Importa da file*. Da quel momento le ricette sono sul server: su qualsiasi altro dispositivo basta installare l'app e accedere con lo stesso account. Poi "Aggiungi alla schermata Home" dal nuovo indirizzo e togli la vecchia icona.

## Dopo

- **Dominio tuo** (facoltativo): progetto → **Custom domains** → aggiungi il dominio; se è già su Cloudflare basta un clic, altrimenti un record CNAME.
- **Anteprime**: ogni branch diverso da `main` ha un indirizzo proprio tipo `nome-branch.ricettario.pages.dev`, utile per far provare una modifica a una persona sola.
- **GitHub Pages** può restare acceso come specchio o essere spento da *Settings → Pages* del repository. Il workflow `.github/workflows/deploy.yml` non dà fastidio.
- **Cambiare budget**: modifica `MONTHLY_BUDGET_USD` e rifai il deploy. Il conteggio riparte da solo il primo di ogni mese.
- **Il worker a sé** (`proxy/cloudflare-worker.js`) resta per chi usa l'app da un altro host (per esempio GitHub Pages): stesso codice, stesse variabili; per D1 serve il binding `DB` nella sua configurazione wrangler.
- **Verso il pubblico**: quando i test saranno andati bene, basta impostare `OPEN_SIGNUP` = `true` (e configurare le email di reset): la registrazione si apre a tutti con piano `free`, senza altre modifiche. Prima conviene un'informativa privacy e un dominio proprio.
