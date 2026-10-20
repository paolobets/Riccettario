# Roadmap

## Fatto (v0.1)

- Modello dati strutturato e motore di scalatura testato (lineare, sub-lineare, discreto, fisso, q.b., percentuali del panettiere, pivot, fattori fattibili, arrotondamento pratico).
- Lista ricette con ricerca e tag; vista lettura con configuratore (porzioni, resa, pivot).
- Modalità cucina: mise en place con checklist, un passo per schermata, quantità riscalate nel testo, timer con notifica e suono, schermo sempre acceso, frecce da tastiera, diario di fine cottura con voto e note.
- Wizard in quattro fasi (ricetta, ingredienti con regola di scalatura, passaggi con inserimento degli ingredienti al cursore, riepilogo con prova ×2).
- Varianti (duplica ricetta), export/import JSON, PWA offline.
- Timer multipli persistenti (barra sempre visibile, sopravvivono al ricaricamento, tocco per saltare al passaggio).
- Passaggi paralleli (`parallelWith`): "nel frattempo puoi" in modalità cucina, selezione nel wizard.
- Nome e colori dell'app in un unico file (`src/app/branding.ts`).
- Assistente in modalità cucina (domande sul passaggio corrente), costo reale per risposta e totale in impostazioni, conversazioni salvate per ricetta.
- Pubblicazione automatica su GitHub Pages a ogni push su main.
- Seconda revisione con la skill frontend-design: identità da quaderno di cucina (Fraunces, verde oliva, filetti), via i cliché crema/terracotta, maiuscoletto e puntini.
- Revisione dell'interfaccia: token semantici di colore con tema chiaro/scuro (automatico o manuale), icone vettoriali, tipografia e spaziature uniformi, stati di focus visibili, animazioni ridotte se richiesto dal sistema.
- Assistente AI: import da testo, foto e URL con output strutturato validato (zod) e revisione nel wizard; domande in streaming con contesto (ricetta, fattore, diario); varianti complete salvate accanto all'originale. Chiave sul dispositivo o proxy Cloudflare opzionale.
- Terza revisione UI/UX con le skill di progetto (`.claude/skills/`): wizard e foglio "Chiedi" senza sbordi, pagina "non trovata", passaggi in lettura nell'ordine vero con titoli di sezione, diario senza cotture abbandonate, passo corrente nell'URL (`?passo=`) e spunte in sessionStorage, salto a un passaggio, foglio domande come dialogo, etichette ed etichette aria ovunque, bersagli tattili da 32 px in su, contrasti a norma, icone al posto dei glifi di testo. Poi: dialogo di conferma dell'app al posto di `confirm()`, note della ricetta modificabili in pagina, passaggio in cucina più grande con quantità in colore, elenchi ingredienti a griglia. Rilievi e stato in `docs/ANALISI-UI-UX.md`.
- "Cosa preparo?" (`/cosa-preparo`): pasto, tempo ai fornelli, cosa c'è in casa; classifica le ricette del ricettario (`src/core/suggest.ts`, testato) premiando gli ingredienti in dispensa e penalizzando le cotture recenti; "Un'altra" scorre; con l'AI configurata, seconda opinione che sceglie tra le proprie ricette o propone un piatto nuovo.
- "Trovami la ricetta": in Importa la sorgente "Piatto" fa scrivere all'AI la ricetta di un piatto per nome, con la stessa struttura e revisione nel wizard delle altre sorgenti; raggiungibile anche da "Cosa preparo?" con `?piatto=`.
- Backend su Cloudflare Pages con D1: utenti con password personale creati dall'amministratore, budget per persona e tetto giornaliero, una riga di consumo per richiesta con la funzione, sincronizzazione dell'archivio tra dispositivi (ultima modifica vince, lapidi per le cancellazioni, cursori separati per invio e ricezione), rotte admin; guida in `docs/CLOUDFLARE.md`, messaggio per i tester in `docs/BENVENUTO-TESTER.md`.
- Accesso solido per l'uso pubblico: registrazione con email e password su invito (`/registrati?invito=`), accesso, sessioni per dispositivo con elenco e revoca in Impostazioni, cambio password, reset via email (Resend) o link dell'amministratore, blocco dopo cinque tentativi, ruolo amministratore via sessione; il token di sessione prende il posto della password nell'app, il resto non cambia. Variabile `OPEN_SIGNUP` per aprire la registrazione a tutti. Provato in Node (68 controlli) e nel browser su due dispositivi.
- Lista della spesa (`/spesa`): più ricette con le loro porzioni, ingredienti sommati per nome e unità (`src/core/shopping.ts`, testato), spunte, copia come testo; "Aggiungi alla spesa" dalla ricetta con il fattore corrente. Vive sul dispositivo.
- Pronto per le 20:00: nella mise en place si sceglie l'ora del pasto e l'app calcola a ritroso quando iniziare, con gli orari di ogni passaggio (i paralleli non allungano) e una notifica all'ora di avvio finché l'app è aperta (`src/core/schedule.ts`, testato).
- Riprendi la cottura: inizio, passo corrente e spunte in `localStorage` (scadono dopo un giorno); dalla ricetta "Riprendi dal passo 4" oppure "Ricomincia"; "Esci" non perde più il punto.
- Scalatura per teglia: `Recipe.pan` (tonda o rettangolare) nel wizard; nel pannello Dosi la riga "Teglia" ricava il fattore dal rapporto tra le aree (`src/core/pan.ts`, testato).
- Diario in lista: "Cucinata 3 volte, l'ultima il 3 ottobre"; ordinamento per più recenti, dalla A alla Z, più cucinate (ricordato sul dispositivo).
- Controllo della ricetta nel riepilogo del wizard (`src/core/lint.ts`, testato): uova lineari, passaggi lunghi senza timer, riposi senza nulla in parallelo, ingredienti mai citati, passaggi vuoti o paralleli a nulla, base del panettiere mancante. Consigli, non blocchi.
- Preferiti: stella nella ricetta, filtro "preferite" in lista. I tag fanno da raccolte.
- Stampa e condivisione: foglio di stile di stampa (solo la ricetta, senza comandi), "Condividi" manda testo con le dosi riscalate e un link che contiene la ricetta (`/condivisa#r=…`): chi lo apre la vede e la salva come copia propria, anche senza account.
- Ricette composte: un ingrediente può essere un'altra ricetta (a peso sulla resa, o a dosi), `src/core/compose.ts` testato; sezione "Basi" nella ricetta con "Spiana le basi", "Basi da preparare" in cucina, spesa ed etichetta che aprono le basi, "Aggiungi una base" nel wizard senza giri, cancellazione che stacca. "Componi da basi" (`/componi`) e "Scomponi" (`/ricetta/:id/scomponi`, per sezione o a mano). L'assistente e le varianti vedono le basi.
- Etichetta da stampare (`/ricetta/:id/etichetta`): ingredienti in ordine di peso con le basi tra parentesi, 14 allergeni riconosciuti dai nomi e confermabili, "Contiene" e "Può contenere tracce", peso netto, data di produzione e scadenza, conservazione, produttore, logo (sul dispositivo), formati 70×50, 100×70, A6 o foglio A4 con più copie; PDF dalla stampa del browser.
- Accesso obbligatorio quando c'è il backend: ogni pagina (tranne accesso, registrazione, reset e link condiviso) richiede l'account, il menu compare solo da collegati, l'uscita sincronizza e toglie i dati dal dispositivo. Pagina **Amministrazione** nell'app (`/amministrazione`): inviti con invio dal foglio di condivisione, persone con consumi, sospensione, ruolo, link per nuova password; funziona con un account admin o con la password amministratore salvata sul dispositivo. Build su Cloudflare che attiva da sola il backend integrato; `worker.js` e `wrangler.jsonc` per Workers con risorse statiche; workflow GitHub "Controllo deploy" che interroga gli indirizzi pubblicati.
- Riduzione dei costi AI: cache del prompt sul contesto delle conversazioni (1 h in cucina), sforzo di ragionamento per funzione (basso per domande e suggerimenti, medio per import e varianti), Haiku 5.5 per le domande in cucina (opzione), import da sito tramite JSON-LD con rotta `GET /fetch` nel proxy e lettura via AI solo come ripiego; prezzi di cache nel conteggio dei costi.

