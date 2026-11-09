# Basi come copia — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** le Basi si copiano dentro le ricette come sezione modificabile, con origine e versione tracciate, "Usata in" e aggiornamento a scelta; il collegamento `recipeId` sparisce.

**Architecture:** tutto il dominio delle Basi sta in un modulo puro nuovo, `src/core/bases.ts`, che sostituisce `src/core/compose.ts`. L'interfaccia (wizard, Componi, Salva come Base, vista ricetta) chiama solo funzioni di quel modulo che prendono e restituiscono `Recipe`. L'origine di ogni copia vive nella ricetta (`Recipe.baseCopies`) e viaggia col JSON della ricetta (sincronizzazione, backup, link) senza toccare backend o Dexie.

**Tech Stack:** React 19 + TypeScript, Vite, Dexie, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-08-basi-come-copia-design.md`

## Global Constraints

- `src/core` non importa React né Dexie; ogni modifica alla scalatura ha un test.
- `pnpm test`, `pnpm typecheck && pnpm build` verdi prima di ogni commit.
- Colori solo con i token di `src/index.css`; icone da `Icon.tsx`; niente emoji; niente maiuscoletto né `·` come separatori.
- Interfaccia e documentazione in italiano; il termine è sempre **Base / Basi**.
- Nessuna migrazione dei dati: un `recipeId` rimasto in un ingrediente si ignora (la riga è un ingrediente semplice).
- Commit su `main` solo con l'ok di Paolo; messaggi in italiano come nello storico, con la riga `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Stessa Base due volte nella stessa ricetta** → sezioni "Pasticcera" e "Pasticcera (2)", prefissi id distinti, aggiornamento di una non tocca l'altra. Test in Task 2 e Task 3.
2. **Riga da sostituire senza quantità utilizzabile** (q.b., vuota, "2 pz" con Base a resa in grammi) → nessuna copia, problema leggibile, il picker chiede la quantità. Test in Task 2.
3. **Andata e ritorno nel wizard non deve far risultare "modificata" una copia intatta** (stringhe vuote, `equipment: []`, numeri riscritti). Test in Task 1 e Task 2.
4. **Sezione copiata rinominata o svuotata nel wizard** → l'origine si scarta al salvataggio, niente stato fantasma in "Usata in". Test in Task 1.
5. **Dati vecchi con `recipeId`** (sincronizzazione, backup) → etichetta, spesa, vista e cucina non si rompono e trattano la riga come semplice. Test in Task 5.

---

### Task 1: Il wizard non perde più i campi che non gestisce

Bug esistente: `toRecipe` parte da `{ id, createdAt, updatedAt }` e perde `label`, `favorite`, `rating` e qualsiasi campo fuori bozza. Con le Basi perderebbe anche `baseCopies`.

