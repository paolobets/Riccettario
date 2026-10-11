# Messaggio di benvenuto per chi prova l'app

Da copiare e adattare (indirizzo e link d'invito). Un invito per persona: l'account che ne nasce tiene separati ricette e conti.

---

Ciao! Ti va di provare il mio ricettario? È un'app per il telefono che ridimensiona le ricette (cambi le porzioni, o dici "ho solo 300 g di farina", e tutto si adatta), ti guida passo passo mentre cucini con i timer, e ha un assistente che importa ricette da foto, testo o siti e risponde alle domande ai fornelli.

**Per installarla**

1. Apri questo link sul telefono: https://ricettario.pages.dev/registrati?invito=inv_XXXXXXXX (è il tuo invito personale, vale due settimane).
2. Scrivi il tuo nome, controlla l'email e scegli una password: almeno 10 caratteri, va bene anche una frase che ricordi facilmente.
3. Poi aggiungi l'app alla schermata Home. Su iPhone: tasto Condividi → "Aggiungi alla schermata Home". Su Android: menu ⋮ → "Installa app" o "Aggiungi a schermata Home". Da lì si apre già collegata.

Le ricette sono tue: stanno sul telefono e in una copia sul server legata al tuo account, così se cambi telefono le ritrovi facendo l'accesso. L'assistente usa un budget mensile che pago io: in Impostazioni → Account vedi quanto ne hai usato. Se finisce, riparte il mese dopo. Se dimentichi la password, dimmelo: ti mando un link per cambiarla.

**Cosa mi interessa sapere**

- Dove ti sei bloccato o hai dovuto pensarci due volte.
- Se una ricetta importata da foto o da un sito è venuta sbagliata (dosi, passaggi, regole di scalatura): mandami l'originale.
- Se in cucina qualcosa ti ha dato fastidio: schermo, timer, dimensione dei testi, bottoni.
- Qualsiasi errore rosso: fai uno screenshot.

Non serve fare tutto subito: usala quando cucini davvero. Se vuoi una lista di cose da provare, è qui: https://github.com/paolobets/Riccettario/blob/main/docs/COME-TESTARE.md

Grazie!

---

## Promemoria per chi gestisce

- Invito nuovo: `curl -X POST -H "x-admin-token: …" -H "content-type: application/json" -d '{"email":"anna@esempio.it"}' https://ricettario.pages.dev/api/admin/invites`; il `link` nella risposta va nel messaggio. Senza email l'invito vale per chiunque lo apra.
- Consumi di tutti: `curl -H "x-admin-token: …" https://ricettario.pages.dev/api/admin/usage`.
- Budget predefinito 3 $ a persona al mese e 5 $ al giorno per tutti: con le riduzioni attive bastano per un uso normale; si alzano con `MONTHLY_BUDGET_USD` e `DAILY_BUDGET_USD`, o per persona con `"budgetUsd"` nell'invito.
- Password persa (senza email configurata): `curl -X POST -H "x-admin-token: …" …/api/admin/users/anna/reset-link` dà un link che vale un'ora. Per sospendere: `…/disable`.
- Chi non ha un'email (la nonna): `-d '{"name":"nonna"}' …/api/admin/users` crea un account con password generata; entra dalla pagina di accesso scrivendo `nonna` al posto dell'email.