## Prossimi passi

Le otto funzionalità concordate il 10 ottobre 2026 sono fatte (vedi sopra). Restano, in ordine di utilità:

### 1. Foto del risultato
A fine cottura una foto che resta nel diario e in lista. Serve uno spazio per i file (R2 su Cloudflare) e la sincronizzazione delle immagini: sforzo medio.

### 2. Chat sul ricettario
Una conversazione libera che vede l'indice delle ricette e apre quelle pertinenti: "una crostata con le mie basi", "ho lievito madre in eccesso"; con "Trasformala in ricetta" che porta nel wizard. Si appoggia su ricette composte e import strutturato. Sforzo medio.

### 3. Raccolte
Oltre ai tag, raccolte con un ordine proprio ("Natale", "Settimana prossima") e una pagina per ciascuna. Sforzo piccolo, dati nuovi da sincronizzare.

### 4. Lista della spesa sincronizzata
Oggi la lista vive sul dispositivo: portarla sul server come quarta tabella, così la si prepara al computer e la si legge al supermercato dal telefono. Sforzo piccolo (stessa logica di `sync`).

### 5. Notifiche anche ad app chiusa
"Pronto per le 20:00" avvisa finché l'app è aperta. Con le notifiche push del service worker avviserebbe anche da chiusa: serve una chiave VAPID e una rotta sul server. Sforzo medio.

