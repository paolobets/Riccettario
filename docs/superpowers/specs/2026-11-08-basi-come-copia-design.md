# Basi come copia: progetto

Data: 8 novembre 2026. Deciso con Paolo in conversazione.

## Perché

Oggi una ricetta può usare un'altra ricetta come base solo come **collegamento** (`Ingredient.recipeId`): la riga resta "frolla 450 g" e rimanda alla ricetta Frolla. Due problemi emersi nell'uso reale:

1. Una ricetta importata conteneva "crema pasticcera" come riga semplice. Non c'era modo di sostituirla con la ricetta Pasticcera già presente: Paolo ha dovuto creare una variante a mano.
2. Il collegamento non permette di modificare la base dentro una ricetta. Paolo parte da una Base "Frangipane" e nella crostata vuole farne un "frangipane all'arancia" senza toccare la Base.

Paolo lo dice così: "è quasi come un'importazione e non un collegamento".

## Cosa si costruisce

### Le Basi

- Una **Base** è una ricetta normale segnata come Base. Si segna e si toglie dalla ricetta (anche da una importata). Oggi l'indizio è il tag `base`; vedi "Lasciato al costruttore".
- Nell'interfaccia si chiamano sempre **Basi**.

### Usare una Base in una ricetta: è una copia

- In una ricetta si sceglie una Base e se ne indica la quantità (grammi o millilitri se la Base ha una resa, altrimenti dosi, come oggi). Ingredienti e passaggi della Base vengono **copiati** nella ricetta, scalati, come una **sezione** con il titolo della Base ("Frangipane"). Usa le sezioni che il modello ha già (`Ingredient.section`, `Step.section`).
- Due punti di ingresso:
  - **Aggiungi una Base**: nel wizard e in "Componi da basi", aggiunge la sezione copiata.
  - **Sostituisci con una Base**: su una riga esistente ("crema pasticcera 300 g") si sceglie una Base; la riga sparisce e al suo posto entra la sezione copiata, scalata alla quantità della riga (300 g sulla resa della Base). Se la riga non ha quantità utilizzabile, si chiede quanta prepararne.
