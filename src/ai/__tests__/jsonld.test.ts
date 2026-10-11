import { describe, expect, it } from 'vitest'
import { extractJsonLd, findRecipe, humanDuration, instructionLines, parseServings, recipeTextFromHtml } from '../jsonld'

const page = `<!doctype html><html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Sito"}</script>
<script type='application/ld+json'>
{"@context":"https://schema.org","@graph":[
 {"@type":"Organization","name":"Cucina"},
 {"@type":["Recipe","NewsArticle"],"name":"Pasta e fagioli","description":"Il classico &amp; sostanzioso.",
  "recipeYield":["4","4 porzioni"],"prepTime":"PT15M","cookTime":"PT1H",
  "author":{"@type":"Person","name":"Nonna Pina"},
  "recipeIngredient":["200 g di fagioli borlotti secchi","160 g di ditalini","1 rametto di rosmarino","sale q.b."],
  "recipeInstructions":[
    {"@type":"HowToSection","name":"Fagioli","itemListElement":[{"@type":"HowToStep","text":"Metti a bagno i fagioli per 12 ore."}]},
    {"@type":"HowToStep","text":"Cuoci la pasta nel brodo di fagioli.<br>Servi con olio."}
  ]}
]}
</script>
</head><body>…</body></html>`

describe('json-ld', () => {
  it('estrae tutti i blocchi e trova la ricetta dentro @graph', () => {
    const nodes = extractJsonLd(page)
    expect(nodes).toHaveLength(2)
    const r = findRecipe(nodes)
    expect(r?.['name']).toBe('Pasta e fagioli')
  })
  it('ignora i blocchi non validi', () => {
    expect(extractJsonLd('<script type="application/ld+json">{non json</script>')).toEqual([])
  })
  it('legge porzioni e durate', () => {
    expect(parseServings(['4', '4 porzioni'])).toBe(4)
    expect(parseServings('Serves 6-8')).toBe(6)
    expect(parseServings(undefined)).toBeUndefined()
    expect(humanDuration('PT1H30M')).toBe('1 h 30 min')
    expect(humanDuration('PT45M')).toBe('45 min')
    expect(humanDuration('circa un\'ora')).toBe("circa un'ora")
  })
  it('appiattisce sezioni e passaggi con HTML', () => {
    const lines = instructionLines([
      { '@type': 'HowToSection', name: 'Crema', itemListElement: [{ '@type': 'HowToStep', text: 'Monta i tuorli.' }] },
      'Inzuppa i savoiardi.<br>Componi gli strati.',
    ])
    expect(lines).toEqual(['[Crema] Monta i tuorli.', 'Inzuppa i savoiardi.', 'Componi gli strati.'])
  })
  it('produce il testo per l\'import', () => {
    const r = recipeTextFromHtml(page, 'https://esempio.it/pasta-e-fagioli')
    expect(r).not.toBeNull()
    expect(r!.title).toBe('Pasta e fagioli')
    expect(r!.servings).toBe(4)
    expect(r!.text).toContain('Il classico & sostanzioso.')
    expect(r!.text).toContain('Porzioni: 4')
    expect(r!.text).toContain('Preparazione: 15 min, Cottura: 1 h')
    expect(r!.text).toContain('- 200 g di fagioli borlotti secchi')
    expect(r!.text).toContain('1. [Fagioli] Metti a bagno i fagioli per 12 ore.')
    expect(r!.text).toContain('3. Servi con olio.')
    expect(r!.text).toContain('Fonte: Nonna Pina, https://esempio.it/pasta-e-fagioli')
  })
  it('restituisce null senza dati strutturati o senza ingredienti', () => {
    expect(recipeTextFromHtml('<html><body>Solo testo</body></html>')).toBeNull()
    expect(recipeTextFromHtml('<script type="application/ld+json">{"@type":"Recipe","name":"Vuota"}</script>')).toBeNull()
  })
})