### Già in programma
- Conversione unità (tazze ↔ grammi per ingredienti noti).
- Vista "percentuali del panettiere" per i lievitati.
- Comandi vocali in modalità cucina e per le domande.
- Verifica dal vivo dell'import da URL con `web_fetch` lato server.
- Apertura al pubblico: la registrazione con email c'è già (`OPEN_SIGNUP=true` la apre a tutti); restano informativa privacy e termini, dominio proprio, email di reset con Resend, foto su R2. Si parte quando i test con la cerchia ristretta sono andati bene.
- OpenRouter per usare altri modelli (valutato il 20 ottobre 2026): fattibile con un traduttore nel backend dal formato Anthropic a "chat completions" (testo, immagini, schema JSON, streaming) e un instradamento dal nome del modello; cambierebbero import da sito (niente `web_fetch`, solo JSON-LD), affidabilità dell'output strutturato sui modelli piccoli, cache e sforzo ignorati fuori da Claude. Rimandato perché Haiku 5.5 costa già meno di DeepSeek e Gemini Flash; torna utile se servirà un piano gratuito con modelli gratuiti.
- Modello proprio invece dell'API (valutato l'11 ottobre 2026): per uso personale non conviene, l'API a consumo costa pochi euro l'anno. Se l'app dovesse servire più persone o la privacy diventasse un requisito: server in casa con Ollama e Cloudflare Tunnel, oppure GPU serverless, in entrambi i casi dietro LiteLLM in modalità compatibile Anthropic così l'app non cambia; modelli da 27-32B per l'import strutturato, 8B bastano per domande e suggerimenti.
- Profili utente (free, base, premium) con la chiave dietro il proxy: richiede utenti (accesso con email) e il worker come punto di misura, che somma il costo reale dei token per utente e per mese e blocca oltre il budget del piano. Prima di tutto misurare un mese di uso vero, poi tarare. Bozza: Free = tutta l'app senza AI più 10 domande e 3 import al mese con Haiku; Base = domande illimitate con Sonnet, 20 import da testo, 5 foto, 5 tra varianti e piatti, "Cosa preparo" con AI; Premium = tutto incluso con Opus, foto e sito, 150 import. Costo API stimato per utente attivo: Free sotto 5 centesimi, Base 50-80 centesimi, Premium 2-4 euro al mese.
- Test end-to-end con Playwright (gli script usati per la revisione UI sono una base).
- Icone PWA raster per iOS.
