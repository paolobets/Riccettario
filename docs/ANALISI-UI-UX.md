# Analisi UI/UX, terza revisione

Stato al 10 ottobre 2026, dopo le due revisioni grafiche già in `main`. L'analisi si basa sul codice di `src/app` e su screenshot dell'app compilata a larghezza telefono (390 px, tema chiaro e scuro) e desktop (1024 px), con le tre ricette di esempio. Ogni voce indica il file da toccare.

## Cosa funziona già bene

- L'identità da quaderno (Fraunces, verde oliva, filetti) è coerente su tutte le schermate e regge nel tema scuro senza contrasti sbagliati.
- La vista lettura è densa ma leggibile: quantità evidenziate nel testo dei passaggi, avvisi di scalatura chiari, suggerimento dei fattori fattibili ben spiegato.
- La modalità cucina ha la gerarchia giusta: un passaggio grande, i comandi in basso raggiungibili col pollice, "Nel frattempo puoi" e il rimando al passo padre sono immediati.
- Lo stato vuoto della lista spiega le due vie (a mano o con l'AI).

## Difetti bloccanti

Sono errori visibili subito, non questioni di gusto. Vanno corretti prima di qualsiasi altro ritocco.

### 1. Il wizard scorre in orizzontale sul telefono

Nelle fasi Ingredienti e Passaggi la pagina è larga 449 px e 477 px su uno schermo da 390 px. La riga di testa di ogni scheda (campo nome, frecce, X) non entra: l'input ha una larghezza minima intrinseca e i bottoni vengono spinti fuori dallo schermo. Di conseguenza il bottone "Avanti" in fondo è coperto da un'altra scheda e un tocco può non andare a segno (Playwright lo segnala come elemento intercettato). File: `src/app/pages/RecipeWizard.tsx`, righe 24-41 e 154-169 della seconda metà. Rimedio: `min-w-0` sugli input in flex, frecce e X più compatte o spostate in un menu, e la riga "tipo + sezione" dei passaggi su una riga propria.

### 2. Il foglio "Chiedi" in cucina è tagliato

Aperto il foglio delle domande, il bottone "Invia" finisce a 407 px su 390: metà bottone è fuori schermo. L'input con `flex-1` non ha `min-w-0` e `text-lg` lo allarga. File: `src/app/components/CookAssistant.tsx`, riga 61.

### 3. Pagina vuota per ricette inesistenti e indirizzi sconosciuti

`/ricetta/qualcosa-che-non-c-e` resta bianco per sempre: `useLiveQuery` restituisce `undefined` sia mentre carica sia quando la ricetta non esiste, quindi il ramo "Ricetta non trovata" non viene mai raggiunto. Lo stesso per un indirizzo qualsiasi non previsto, perché non c'è una rotta di ripiego. È il caso tipico di chi apre un link vecchio o di una ricetta eliminata da un altro dispositivo dopo un import. File: `src/app/pages/RecipeView.tsx` righe 27-41 (usare un valore sentinella per "non trovata", per esempio `null` restituito dalla query), `src/app/App.tsx` (rotta `*`).

### 4. In lettura i passaggi con sezioni vengono riordinati

La vista lettura raggruppa i passaggi per sezione e li numera di nuovo. Nel Tiramisù i passaggi reali sono 1 Montaggio, 2-4 Crema, 5-7 Montaggio; in lettura si vede "Montaggio: 1 prepara il caffè, 2 inzuppa i savoiardi e copri con metà crema, 3 riposa in frigo, 4 spolvera" e solo dopo "Crema: 5 separa le uova…". La ricetta letta così è sbagliata (si monta prima di fare la crema) e i numeri non coincidono con quelli della modalità cucina, che usa l'ordine vero. File: `src/app/pages/RecipeView.tsx`, `groupSteps` righe 14-22. Rimedio: mantenere l'ordine originale e mostrare il titolo di sezione solo quando cambia rispetto al passaggio precedente.

### 5. Le cotture abbandonate finiscono nel diario

"Inizia" crea subito una sessione nel database; se si esce con "Esci" la sessione resta senza `finishedAt` e compare nel "Diario di cottura" come riga con data e fattore, senza voto né note. Basta aprire e chiudere la modalità cucina tre volte per avere tre righe vuote. File: `src/app/pages/CookMode.tsx` righe 76-82, `src/app/pages/RecipeView.tsx` riga 28. Rimedio: creare la sessione solo al salvataggio finale (oppure filtrare le sessioni senza `finishedAt` e cancellarle all'uscita).

### 6. La modalità cucina non sopravvive a un ricaricamento

Il passaggio corrente, le spunte della mise en place e l'id della sessione vivono in `useState`. Sul telefono il browser scarica spesso la scheda in background (si passa a messaggi, si torna dopo venti minuti): si riparte da "Prima di iniziare" e il diario di fine cottura non viene salvato perché `sessionId` è perso. I timer invece sopravvivono, quindi l'incoerenza è evidente. File: `src/app/pages/CookMode.tsx`. Rimedio: passaggio corrente nell'URL (`?passo=3`, coerente con la regola del fattore in `?f=`) e spunte con id sessione in `sessionStorage`.

## Difetti medi

Problemi di chiarezza o coerenza che un utente nota, in ordine di impatto.

- **Il link "Importa" nel menu non ha un nome accessibile** sul telefono: il testo è nascosto con `hidden sm:inline` e manca `aria-label`, a differenza di "Impostazioni". Per chi usa lo screen reader è un bottone senza nome. File: `src/app/components/Layout.tsx` riga 16.
- **"prima 1 q.b."** compare sotto sale e cacao quando la ricetta è scalata: per gli ingredienti "quanto basta" la riga "prima…" non ha senso. File: `src/app/components/IngredientList.tsx` riga 123.
- **"7 h 3 min , di cui 33 min ai fornelli"**: spazio prima della virgola, causato dal `gap-1` del contenitore inline-flex tra il testo e lo span. File: `src/app/pages/RecipeView.tsx` righe 85-88.
- **"In questo passo" mostra quantità fuorvianti**: al passo "Servi con altro pecorino e pepe" (riferimenti solo-nome) la scheda elenca "50 g pecorino, 1 cucchiaino pepe", cioè le dosi totali già usate, come se andassero aggiunte ora. Quando il passaggio cita un solo ingrediente, la scheda ripete inoltre esattamente quello che è già evidenziato nel testo. File: `src/app/pages/CookMode.tsx` righe 64-69 e 185-190. Rimedio: escludere i riferimenti `{id|nome}` e nascondere la scheda se resta un solo ingrediente già evidenziato nel testo.
- **La stessa durata appare due volte in formati diversi**: "Riposo, 6 h" e accanto "Lievitazione, 6:00:00"; "Puntata, 30:00" invece di "30 min". Il formato a cronometro ha senso solo per il conto alla rovescia in corso. File: `src/app/components/TimerButton.tsx` riga 26 (usare `formatDuration` per il timer non avviato).
- **La chip del tipo di passaggio ripetuta a ogni passo** ("Preparazione" sette volte su sette) non aggiunge informazione e appesantisce la lista. Mostrarla solo per riposo, attesa e cottura, oppure solo quando cambia. File: `src/app/pages/RecipeView.tsx` riga 133.
- **"Resa totale" con unità lunga va a capo in tre righe** ("teglia 30×20 cm" nel Tiramisù) e chiedere "quante teglie" non ha senso per una resa pari a 1. Nascondere la riga quando la resa non è una massa o un volume, oppure spostare l'unità sotto il campo. File: `src/app/components/ScalerPanel.tsx` righe 240-265.
- **Il bottone "n" accanto a ogni ingrediente nel wizard è criptico** e l'istruzione sopra parla di "tenere premuto a lungo" o di "solo nome", ma non esiste alcuna pressione lunga e il bottone non si chiama "solo nome". File: `src/app/pages/RecipeWizard.tsx`, PhaseSteps righe 149-151 e 188-199. Rimedio: un solo bottone per ingrediente che inserisce la quantità, e un interruttore "senza quantità" per riga, oppure etichetta "nome" scritta per esteso.
- **"Annulla" nel wizard e "Esci" in cucina non chiedono conferma** e non c'è bozza salvata: dieci minuti di inserimento se ne vanno con un tocco sbagliato (o col tasto indietro del telefono, non intercettato). File: `src/app/pages/RecipeWizard.tsx` riga 199, `src/app/pages/CookMode.tsx` riga 92.
- **Le pastiglie delle fasi del wizard** vanno a capo a 390 px ("2. Ingredienti" su due righe) e non si capisce se sono tappabili. Meglio una barra sottile con il nome della fase corrente e "Fase 2 di 4".
- **La tabella "Prova di scalatura ×2"** a 390 px ha quattro colonne strette: l'etichetta della regola va su quattro righe ("Sub-lineare (sale, spezie, lievito)"). Mostrare la regola come riga secondaria sotto il nome, o abbreviare le etichette per questo contesto. File: `src/app/pages/RecipeWizard.tsx`, PhaseReview righe 268-286.
- **"Chiedi" in cucina compare anche senza chiave API**: si apre il foglio, si scrive la domanda e solo allora arriva l'errore. In `AiPanel` lo stato è controllato, in `CookAssistant` no. File: `src/app/components/CookAssistant.tsx`.
- **In cucina non si può saltare a un passaggio preciso**: solo avanti e indietro, la barra di avanzamento non è interattiva. Con sette passaggi è tollerabile, con venti no. Un tocco sul titolo "Passo 3 di 7" potrebbe aprire l'elenco.
- **La lista ricette mostra "4 h 38 min" per il Tiramisù** sommando le quattro ore di frigo: in lettura la distinzione "di cui ai fornelli" c'è, in lista no. Mostrare in lista il tempo attivo, o entrambi. File: `src/app/pages/RecipeList.tsx` riga 170.

## Coerenza con le regole di `CLAUDE.md`

- Frecce "↑" "↓" e il "+" di "+ Aggiungi ingrediente / passaggio" sono caratteri di testo invece di icone da `Icon.tsx` (`RecipeWizard.tsx`). Le stelle del voto e del diario sono il glifo "★" (`CookMode.tsx` riga 201, `RecipeView.tsx` riga 174): servirebbe un'icona `star` in `Icon.tsx`.
- Il conto alla rovescia usa `font-mono` mentre la regola dice quantità in `font-display`: Fraunces ha i numeri tabulari (`tnum` è già attivo nel body), quindi si può usare `qty` anche lì (`TimerBar.tsx`, `TimerButton.tsx`).
- La conferma di eliminazione è il `confirm()` nativo del browser, fuori dal linguaggio visivo dell'app (`RecipeView.tsx` riga 71). Accettabile per ora, ma è l'unica finestra di sistema rimasta.
- Le anteprime delle foto in `ImportPage.tsx` riga 290 creano un `URL.createObjectURL` a ogni render senza revocarlo.

## Ordine di intervento proposto

1. Correzioni di layout da pochi minuti: wizard (1), foglio "Chiedi" (2), spazio prima della virgola, "prima 1 q.b.", nome accessibile di "Importa".
2. Ordine dei passaggi in lettura (4) e pagina "non trovata" con rotta di ripiego (3).
3. Sessioni abbandonate (5) e persistenza della modalità cucina (6), che vanno progettate insieme perché toccano lo stesso stato.
4. Pulizia dell'informazione in lettura e in cucina: chip del tipo, durata doppia, "In questo passo", resa totale.
5. Wizard: inserimento ingredienti, pastiglie delle fasi, tabella di riepilogo, conferma all'uscita.
6. Coerenza icone e font.

Ogni punto del gruppo 1 e 2 si può verificare con gli screenshot a 390 px: i file di prova usati per questa analisi sono riproducibili con `pnpm build && pnpm preview` e uno script Playwright che visita le rotte elencate sopra.