- I passaggi copiati vanno **prima** dei passaggi della ricetta che non appartengono a quella sezione, nell'ordine delle sezioni Base aggiunte. Riferimenti `{id}` e percentuali del panettiere (`of`) nei passaggi copiati devono continuare a puntare agli ingredienti giusti anche se gli id si scontrano con quelli della ricetta.
- Dopo la copia la sezione è **modificabile** come qualsiasi parte della ricetta (aggiungere scorza d'arancia, correggere dosi, cambiare passaggi). La Base originale non cambia.
- Aprendo la ricetta si vedono **tutti** gli ingredienti e passaggi, Basi comprese: sono parte della ricetta. Modalità cucina, spesa, etichetta, assistente e controllo della ricetta li trattano come ingredienti e passaggi normali, senza logica speciale.

### Salvare una sezione come Base nuova

- Da una sezione copiata e modificata ("Frangipane", diventata all'arancia) si può **salvare come Base nuova** ("Frangipane all'arancia"). Da quel momento la sezione nella ricetta risulta presa da questa nuova Base.
- L'attuale "Scomponi" diventa questa stessa azione, **con scelta a mano** (deciso da Paolo): si parte da una sezione intera come proposta (come fa oggi `defaultSplitSelection`) ma si possono spuntare e togliere singoli ingredienti e passaggi, anche sparsi nella ricetta. Serve per le ricette importate dove la pasticcera è mescolata al resto. Gli elementi scelti diventano la Base nuova e nella ricetta vengono raccolti in una sezione col nome della Base, nella posizione del primo elemento scelto, come copia con la sua origine (non più come riga collegata).

### Origine e aggiornamenti

- Ogni sezione copiata ricorda **da quale Base e da quale versione** della Base viene, la quantità/fattore usato, e quanto basta per capire se nella ricetta è stata **modificata** rispetto alla copia originale.
- La pagina della Base mostra **"Usata in"**: le ricette che la contengono, ciascuna con lo stato:
  - *uguale alla versione da cui è stata presa* (e la Base nel frattempo è cambiata o no);
  - *modificata nella ricetta*;
  - *aggiornata* (copia dell'ultima versione).
- Quando si **salva una correzione** a una Base usata altrove, l'app chiede se aggiornare le ricette. Paolo sceglie quali, spuntandole:
  - non modificate: proposte spuntate; l'aggiornamento sostituisce la sezione con la versione nuova, scalata allo stesso fattore;
  - modificate: proposte **non** spuntate, con avviso che l'aggiornamento cancella le modifiche fatte nella ricetta (scelta di Claude, approvata da Paolo nel principio);
  - "Non ora": si può aggiornare più tardi dalla pagina della Base ("Usata in").
- Cancellare una Base non tocca le ricette che l'hanno copiata: perdono solo l'origine (non c'è più nulla da aggiornare).

### Il collegamento attuale sparisce

- Il modello a collegamento (`Ingredient.recipeId` e quanto ne dipende: `resolveBases`, `flattenIngredients` per le basi, `baseFactor`, `wouldCycle`, `detachBase`, `usedAsBaseIn` nella forma attuale, sezione "Basi" e "Spiana le basi" nella vista, "Basi da preparare" in cucina, link alle basi nell'elenco ingredienti) viene **tolto**: un solo modo di lavorare.
- **Nessuna migrazione**: le ricette composte che Paolo ha oggi sono prove e le ricrea. Il codice però non deve rompersi se trova un `recipeId` rimasto (dati vecchi, sincronizzazione, backup importati): quella riga si tratta come ingrediente semplice.

### Scelte di Claude dopo la revisione (approvate da Paolo l'8/11)

- **Aggiornare tiene la quantità, non il fattore.** L'origine salva la quantità chiesta ("300 g" o "2 dosi"). All'aggiornamento il fattore si ricalcola sulla resa nuova della Base: se la Pasticcera passa da 450 g a 900 g di resa, nella torta restano 300 g di crema. Se la Base non ha più una resa compatibile con l'unità chiesta, quella ricetta non si può aggiornare in automatico e lo si dice ("la resa della Base è cambiata, scegli di nuovo la quantità").
- **Basi dentro Basi: un livello alla volta.** Copiando una Base che contiene sezioni sue (es. "Crostata pronta" con "Frolla" e "Crema"), le sezioni interne restano distinte con un nome composto ("Crostata pronta: Crema") e l'origine registrata è solo quella della Base copiata. Gli aggiornamenti non vanno a cascata: se cambia la Pasticcera, si propongono le ricette e le Basi che l'hanno copiata direttamente (per esempio "Crostata pronta"). Le ricette che hanno copiato "Crostata pronta" si propongono quando si aggiorna "Crostata pronta". "Usata in" mostra solo gli usi diretti. Copiare una Base dentro sé stessa, anche passando per altre, resta vietato.
- **Gli id copiati sono stabili.** Gli ingredienti copiati prendono id deterministici (slug della Base più id originale, con un suffisso se la stessa Base compare due volte). Così un aggiornamento mantiene validi i riferimenti `{id}` e le percentuali del panettiere dei passaggi fuori dalla sezione. Se la versione nuova toglie un ingrediente citato fuori dalla sezione, il riferimento diventa testo col nome dell'ingrediente e il controllo della ricetta lo segnala. Con "Sostituisci con una Base" i riferimenti alla riga tolta (`{crema}`) diventano testo col nome della Base, come fa oggi `splitRecipe`.

## Non obiettivi

- Nessun collegamento "vivo" che cambia la ricetta da solo quando cambia la Base: gli aggiornamenti passano sempre da una scelta esplicita.
- Nessuna fusione intelligente tra modifiche locali e Base aggiornata: o si aggiorna (perdendo le modifiche) o no.
- Nessuna conversione automatica delle ricette composte esistenti.

## Da evitare (sarebbe un fallimento anche se funziona)

- Aggiornare una ricetta senza che Paolo l'abbia scelto, o cancellare modifiche locali senza avviso.
- Doppioni: gli stessi ingredienti della Base che compaiono due volte nella ricetta, o un'etichetta che li conta due volte.
- Passaggi copiati che mostrano riferimenti rotti (`{id}` non risolti) o quantità sbagliate dopo la copia.

## Vincoli

- Regole del repo in `CLAUDE.md`: `src/core` dominio puro con test (ogni modifica alla scalatura ha un test), `pnpm typecheck && pnpm build` prima del commit, token di colore, niente emoji, italiano.
- `docs/MODELLO-DATI.md`, `docs/COME-TESTARE.md`, `docs/ROADMAP.md` aggiornati.
- Le ricette si sincronizzano col backend (`src/data/sync.ts`, `functions/`): i campi nuovi devono viaggiare con la ricetta.
- Esportazione/importazione JSON (`repo.ts`, `version: 2`) e link di condivisione (`share.ts`) devono portarsi dietro i campi nuovi o ignorarli senza rompersi.

## Lasciato al costruttore

- Come segnare una Base: tenere il tag `base` o un campo dedicato (`isBase`), e come mostrarlo nell'elenco ricette (filtro "Basi").
- Forma esatta dell'origine (es. `Recipe.baseSections: { section, baseId, baseVersion, factor, fingerprint }[]`) e come si calcola la versione della Base (`updatedAt` o impronta del contenuto) e l'impronta per capire se la sezione è stata modificata.
- Strategia per gli id in conflitto (prefisso con lo slug della Base) e riscrittura dei riferimenti nei passaggi.
- Nome della sezione quando la stessa Base è usata due volte nella stessa ricetta.
- Dove esattamente sta il comando "Sostituisci con una Base" (wizard, vista ricetta o entrambi) e "Salva come Base".
- Ordine dei commit e delle fasi.
