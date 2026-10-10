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

1. Correzioni di layout da pochi minuti: wizard (1), foglio "Chiedi" (2), spazio prima della virgola, "prima 1 q.b.", nomi accessibili di "Importa" e "Duplica", contrasto di `faint` e bersaglio "Chiudi timer" (audit sotto, punti 1 e 2).
2. Ordine dei passaggi in lettura (4) e pagina "non trovata" con rotta di ripiego (3).
3. Sessioni abbandonate (5) e persistenza della modalità cucina (6), che vanno progettate insieme perché toccano lo stesso stato.
4. Pulizia dell'informazione in lettura e in cucina: chip del tipo, durata doppia, "In questo passo", resa totale.
5. Wizard: inserimento ingredienti, pastiglie delle fasi, tabella di riepilogo, conferma all'uscita.
6. Coerenza icone e font.

Ogni punto del gruppo 1 e 2 si può verificare con gli screenshot a 390 px: i file di prova usati per questa analisi sono riproducibili con `pnpm build && pnpm preview` e uno script Playwright che visita le rotte elencate sopra.

## Revisione con le skill di design

Seconda passata fatta con le skill `frontend-design` (Anthropic), `design-critique`, `accessibility-review` e `ux-copy` (plugin Design di Anthropic), copiate in `.claude/skills/` perché siano disponibili in ogni sessione. I numeri vengono da misure Playwright sull'app compilata a 390 px: rapporti di contrasto calcolati dai token di `src/index.css`, dimensioni dei bersagli tattili, campi senza etichetta, titoli, comportamento da tastiera.

### Identità visiva: i "tell" da evitare secondo frontend-design

La skill elenca i tratti tipici del design generato automaticamente. Verifica sul Ricettario:

