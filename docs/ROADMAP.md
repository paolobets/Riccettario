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
- Riduzione dei costi AI: cache del prompt sul contesto delle conversazioni (1 h in cucina), sforzo di ragionamento per funzione (basso per domande e suggerimenti, medio per import e varianti), Haiku 5.5 per le domande in cucina (opzione), import da sito tramite JSON-LD con rotta `GET /fetch` nel proxy e lettura via AI solo come ripiego; prezzi di cache nel conteggio dei costi.

## Prossimi passi

Funzionalità concordate il 10 ottobre 2026, in ordine di priorità. Ogni voce dice su cosa si appoggia, così lo sforzo resta stimabile.

### 1. Lista della spesa
Scegli più ricette con le loro porzioni; l'app somma gli ingredienti già riscalati (stessa unità base, stesso nome), li raggruppa per sezione o reparto, permette di spuntarli e di copiarli come testo. Si appoggia a `scaleRecipe` e `toBase`; nuova tabella `lists` in Dexie con le spunte. Sforzo medio.

### 2. Pronto per le 20:00
Dato l'orario del pasto, la modalità cucina calcola a ritroso quando iniziare ogni passaggio usando durate, timer e passaggi paralleli, mostra la timeline e manda una notifica a ogni orario di avvio. Si appoggia a `totalDuration`, `parallelWith` e allo store dei timer. Sforzo medio.

### 3. Scalatura per teglia o stampo
La resa può essere un diametro o una misura di teglia: cambiando la teglia il fattore è il rapporto tra le aree. Si innesta sul pivot della resa totale. Sforzo piccolo.

### 4. Riprendi la cottura
Se una cottura è rimasta aperta (passo in sessionStorage), il bottone della ricetta diventa "Riprendi dal passo 4". Sforzo piccolo.

### 5. Diario più ricco
"Cucinata 5 volte, ultima il 3 ottobre" in lista, ordinamento per frequenza, foto del risultato a fine cottura. Sforzo piccolo per i contatori, medio per le foto.

### 6. Controllo della ricetta
Avvisi nel riepilogo del wizard: passaggi lunghi senza timer, riposi senza passaggi paralleli, uova senza regola a pezzi interi, ingredienti mai citati (già c'è). Sforzo piccolo.

### 7. Preferiti, ordinamento, raccolte
Stella sulle ricette, ordine alfabetico o per frequenza, raccolte ("Natale", "Settimana"). Sforzo piccolo.

### 8. Stampa e condivisione
Vista di stampa pulita; condivisione come testo o come link che contiene la ricetta. Sforzo piccolo.

### Già in programma
- Conversione unità (tazze ↔ grammi per ingredienti noti).
- Vista "percentuali del panettiere" per i lievitati.
- Comandi vocali in modalità cucina e per le domande.
- Verifica dal vivo dell'import da URL con `web_fetch` lato server.
- Sincronizzazione tra dispositivi (file su cloud o PocketBase): da decidere dopo aver capito se basta un file.
- Modello proprio invece dell'API (valutato l'11 ottobre 2026): per uso personale non conviene, l'API a consumo costa pochi euro l'anno. Se l'app dovesse servire più persone o la privacy diventasse un requisito: server in casa con Ollama e Cloudflare Tunnel, oppure GPU serverless, in entrambi i casi dietro LiteLLM in modalità compatibile Anthropic così l'app non cambia; modelli da 27-32B per l'import strutturato, 8B bastano per domande e suggerimenti.
- Profili utente (free, base, premium) con la chiave dietro il proxy: richiede utenti (accesso con email) e il worker come punto di misura, che somma il costo reale dei token per utente e per mese e blocca oltre il budget del piano. Prima di tutto misurare un mese di uso vero, poi tarare. Bozza: Free = tutta l'app senza AI più 10 domande e 3 import al mese con Haiku; Base = domande illimitate con Sonnet, 20 import da testo, 5 foto, 5 tra varianti e piatti, "Cosa preparo" con AI; Premium = tutto incluso con Opus, foto e sito, 150 import. Costo API stimato per utente attivo: Free sotto 5 centesimi, Base 50-80 centesimi, Premium 2-4 euro al mese.
- Test end-to-end con Playwright (gli script usati per la revisione UI sono una base).
- Icone PWA raster per iOS.
