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
```

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

- **Porzioni**: F = porzioni richieste / porzioni della ricetta.
- **Resa**: F = resa richiesta / resa della ricetta (serve `yield`).
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
  parallelWith?: string       // previsto: passaggio che può correre in parallelo
}
```

`renderStep` in `steps.ts` sostituisce i riferimenti con la quantità già scalata ("350 g di acqua"), così lettura e modalità cucina mostrano sempre i numeri giusti.

## Sessioni di cottura

Ogni avvio della modalità cucina crea una `CookSession` (ricetta, fattore, data) che alla fine riceve voto e note. È la base per la futura evoluzione assistita delle ricette.
