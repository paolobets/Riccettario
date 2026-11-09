# Modello dati e regole di scalatura

Il modello è ispirato alla specifica aperta [Soustack](https://spec.soustack.org) (stack `quantified`, `structured`, `scaling@1`, `timed`), con due estensioni nostre: la modalità `sublinear` e la scalatura *pivot*. I tipi sono in `src/core/model.ts`.

## Ricetta

```ts
interface Recipe {
  id: string
  title: string
  description?: string
  servings: number            // porzioni per cui sono scritte le quantità
  yield?: { amount: number; unit: string }   // resa totale di riferimento (es. 850 g)
  pan?: { shape: 'round'; diameterCm: number } | { shape: 'rect'; widthCm: number; lengthCm: number }  // teglia di riferimento
  dosing?: { mode: 'servings' | 'pans' | 'molds' | 'pieces'; dough?: DoughType; pieceGrams?: number }  // modalità delle dosi
  favorite?: boolean          // stella
  label?: LabelInfo           // dati dell'etichetta: allergeni confermati, peso netto, durata, conservazione, produttore, note, dicitura facoltativa
  tags: string[]
  sections?: string[]         // es. ["Crema", "Montaggio"]
  ingredients: Ingredient[]
  steps: Step[]
  notes?: string
  source?: string
  createdAt: string
  updatedAt: string
}
```

## Ingrediente

```ts
interface Ingredient {
  id: string                  // stabile, citato nei passaggi come {id}
  name: string
  quantity?: { amount: number; unit: Unit }
  note?: string               // "a cubetti", "a temperatura ambiente"
  scaling?: ScalingRule       // default: linear
  section?: string
  optional?: boolean
}

interface BaseCopy {          // Recipe.baseCopies: sezioni copiate da una Base
  section: string             // "Pasticcera", "Pasticcera (2)"
  baseId: string
  baseVersion: string         // impronta della Base al momento della copia
  quantity: Quantity          // quantità chiesta: 300 g, oppure 2 dosi (unità vuota)
  prefix: string              // prefisso degli id copiati ('' per Salva come Base)
  copied: string              // impronta della sezione appena copiata
}
```

Un `recipeId` negli ingredienti è un resto del vecchio collegamento alle basi: se arriva da dati vecchi (sincronizzazione, backup) si ignora e la riga vale come ingrediente semplice.

Unità: `g kg ml l cucchiaio cucchiaino tazza bicchiere pizzico pz bustina foglia spicchio rametto fetta q.b.` e la stringa vuota per i conteggi ("2 uova"). Internamente kg e l vengono portati in g e ml; in visualizzazione si torna a kg/l sopra i 1000.

## Regole di scalatura

Dato un fattore F (es. 1,5 per passare da 4 a 6 porzioni):

| mode | comportamento | esempio |
|---|---|---|
| `linear` (default) | quantità × F | farina, acqua, pasta |
| `sublinear` | quantità × F^e, e = 0,8 di default | sale, spezie, lievito: raddoppiando si ha ×1,74 |
| `discrete` | quantità × F arrotondata a multipli di `step` (default 1) con `rounding` nearest/ceil/floor e limiti `min`/`max` | uova, fette |
| `fixed` | invariata | una foglia di alloro, la bustina di lievito |
| `toTaste` | invariata, solo informativa | sale q.b. |
| `bakersPercent` | `percent` % dell'ingrediente `of` già scalato | acqua al 65 % della farina |

Dopo la scalatura le quantità lineari e sub-lineari vengono **arrotondate a misure pratiche** (`roundPractical` in `units.ts`): grammi e millilitri a 0,5 / 1 / 5 / 10 secondo la grandezza, cucchiai a quarti, tazze a ottavi. Gli ingredienti discreti, fissi e q.b. non vengono arrotondati ulteriormente.

### Come si ricava il fattore

La **modalità delle dosi** (`dosing`) la sceglie chi scrive la ricetta, in Modifica, o la propone l'import AI: porzioni, teglie (con il tipo di impasto), stampi o pezzi da tot grammi. Il pannello Dosi apre quella modalità e permette di passare alle altre per cui ci sono i dati. Le ricette senza `dosing` ricevono una proposta da `dosingOf`: stampi se il titolo nomina panettone, pandoro o colomba, teglie se c'è una teglia o il titolo nomina pizza, focaccia o pinsa, altrimenti porzioni.

- **Porzioni**: F = porzioni richieste / porzioni della ricetta.
- **Resa**: F = resa richiesta / resa della ricetta (serve `yield`).
- **Teglia**: F = area della teglia scelta / area della teglia della ricetta (serve `pan`); tonda = π(d/2)², rettangolare = lato × lato. Lo spessore resta quello pensato dall'autore; i tempi di cottura, come sempre, non scalano (`pan.ts`).
- **Più teglie**: F = area totale delle teglie scelte / area della teglia della ricetta, con ogni riga "n teglie di una misura" (`factorFromPans`). Dopo l'applicazione l'impasto si divide tra le teglie in proporzione all'area (`splitDough`).
- **Impasto per cm²**: se la ricetta non ha `pan` ma è un impasto da teglia (titolo o tag con pizza, focaccia o pinsa, `doughTypeOf`), F = area totale × grammi per cm² / peso dell'impasto. È l'"indice di carico" usato da pizzerie e calcolatori (impasto = area × indice). Valori proposti in `DOUGH_TYPES`, scelti dal menu e modificabili: pizza in teglia 0,5 (1,1–1,3 kg per una 60×40 nelle schede professionali), pizza alta e soffice 0,6, pizza tonda napoletana 0,31, pizza tonda sottile 0,25, focaccia alta 0,6, focaccia genovese 0,42 (circa 500 g per una 30×40), pinsa 0,4; tolleranza indicativa ±10 %. Il peso dell'impasto (`doughWeight`) è la resa se è in g o kg, altrimenti la somma degli ingredienti in grammi e millilitri (1 ml ≈ 1 g) della sezione "Impasto" se esiste, esclusi q.b., fissi e facoltativi.
- **Pizze o panetti**: F = numero × grammi di ciascuno / peso dell'impasto (`factorFromPieces`).
- **Stampi** (panettone, pandoro, colomba, riconosciuti dal titolo con `moldedTypeOf`): lo stampo indica il peso del prodotto finito e si mette il 10 % di impasto in più per il calo in cottura (`MOLD_OVERFILL`: stampo da 1 kg, 1,1 kg di impasto). F = Σ (stampi × peso) × 1,1 / peso dell'impasto (`factorFromMolds`); al contrario `moldsFromDough` dice quanti stampi di un formato si riempiono con l'impasto attuale. Formati proposti: 100, 250, 500, 750 g e 1 kg.
- **Pivot**: l'utente dichiara la quantità di un ingrediente. Per `linear` e `discrete` F = nuova / originale; per `sublinear` si inverte la curva (F = (nuova/originale)^(1/e)); per `bakersPercent` si risale alla base. `fixed` e `toTaste` non possono guidare la scalatura.

### Fattori fattibili

Se F porta un ingrediente discreto a un numero non intero (2,6 uova), `suggestFeasibleFactors` propone i fattori più vicini che danno un numero intero (3 uova → ×1,5; 2 uova → ×1) e l'interfaccia li offre come scorciatoie.

### Avvisi

- F fuori da [0,5; 2]: "verifica tempi di cottura e dimensioni di pentole e teglie".
- Presenza di ingredienti sub-lineari con |F − 1| > 0,25: "assaggia e correggi".
- Ingrediente discreto arrotondato oltre l'8 %: avviso sull'ingrediente.

I **timer e i tempi non scalano mai**.

## Passaggio

```ts
interface Step {
  id: string
  text: string                // "Sciogli {lievito} in {acqua} tiepida", "{acqua|nome}" = solo il nome
  type?: 'prep' | 'cook' | 'rest' | 'wait' | 'serve'
  durationMin?: number
  temperatureC?: number
  equipment?: string[]
  timer?: { minutes: number; label?: string }
  section?: string
  parallelWith?: string       // id del passaggio durante il quale si può svolgere (es. un riposo)
}
```

### Passaggi paralleli

`parallelWith` indica che il passaggio si può svolgere mentre un altro è in corso (un riposo, una cottura lunga, l'acqua che bolle). In modalità cucina il passaggio "padre" mostra il riquadro *Nel frattempo puoi* con i passaggi paralleli, e questi mostrano un rimando al padre. L'ordine dei passaggi resta lineare: il parallelismo è un suggerimento di navigazione, non un grafo di dipendenze.

### Timer

I timer avviati (da lettura o da modalità cucina) vivono in un unico store persistito in `localStorage` (`src/app/timers/store.tsx`), identificati da `ricetta:passaggio`. Una barra sempre visibile li mostra tutti; toccandone uno in modalità cucina si salta al passaggio. Il conto alla rovescia usa un timestamp di fine, quindi regge a ricaricamenti e sospensioni del tab.

`renderStep` in `steps.ts` sostituisce i riferimenti con la quantità già scalata ("350 g di acqua"), così lettura e modalità cucina mostrano sempre i numeri giusti.

## Basi

Una **Base** (pasticcera, frolla, pralinato, frangipane) è una ricetta normale con il tag `base` (`isBase`, `setBase`). Usarla in un'altra ricetta è una **copia**, non un collegamento (`bases.ts`):

- `copyBaseInto(ricetta, base, quantità, { replaceIngredientId? })` copia ingredienti e passaggi della Base, scalati, come sezione col titolo della Base ("Pasticcera", oppure "Pasticcera (2)" se c'è già; le sezioni interne della Base diventano "Crostata pronta: Crema"). La quantità si dà **a peso o volume** (fattore = quantità / resa della Base, serve `yield` in g o ml) oppure **a dosi** (senza unità: il fattore è il numero di dosi), come calcola `baseFactor`. Gli id copiati prendono il prefisso dello slug della Base (`pasticcera-latte`), riscritti anche nei passaggi, nelle percentuali del panettiere e nei paralleli. Gli ingredienti vanno al posto della riga sostituita (o in coda), i passaggi prima di quelli della ricetta, dopo quelli delle Basi già copiate. Con `replaceIngredientId` la riga sparisce e nei passaggi i riferimenti a lei diventano il suo nome.
- La copia è una sezione come le altre: si modifica liberamente, la Base non cambia. Etichetta, spesa, cucina e assistente la trattano come ingredienti normali.
- L'origine sta in `Recipe.baseCopies`. `baseFingerprint` (ingredienti, passaggi e resa della Base) e `sectionFingerprint` (la sezione nella ricetta, con il prefisso tolto) sono hash FNV-1a del JSON normalizzato: stringhe e liste vuote contano come assenti, così un'andata e ritorno nel wizard non fa risultare modificata una copia. `copyStatus` dà `current`, `outdated` (la Base è cambiata), `modified` (la copia è stata modificata nella ricetta; vale più di `outdated`) o `orphan` (la Base non c'è più).
- `baseUsages(ricette, base)` elenca gli usi **diretti** di una Base, una voce per copia: una Base copiata dentro un'altra Base si aggiorna un livello alla volta. `updateBaseCopy` sostituisce la sezione con la versione attuale della Base alla **stessa quantità** chiesta (il fattore si ricalcola sulla resa nuova; se la resa non va più bene non aggiorna e lo dice) e con lo stesso prefisso, così i riferimenti esterni restano validi; un riferimento esterno a un ingrediente che non c'è più diventa il suo nome, e `checkRecipe` segnala i riferimenti rotti. `wouldCycle` impedisce di copiare una Base che contiene già, copiata, la ricetta di destinazione.
- `saveSelectionAsBase` ("Salva come Base", prima "Scomponi"): ingredienti e passaggi scelti a mano diventano una Base nuova con gli stessi id, senza sezione; nella ricetta restano, raccolti in una sezione col nome della Base alla posizione del primo scelto, e la sezione risulta copiata da lei (`prefix` vuoto). `defaultSelection` propone una sezione intera.
- Cancellando una Base, le ricette che l'avevano copiata tengono tutto e perdono solo l'origine (`forgetBase`).
- Salvando dal wizard una Base modificata e già copiata altrove, l'app apre la pagina della Base con `?aggiorna=1` e propone le ricette da aggiornare: spuntate quelle uguali alla copia, non spuntate quelle modificate (con l'avviso che le modifiche si perdono).

## Etichetta

`labelItems` (`label.ts`) elenca gli ingredienti in ordine decrescente di peso stimato (grammi e millilitri diretti, uova 55 g, cucchiai 12 g…), Basi copiate comprese; `labelIngredients` ne fa l'elenco puntato dell'etichetta, con ogni ingrediente una volta sola anche se sta in più sezioni (nome normalizzato come nella spesa, grammi sommati per l'ordine); `detectAllergens` riconosce i 14 allergeni dell'allegato II del regolamento 1169/2011 dalle parole dei nomi (con esclusioni per i falsi amici: noce moscata, latte di cocco, farina di riso). Gli allergeni confermati a mano stanno in `Recipe.label.allergens`; il logo è nelle impostazioni del dispositivo. Ogni formato ha il suo corpo del testo e la sua altezza del logo; l'anteprima avvisa quando il contenuto supera l'altezza del formato. La stampa usa il formato scelto come dimensione di pagina, oppure un foglio A4 con più copie.

## Lista della spesa

`buildShoppingList` (`shopping.ts`) prende più ricette con il loro fattore, le scala e somma gli ingredienti che hanno lo stesso nome normalizzato (minuscolo, senza parentesi) e la stessa unità base (g, ml, o l'unità di conteggio). Le voci "quanto basta" si agganciano alla riga quantificata con lo stesso nome, altrimenti fanno riga a sé; un ingrediente è facoltativo solo se lo è in tutte le ricette. La lista vive in Dexie (`lists`, una sola riga `current`) e solo sul dispositivo: non viene sincronizzata.

## Pronto per le 20:00

`planBackwards` (`schedule.ts`) parte dall'ora del pasto e va a ritroso: i passaggi in sequenza sommano la loro durata (timer o `durationMin`, la più lunga), quelli con `parallelWith` iniziano insieme al passaggio padre e non allungano il percorso. Restituisce l'ora di inizio di ogni passaggio e quella complessiva; la modalità cucina la mostra nella mise en place e manda una notifica all'ora di avvio dei passaggi finché resta aperta. Lo stato della cottura (inizio, passo corrente, orario scelto) è in `localStorage` e scade dopo un giorno: così dalla ricetta si può "riprendere dal passo 4".

## Controllo della ricetta

`checkRecipe` (`lint.ts`) produce consigli non bloccanti mostrati nel riepilogo del wizard: titolo o porzioni mancanti, ingredienti mai citati, uova con regola lineare, passaggi di cottura o riposo da 10 minuti in su senza timer, riposi da 20 minuti in su senza nulla in parallelo, passaggi vuoti o paralleli a un passaggio inesistente, passaggi che citano un ingrediente che non c'è più, percentuale del panettiere senza base.

## Condivisione

`recipeToText` scrive la ricetta come testo con le dosi già scalate; `encodeRecipeForLink` la mette dentro un link (`/condivisa#r=…`, base64url del JSON senza id, date e preferiti) che l'app apre proponendo di salvarla come copia propria.

## Scambio con l'AI

`src/ai/schema.ts` definisce con zod uno schema di scambio più semplice del modello interno: riferimenti agli ingredienti per id scelto dall'AI, passaggi paralleli per indice, campi `null` invece di assenti per numeri e tipo di passaggio, stringa vuota per i testi facoltativi, teglia in tre campi senza unioni (`panShape` vuoto e misure 0 se assente) (l'API accetta al massimo 16 parametri con tipi unione in tutto lo schema, e un test lo controlla). `aiToRecipe` lo converte in `Recipe` normalizzando gli id (`slugify`, deduplica), riscrivendo i riferimenti `{id}` nei passaggi, risolvendo le percentuali del panettiere e scartando con avviso ciò che non torna. Le richieste usano l'output strutturato dell'API (`output_config.format`), quindi la risposta è sempre JSON valido rispetto allo schema.

## Sessioni di cottura

Ogni avvio della modalità cucina crea una `CookSession` (ricetta, fattore, data) che alla fine riceve voto e note. È la base per la futura evoluzione assistita delle ricette.
