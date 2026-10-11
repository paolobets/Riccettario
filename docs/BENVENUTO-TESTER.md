# Messaggio di benvenuto per chi prova l'app

Da copiare e adattare (indirizzo, nome, password). Una password per persona: è anche quella che tiene i conti separati.

---

Ciao! Ti va di provare il mio ricettario? È un'app per il telefono che ridimensiona le ricette (cambi le porzioni, o dici "ho solo 300 g di farina", e tutto si adatta), ti guida passo passo mentre cucini con i timer, e ha un assistente che importa ricette da foto, testo o siti e risponde alle domande ai fornelli.

**Per installarla**

1. Apri questo indirizzo sul telefono: https://ricettario.pages.dev
2. Su iPhone: tasto Condividi → "Aggiungi alla schermata Home". Su Android: menu ⋮ → "Installa app" o "Aggiungi a schermata Home".
3. Apri l'app dall'icona, vai in **Impostazioni → Assistente AI** e incolla la tua password: `mela-bollito-ventaglio-72`. Salva.

Le ricette sono tue: stanno sul telefono e in una copia sul server legata alla tua password, così se cambi telefono le ritrovi inserendo la password. L'assistente usa un budget mensile che pago io: in Impostazioni vedi quanto ne hai usato. Se finisce, riparte il mese dopo.

**Cosa mi interessa sapere**

- Dove ti sei bloccato o hai dovuto pensarci due volte.
- Se una ricetta importata da foto o da un sito è venuta sbagliata (dosi, passaggi, regole di scalatura): mandami l'originale.
- Se in cucina qualcosa ti ha dato fastidio: schermo, timer, dimensione dei testi, bottoni.
- Qualsiasi errore rosso: fai uno screenshot.

Non serve fare tutto subito: usala quando cucini davvero. Se vuoi una lista di cose da provare, è qui: https://github.com/paolobets/Riccettario/blob/main/docs/COME-TESTARE.md

Grazie!

---

## Promemoria per chi gestisce

- Utente nuovo: `curl -X POST -H "x-admin-token: …" -H "content-type: application/json" -d '{"name":"anna"}' https://ricettario.pages.dev/api/admin/users`; la password è nella risposta, una volta sola.
- Consumi di tutti: `curl -H "x-admin-token: …" https://ricettario.pages.dev/api/admin/usage`.
- Budget predefinito 3 $ a persona al mese e 5 $ al giorno per tutti: con le riduzioni attive bastano per un uso normale; si alzano con `MONTHLY_BUDGET_USD` e `DAILY_BUDGET_USD`, o per persona con `"budgetUsd"` alla creazione.
- Password persa: `…/api/admin/users/anna/reset`. Per sospendere: `…/disable`.