| Tratto | Stato | Nota |
|---|---|---|
| Fondo crema caldo + serif ad alto contrasto + accento terracotta | Parziale | Il terracotta è stato tolto nella seconda revisione, ma fondo `#f8f7f3` e serif restano la coppia più prevedibile. L'olivo salva l'insieme; non aggiungere altri colori caldi. |
| Kit di card SaaS: tutto in schede uguali, stesso raggio, stessa ombra | Presente | `card` ha un solo raggio (`2xl`) e un'unica ombra ed è usata per Dosi, Assistente, mise en place, "In questo passo", ogni ingrediente e passaggio del wizard, tutte le sezioni di Impostazioni, compreso il blocco di testo "Come funziona la scalatura". CLAUDE.md la riserva ai pannelli interattivi: Impostazioni e wizard la violano. |
| Entrata con dissolvenza e scorrimento su ogni pagina | Presente | `main` in `Layout.tsx` ha `fade-up` a ogni cambio rotta e il foglio "Chiedi" lo ripete. La skill consiglia un solo movimento orchestrato, o nessuno: da tenere solo per il foglio (risponde a un'azione), via dal cambio pagina. |
| Transizione hover su ogni card | Presente | `hover:bg-surface-2` su ogni voce della lista; sul telefono non esiste hover, sul desktop è un effetto generico. Accettabile, ma non necessario. |
| Marcatori numerati 01/02/03 | Corretto | I passaggi sono davvero una sequenza: la numerazione è giusta. I `#1` degli ingredienti nel wizard invece non lo sono (l'ordine conta poco): meglio toglierli. |
| Etichette in maiuscoletto, puntini mediani, frecce nel testo dei link | Assenti | Già ripuliti nella seconda revisione. |
| Monospazio per piccole etichette di dati | Presente | Il conto alla rovescia dei timer e il campo chiave API usano `font-mono`. Per la chiave ha senso, per i timer no (vedi sopra). |
| Una sola parola accentata nel titolo | Assente | |

Giudizio: l'identità è sincera (il quaderno di cucina è il soggetto giusto), ma l'app "spende l'audacia" in nessun punto preciso. La skill chiede un elemento memorabile e tutto il resto quieto: qui il candidato naturale è il passaggio in modalità cucina, già in Fraunces a 26-30 px. Si potrebbe spingere oltre (corpo più grande, quantità con peso diverso dal testo, nessuna card sotto) e in cambio togliere peso alle schede della vista lettura.

### Critica strutturata (design-critique)

Le tre schermate che contano, nel formato della skill. Gravità: critica, moderata, minore.

**Lista ricette.** Prima impressione: pulita, il titolo in Fraunces è la cosa che si vede per prima ed è giusto così. Usabilità: nessun ordinamento visibile (è "ultima modifica", ma non si dice); la ricerca non ha un modo per azzerare i filtri tag oltre a "tutte". Gerarchia: tre righe di metadati per voce (descrizione, numeri, tag) sono troppe su schermi piccoli; la descrizione basta, i tag si possono accorpare con i numeri. Coerenza: la chip "tutte" selezionata usa un anello, le altre no: il selezionato dovrebbe essere pieno. Accessibilità: le chip-filtro sono bottoni alti 20 px (moderata), la pagina non ha un `h1` (minore).

**Vista ricetta.** Prima impressione: il bottone verde "Cucina passo per passo" domina, corretto perché è l'azione principale. Usabilità: l'inserimento diretto di una quantità (pivot) è la funzione più originale dell'app ma è nascosta dietro una riga di testo spiegata; le quantità su fondo grigio non comunicano "tappabile" (moderata). "Duplica" è un bottone senza nome accessibile sul telefono (moderata). Gerarchia: tre card consecutive (Dosi, Assistente, poi gli ingredienti senza card) creano un ritmo spezzato; l'Assistente chiuso è un bottone a tutta larghezza che pesa quanto l'azione principale. Coerenza: le durate appaiono in tre formati (`6 h`, `6:00:00`, `30:00`) nella stessa riga. Accessibilità: campo porzioni senza etichetta (3.3.2), "prima 200 g" in `faint` a 2,4:1 (1.4.3, critica perché è l'informazione che spiega la scalatura).

**Modalità cucina.** Prima impressione: la migliore schermata dell'app; il testo del passaggio è il protagonista. Usabilità: non si può saltare a un passaggio; "Esci" perde tutto senza avviso (critica); il foglio "Chiedi" non si chiude con Escape, non riceve il focus e non è annunciato come finestra (moderata). Gerarchia: lo spazio vuoto tra testo e "In questo passo" (card ancorata in basso) è spesso metà schermo; la card ripete il testo. Coerenza: i timer attivi usano il monospazio, le quantità Fraunces. Accessibilità: le caselle della mise en place sono 20 px e senza etichetta associata al nome (lo screen reader legge "casella di controllo" e basta); la "×" del timer nella barra è 22×14 px, il bersaglio più piccolo dell'app (critica).

### Audit di accessibilità (accessibility-review, WCAG 2.1 AA)

Esito: 4 critici, 6 maggiori, 4 minori. Contrasti misurati sui token di `src/index.css`.

| # | Problema | Criterio | Gravità | Rimedio |
|---|---|---|---|---|
| 1 | Testo in `text-faint` ("prima 200 g", costo delle risposte, etichette regola nel riepilogo): 2,39:1 chiaro, 3,13:1 scuro | 1.4.3 Contrasto | Critica | Usare `text-muted` per il testo informativo; riservare `faint` a segnaposto e decorazioni |
| 2 | "Chiudi timer" nella barra: bersaglio 22×14 px | 2.5.5 / 2.5.8 Bersagli | Critica | Padding fino ad almeno 24×24, meglio 44 in cucina |
| 3 | Caselle della mise en place: 20×20 px, nessuna etichetta associata | 2.5.8, 1.3.1, 3.3.2 | Critica | `<label>` che avvolge casella, quantità e nome; riga intera tappabile |
| 4 | Foglio "Chiedi": nessun `role="dialog"`, focus non spostato, Escape non chiude, scorciatoie Spazio/frecce restano attive sotto | 2.1.1, 2.4.3, 4.1.2 | Critica | `role="dialog"` con `aria-modal`, focus sull'input all'apertura, Escape chiude, scorciatoie sospese |
| 5 | Link "Importa" e bottone "Duplica": nessun nome accessibile sul telefono | 4.1.2 Nome, ruolo, valore | Maggiore | `aria-label` come già fatto per Impostazioni, Modifica, Elimina |
| 6 | Wizard: tutti i campi di ingredienti e passaggi hanno solo il segnaposto, 36 campi senza etichetta nella fase 2 | 3.3.2 Etichette | Maggiore | `aria-label` per campo o etichette visibili compatte; il segnaposto sparisce appena si scrive |
| 7 | Chip come bottoni (filtri tag, domande rapide, pastiglie delle fasi): 20-24 px di altezza | 2.5.8 Bersagli | Maggiore | `py-1.5` minimo sulle chip interattive, lasciando le chip informative com'è |
| 8 | Bottoni "n" nel wizard: 19×20 px e nome di una lettera | 2.5.8, 2.4.6 | Maggiore | Vedi difetto "n" sopra |
| 9 | `muted` su `surface-2`: 4,45:1 (chiaro), appena sotto soglia; usato per testo nelle bolle della chat e nelle righe al passaggio del mouse | 1.4.3 | Maggiore | Scurire `--muted` a `#66655d` oppure non usare `muted` su `surface-2` |
| 10 | Impostazioni a 320 px: la pagina è larga 350 px (riga chiave API + "Mostra") | 1.4.10 Reflow | Maggiore | `min-w-0` sull'input, bottone sotto a larghezze piccole |
| 11 | Campo porzioni, campo domanda, URL del proxy, area di testo dell'import: senza etichetta | 3.3.2 | Minore | `aria-label` |
| 12 | Lista e passo in cucina senza `h1`; il testo del passo è un `p` | 1.3.1 Struttura | Minore | `h1` visivamente discreto sulla lista; il passaggio come `h1` in cucina |
| 13 | Barra di avanzamento senza `role="progressbar"` e senza valore | 4.1.2 | Minore | `role`, `aria-valuenow`, `aria-valuemax` |
| 14 | Stelle del voto: bottoni con etichetta ma senza `aria-pressed`; stato selezionato solo col colore | 1.4.1, 4.1.2 | Minore | `aria-pressed` e icona piena/vuota |

Cosa va bene: contrasto del testo principale e secondario ampio in entrambi i temi (15,9:1 e 9:1 su fondo chiaro), anello di focus visibile su tutti i controlli, `prefers-reduced-motion` rispettato, tema scuro con contrasti anche migliori del chiaro, `role="status"` sulla barra dei timer, `role="radiogroup"` sul selettore del tema.

### Testi dell'interfaccia (ux-copy)

- **Conferme.** "Eliminare 'Tiramisù'?" è buono ma i bottoni sono OK/Annulla del sistema; la skill chiede bottoni che nominano l'azione ("Elimina ricetta" / "Tieni"). Quando si sostituirà `confirm()`, usare quella coppia.
- **Errori.** I messaggi dell'AI passano da `describeAiError` e dicono cosa è successo; manca il "come rimediare" (es. "Controlla la chiave in Impostazioni"). Il messaggio d'importazione JSON mostra l'errore grezzo del parser.
- **Stati vuoti.** La lista vuota è un buon esempio (cos'è, perché è vuoto, come iniziare). Manca uno stato vuoto per la ricerca senza risultati distinto da "nessuna ricetta": oggi lo stesso testo invita a "creare la prima ricetta" anche quando ce ne sono dieci e il filtro è troppo stretto.
- **Azioni.** "Struttura la ricetta", "Crea variante", "Salva e chiudi" sono verbi precisi. "Chiedi" in cucina e "Chiedi all'AI o crea una variante" in lettura nominano la stessa funzione in due modi; "Inizia" e poi "Finito" come etichetta del bottone che porta al diario andrebbe rinominato "Vai al diario" o "Concludi", perché "Finito" descrive uno stato, non un'azione.
- **Hint.** "Oppure tocca la quantità di un ingrediente qui sotto e scrivi quanto ne hai: il resto si adatta" è chiaro ma è l'unico modo in cui la funzione viene scoperta: meglio un'affordance visiva (icona matita accanto alla quantità) e una frase più corta.