**Files:**
- Create: `src/app/wizard/draft.ts` (spostare qui `fromRecipe`, `toRecipe`, i tipi `Draft`, `IngredientDraft`, `StepDraft`, `emptyIngredient`, `num` da `src/app/pages/RecipeWizard.tsx`)
- Modify: `src/app/pages/RecipeWizard.tsx` (importa da `../wizard/draft`; lo stato `base` diventa l'intera ricetta originale)
- Test: `src/app/wizard/__tests__/draft.test.ts`

**Interfaces:**
- Produces: `fromRecipe(r: Recipe): Draft`; `toRecipe(d: Draft, original: Recipe): Recipe` — parte da `{ ...original }` e sovrascrive solo i campi gestiti dalla bozza. `Draft` ha `baseCopies: BaseCopy[]` passato così com'è, e `toRecipe` tiene solo le voci la cui `section` esiste ancora tra ingredienti o passaggi. Il campo `recipeId` sparisce da `IngredientDraft`.
- Consumes: il tipo `BaseCopy` di Task 2. Definirlo in questo task in `src/core/model.ts` (vedi Task 2, Interfaces) così Task 1 compila da solo.

- [ ] **Step 1: test che falliscono** in `draft.test.ts`:
  - `conserva i campi fuori bozza`: ricetta con `label: { notes: 'x', allergens: ['latte'] }`, `favorite: true` → `toRecipe(fromRecipe(r), r)` ha gli stessi `label` e `favorite`.
  - `andata e ritorno stabile`: ricetta con step `equipment: undefined` e ingrediente con `note: undefined` → `toRecipe(fromRecipe(r), r)` uguale a `r` su `ingredients` e `steps` (confronto con `toEqual` dopo aver normalizzato `equipment: []` a `undefined` in `toRecipe`: lo stesso `toRecipe` deve emettere `undefined` quando la lista è vuota).
  - `scarta l'origine di una sezione sparita`: `baseCopies: [{ section: 'Crema', ... }]`, bozza senza righe in sezione "Crema" → `toRecipe(...).baseCopies` è `undefined`.
- [ ] **Step 2:** `pnpm test src/app/wizard` → FAIL (modulo inesistente).
- [ ] **Step 3:** spostare il codice in `draft.ts`, cambiare la firma di `toRecipe` e aggiornare `RecipeWizard.tsx`: lo stato `base` diventa `original: Recipe` (per una ricetta nuova, `emptyRecipe()`); `toRecipe(draft, original)` in `save`, `ImportReviewChat` e `PhaseReview`.
- [ ] **Step 4:** `pnpm test` e `pnpm typecheck` → verdi.
- [ ] **Step 5:** commit `Wizard: salvando non perde più etichetta, preferito e gli altri campi fuori bozza`.

### Task 2: Copiare una Base in una ricetta

**Files:**
- Create: `src/core/bases.ts`, `src/core/__tests__/bases.test.ts`
- Modify: `src/core/index.ts` (esporta `bases`)

**Interfaces (Produces):**
```ts
// model.ts — già aggiunto nel Task 1, riportato qui per riferimento
export interface BaseCopy {
  /** Nome della sezione nella ricetta ("Pasticcera", "Pasticcera (2)"). */
  section: string
  baseId: string
  /** Impronta del contenuto della Base al momento della copia (baseFingerprint). */
  baseVersion: string
  /** Quantità chiesta: 300 g, oppure 2 dosi ({ amount: 2, unit: '' }). */
  quantity: Quantity
  /** Prefisso degli id copiati; '' quando gli id sono quelli della Base (Salva come Base). */
  prefix: string
  /** Impronta della sezione appena copiata (sectionFingerprint), per capire se è stata modificata. */
  copied: string
}
// Recipe: baseCopies?: BaseCopy[]

// bases.ts
export const BASE_TAG = 'base'
export function isBase(r: Recipe): boolean
export function setBase(r: Recipe, on: boolean): Recipe
export function isDoseUnit(unit: Unit): boolean            // spostata da compose.ts
export function formatDoses(n: number): string             // spostata da compose.ts
export function baseFactor(q: Quantity | undefined, base: Recipe): { factor: number | null; problem?: string } // spostata da compose.ts
export function baseFingerprint(base: Recipe): string      // ingredienti + passaggi + resa, normalizzati
export function sectionFingerprint(recipe: Recipe, section: string): string
export function wouldCycle(recipes: Recipe[], parentId: string, baseId: string): boolean
export type CopyResult = { ok: true; recipe: Recipe } | { ok: false; problem: string }
export function copyBaseInto(recipe: Recipe, base: Recipe, quantity: Quantity, opts?: { replaceIngredientId?: string }): CopyResult
```

Regole di `copyBaseInto` (decise, da rispettare):
- fattore = `baseFactor(quantity, base)`; se `null` → `{ ok: false, problem }`. Ingredienti copiati = `scaleRecipe(base, factor).ingredients` con la quantità scalata come nuova `quantity` (grammi e millilitri arrotondati a 1 decimale), regole di scalatura conservate.
- sezione = `base.title`, con ` (2)`, ` (3)` se già presente; una sezione interna della Base diventa `"<titolo>: <sezione interna>"`.
- prefisso = slug del titolo (stessa normalizzazione di `splitRecipe`), con `-2`, `-3` se già usato da un'altra copia; id copiato = `${prefix}-${id}`; riscritti anche `{id}` / `{id|...}` nei testi, `parallelWith`, `of` delle percentuali.
- ingredienti: alla posizione della riga sostituita, altrimenti in coda. Passaggi: dopo l'ultimo passaggio che appartiene a una copia già presente, altrimenti all'inizio.
- con `replaceIngredientId`: la riga sparisce; nei passaggi rimasti `{idRiga}` e `{idRiga|...}` diventano il testo `base.title` in minuscolo.
- aggiunge a `baseCopies` `{ section, baseId: base.id, baseVersion: baseFingerprint(base), quantity, prefix, copied: sectionFingerprint(nuova, section) }`.
- `sectionFingerprint`/`baseFingerprint`: JSON di campi normalizzati (stringhe vuote e liste vuote come assenti, numeri arrotondati a 4 decimali, id esclusi, riferimenti nei testi con il prefisso tolto), poi hash stringa (FNV-1a 32 bit in esadecimale).
- `wouldCycle`: vero se `baseId === parentId` o se, seguendo `baseCopies[].baseId` a partire dalla Base, si arriva a `parentId`.

- [ ] **Step 1: test che falliscono** in `bases.test.ts` (fixture: Base `pasticcera` resa 600 g con latte 500 g, tuorli 4 discreti, zucchero 150 g e due passaggi che citano `{latte}` e `{tuorli}`; ricetta `crostata` con righe `frolla 400 g`, `crema pasticcera 300 g` (id `crema`), passaggio `Farcisci con {crema}`):
  - `copia a metà dose sostituendo la riga`: `copyBaseInto(crostata, pasticcera, {amount:300, unit:'g'}, { replaceIngredientId: 'crema' })` → riga `crema` assente; ingredienti `pasticcera-latte` 250 g, `pasticcera-zucchero` 75 g, sezione `Pasticcera`, alla posizione 1; passaggi della Base primi, testi con `{pasticcera-latte}`; passaggio della crostata diventa `Farcisci con crema pasticcera`; `baseCopies[0]` con `quantity {300,'g'}`, `prefix 'pasticcera'`.
  - `la stessa Base due volte`: seconda copia → sezione `Pasticcera (2)`, prefisso `pasticcera-2`, nessun id duplicato.
  - `quantità non utilizzabile`: `{amount:1, unit:'q.b.'}` → `ok: false`; Base senza resa e `{300,'g'}` → `ok: false` con problema che cita il titolo.
  - `impronta stabile`: `sectionFingerprint` uguale prima e dopo `toRecipe(fromRecipe(r), r)` (import da `src/app/wizard/draft` è vietato in core: il test di andata e ritorno con impronta va in `src/app/wizard/__tests__/draft.test.ts`, qui si testa che `equipment: []` vs `undefined` e `note: ''` vs `undefined` diano la stessa impronta).
  - `wouldCycle`: Base A con copia di B; `wouldCycle([A,B], 'B', 'A')` vero; `wouldCycle([A,B], 'X', 'A')` falso.
- [ ] **Step 2:** `pnpm test src/core/__tests__/bases.test.ts` → FAIL.
- [ ] **Step 3:** implementare `bases.ts` e il tipo in `model.ts`; aggiungere a `draft.test.ts` il caso `andata e ritorno non cambia l'impronta di una copia`.
- [ ] **Step 4:** `pnpm test` → verde.
- [ ] **Step 5:** commit `Basi: copia di una Base dentro una ricetta, con origine e impronta`.

### Task 3: Stato delle copie, "Usata in", aggiornamento, cancellazione della Base

**Files:** Modify `src/core/bases.ts`, `src/core/__tests__/bases.test.ts`

**Interfaces (Produces):**
```ts
export type CopyStatus = 'current' | 'outdated' | 'modified' | 'orphan'
// orphan: la Base non esiste più; modified ha la precedenza su outdated
export function copyStatus(recipe: Recipe, copy: BaseCopy, base: Recipe | undefined): CopyStatus
export interface BaseUsage { recipe: Recipe; copy: BaseCopy; status: CopyStatus }
export function baseUsages(recipes: Recipe[], base: Recipe): BaseUsage[]   // solo usi diretti, ordinati per titolo
export function updateBaseCopy(recipe: Recipe, section: string, base: Recipe): CopyResult
export function forgetBase(recipe: Recipe, baseId: string): Recipe        // toglie le voci di baseCopies con quel baseId
```
`updateBaseCopy`: toglie ingredienti e passaggi della sezione (e delle sue sottosezioni `"<sezione>: ..."`), ricopia con la stessa `quantity` e lo stesso `prefix` (fattore ricalcolato sulla resa nuova) nelle stesse posizioni; i riferimenti esterni a id che non esistono più diventano il nome dell'ingrediente tolto; aggiorna `baseVersion` e `copied`. Se `baseFactor` fallisce → `ok: false` con "La resa della Base è cambiata: scegli di nuovo la quantità.".

- [ ] **Step 1: test che falliscono:**
  - `stati`: dopo la copia `current`; Base con zucchero 160 g → `outdated`; copia con zucchero cambiato nella ricetta → `modified` (anche se la Base è cambiata); Base cancellata → `orphan`.
  - `aggiorna tenendo la quantità`: Base con resa portata a 1200 g e ingredienti raddoppiati → dopo `updateBaseCopy` nella crostata resta latte 250 g; `copyStatus` torna `current`.
  - `riferimento esterno a un ingrediente tolto`: passaggio fuori sezione `Spennella con {pasticcera-tuorli}`, Base senza tuorli → testo `Spennella con tuorli`.
  - `aggiorna solo la copia scelta`: con due copie, aggiornare `Pasticcera (2)` non cambia `Pasticcera`.
  - `usi diretti`: `baseUsages` su [crostata, torta senza copie, Base "Crostata pronta" che copia la pasticcera] → crostata e Crostata pronta, non le ricette che copiano Crostata pronta.
  - `forgetBase` toglie l'origine e lascia ingredienti e passaggi.
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** `pnpm test` verde.
- [ ] **Step 5:** commit `Basi: stato delle copie, Usata in e aggiornamento che tiene la quantità`.

### Task 4: Salva come Base con scelta a mano

**Files:** Modify `src/core/bases.ts` (sostituisce `splitRecipe`/`defaultSplitSelection` di `compose.ts`), test in `bases.test.ts`

**Interfaces (Produces):**
```ts
export interface SaveAsBaseOptions { ingredientIds: string[]; stepIds: string[]; title: string; baseId?: string }
export function defaultSelection(recipe: Recipe, section: string): { ingredientIds: string[]; stepIds: string[] } // stessa logica di defaultSplitSelection
export function saveSelectionAsBase(recipe: Recipe, opts: SaveAsBaseOptions, now?: string): { base: Recipe; recipe: Recipe }
```
Regole: la Base nuova ha gli elementi scelti con gli **stessi id**, senza sezione, `tags: ['base']`, `servings` della ricetta, `yield` = somma dei grammi stimati (`estimateGrams` di `label.ts`) se > 0. Nella ricetta gli elementi restano (niente riga collegata), spostati nella sezione `title` (unica come in Task 2): ingredienti raggruppati alla posizione del primo scelto, passaggi raggruppati alla posizione del primo scelto, ordine relativo conservato; si aggiunge `BaseCopy` con `prefix: ''`, `quantity: { amount: 1, unit: '' }`.

- [ ] **Step 1: test che falliscono:** selezione sparsa (ingredienti 1 e 4, passaggi 2 e 5 di una ricetta di 6+6) → Base con quei 2+2 e tag `base`; nella ricetta stessi id, raggruppati, sezione `title`, nessun ingrediente in più; `copyStatus` della nuova copia `current`; riferimenti nei passaggi invariati.
- [ ] **Step 2–4:** FAIL → implementare → verde.
- [ ] **Step 5:** commit `Basi: salva come Base una scelta di ingredienti e passaggi`.

### Task 5: Via il collegamento `recipeId`

**Files:**
- Delete: `src/core/compose.ts`, `src/core/__tests__/compose.test.ts` (i casi ancora validi sono già in `bases.test.ts`)
- Modify: `src/core/model.ts` (via `Ingredient.recipeId`), `src/core/index.ts`, `src/core/label.ts` (`labelItems(recipe, factor)` senza lookup né `parts`; `labelIngredients` resta per i doppioni tra sezioni; `totalGrams(recipe, factor)`), `src/core/shopping.ts` (senza lookup), `src/core/lint.ts` (via i controlli sulle basi collegate), `src/core/steps.ts`, `src/core/share.ts`, `src/app/components/IngredientList.tsx` (via `baseLinks`), `src/app/pages/RecipeView.tsx` (via sezione "Basi" e "Spiana le basi"), `src/app/pages/CookMode.tsx` (via "Basi da preparare"), `src/app/hooks/useRecipeChat.ts` (via il contesto delle basi), `src/data/repo.ts` (cancellando una ricetta: `forgetBase` sulle ricette che la usano, al posto di `detachBase`), `src/app/pages/LabelPage.tsx`, `src/app/pages/ShoppingPage.tsx`, `src/core/__tests__/label.test.ts`, `src/core/__tests__/shopping.test.ts` se usa le basi.

- [ ] **Step 1: test che falliscono** in `label.test.ts`: `ignora un recipeId rimasto` — ingrediente `{ id:'frolla', name:'frolla', quantity:{450,'g'}, recipeId:'x' } as Ingredient` → `labelItems(r, 1)` lo dà come voce semplice senza `parts`. Riscrivere i test esistenti dell'etichetta sulla crostata usando una copia (`copyBaseInto`) al posto del collegamento: stesso risultato di `labelIngredients` (burro sommato una volta sola).
- [ ] **Step 2:** FAIL. **Step 3:** togliere il collegamento nei file elencati; `pnpm typecheck` guida i punti mancanti (`git grep -n "recipeId" src` deve restare solo su sessioni, chat, timer, spesa, suggerimenti).
- [ ] **Step 4:** `pnpm test && pnpm typecheck && pnpm build` verdi.
- [ ] **Step 5:** commit `Basi: tolto il collegamento, le ricette contengono solo ingredienti veri`.

### Task 6: Aggiungi e sostituisci con una Base (wizard e Componi)

**Files:**
- Create: `src/app/components/BasePicker.tsx`
- Modify: `src/app/pages/RecipeWizard.tsx` (fase ingredienti), `src/app/pages/ComposePage.tsx`

**Interfaces:**
- Produces: `BasePicker({ recipes, currentId, initial?, onPick, onClose }: { recipes: Recipe[]; currentId: string; initial?: Quantity; onPick: (base: Recipe, quantity: Quantity) => void; onClose: () => void })` — dialogo con l'elenco delle Basi (`isBase`, escluse quelle con `wouldCycle`), ricerca per titolo, campo quantità con unità `g` / `ml` / dosi (precompilato con `initial`, altrimenti con la resa della Base o 1 dose) e l'errore di `baseFactor` sotto il campo. Se non ci sono Basi: testo "Nessuna Base: segna una ricetta come Base dalla sua pagina." Focus e chiusura con Esc come gli altri dialoghi dell'app (`ConfirmDialog.tsx`).
- Consumes: `copyBaseInto`, `isBase`, `wouldCycle`, `baseFactor` (Task 2); `fromRecipe`/`toRecipe` (Task 1).

- [ ] **Step 1:** nel wizard il select "Aggiungi una base" diventa il bottone **Aggiungi una Base** che apre `BasePicker`; su ogni riga ingrediente un bottone icona **Sostituisci con una Base** (`aria-label` "Sostituisci {nome} con una Base"), che apre `BasePicker` con `initial` = quantità della riga se `baseFactor` la accetta. Alla scelta: `set(fromRecipe(result.recipe))` con `result = copyBaseInto(toRecipe(draft, original), base, q, ...)`. Le righe di una sezione copiata mostrano "Dalla Base «Titolo»" sotto il nome della sezione.
- [ ] **Step 2:** `ComposePage`: la ricetta nuova nasce applicando `copyBaseInto` per ogni Base scelta, nell'ordine, a una ricetta vuota.
- [ ] **Step 3:** prova dal vivo (`pnpm dev`, Playwright): Base Pasticcera da 600 g; ricetta importata con "crema pasticcera 300 g" → Sostituisci → ingredienti a metà, passaggi della crema prima, salva, riapri: tutto c'è; etichetta e spesa mostrano gli ingredienti della crema.
- [ ] **Step 4:** `pnpm test && pnpm typecheck && pnpm build` verdi.
- [ ] **Step 5:** commit `Basi: aggiungi o sostituisci una riga con una Base, nel wizard e in Componi`.

### Task 7: Salva come Base (ex Scomponi)

**Files:** Modify `src/app/pages/SplitPage.tsx` (titolo "Salva come Base"), `src/app/pages/RecipeView.tsx` (voce di menu rinominata), `src/app/App.tsx` (la rotta `/ricetta/:id/scomponi` resta)

- [ ] **Step 1:** la pagina parte da `defaultSelection` della sezione in `?sezione=` (o da niente) e lascia spuntare e togliere ogni ingrediente e passaggio della ricetta, con un selettore di sezione per riempire la selezione in un colpo; campo titolo obbligatorio; bottone **Salva come Base** → `saveSelectionAsBase`, salva entrambe le ricette, va alla Base nuova.
- [ ] **Step 2:** prova dal vivo: ricetta con la crema mescolata al resto, scelta a mano di 3 ingredienti e 2 passaggi → Base creata, ricetta con sezione nuova e nient'altro cambiato.
- [ ] **Step 3:** verdi i tre comandi. **Step 4:** commit `Basi: Salva come Base con scelta a mano`.

### Task 8: Pagina della Base: segnala, Usata in, aggiorna

**Files:**
- Create: `src/app/components/BaseUsagePanel.tsx`
- Modify: `src/app/pages/RecipeView.tsx`, `src/app/pages/RecipeWizard.tsx` (dopo il salvataggio)

**Interfaces:**
- Produces: `BaseUsagePanel({ base, recipes, autoOpenUpdate }: { base: Recipe; recipes: Recipe[]; autoOpenUpdate: boolean })`.
- Consumes: `isBase`, `setBase`, `baseUsages`, `updateBaseCopy` (Task 2–3); `saveRecipe` (`src/data/repo.ts`).

- [ ] **Step 1:** in `RecipeView` un interruttore **È una Base** (`setBase` + `saveRecipe`); le ricette con copie mostrano sotto ogni sezione copiata "Dalla Base «Titolo»" con link alla Base e, se `outdated`, "La Base è cambiata" con il bottone **Aggiorna** (conferma se `modified`).
- [ ] **Step 2:** per una Base, `BaseUsagePanel` mostra **Usata in**: ogni ricetta con lo stato in parole ("uguale", "la Base è cambiata", "modificata nella ricetta", "aggiornata"). Se qualche uso è `outdated` o `modified` con Base cambiata: bottone **Aggiorna le ricette** che apre un dialogo con caselle (spuntate le `outdated`, non spuntate le `modified` con l'avviso "Aggiornando perdi le modifiche fatte in questa ricetta"), **Aggiorna** e **Non ora**. Le ricette non aggiornabili (`ok: false`) restano non spuntabili, col motivo.
- [ ] **Step 3:** nel wizard, dopo `saveRecipe`, se la ricetta è una Base, `baseFingerprint` è cambiata e `baseUsages` non è vuoto, navigare a `/ricetta/:id?aggiorna=1`; `RecipeView` passa `autoOpenUpdate` quando c'è `aggiorna=1` e poi lo toglie dall'URL.
- [ ] **Step 4:** prova dal vivo: correggi la Pasticcera usata in due ricette (una modificata a mano) → dialogo con una spuntata e una no; Aggiorna → la prima ha i valori nuovi alla stessa quantità, la seconda invariata.
- [ ] **Step 5:** verdi i tre comandi; commit `Basi: Usata in, aggiornamento delle ricette a scelta, interruttore È una Base`.

### Task 9: Documentazione e verifica finale

**Files:** `docs/MODELLO-DATI.md` (sezione Ricette composte riscritta: copia, `baseCopies`, impronte, aggiornamento; riga `label` e `recipeId` nel modello), `docs/COME-TESTARE.md` (sezione 2f riscritta con i giri delle prove dal vivo dei Task 6–8), `docs/ROADMAP.md` (voce fatta), `README.md` se cita il collegamento.

- [ ] **Step 1:** aggiornare i documenti.
- [ ] **Step 2:** `pnpm test && pnpm typecheck && pnpm build` verdi; `git grep -n "recipeId" src` solo su sessioni, chat, timer, spesa, suggerimenti.
- [ ] **Step 3:** revisione di tutto il ramo da un revisore fresco (Opus) sul diff da `b8f3c02`.
- [ ] **Step 4:** commit `Basi: documentazione`; push solo con l'ok di Paolo.
