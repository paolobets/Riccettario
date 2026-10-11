import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { saveRecipe } from '@/data/repo'
import { decodeRecipeFromLink, formatIngredientLine, newId, type Recipe } from '@/core'
import Icon from '../components/Icon'

/** Apre un link che contiene una ricetta (/condivisa#r=…) e propone di salvarla. */
export default function SharedPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const decoded = useMemo(() => {
    const m = /(?:^|[#&])r=([^&]+)/.exec(location.hash)
    return m ? decodeRecipeFromLink(m[1]!) : null
  }, [location.hash])

  if (!decoded) {
    return (
      <section className="py-10 text-center">
        <Icon name="share" size={40} className="mx-auto mb-3 text-muted" />
        <h1 className="text-2xl font-medium text-fg">Link non leggibile</h1>
        <p className="mt-1 text-fg-2">Il link è incompleto o non contiene una ricetta. Chiedi di mandartelo di nuovo.</p>
        <Link to="/" className="btn-primary mt-4">
          Vai alle ricette
        </Link>
      </section>
    )
  }

  const save = async () => {
    setBusy(true)
    const now = new Date().toISOString()
    const recipe: Recipe = { ...decoded, id: newId('r'), createdAt: now, updatedAt: now }
    await saveRecipe(recipe)
    navigate(`/ricetta/${recipe.id}`, { replace: true })
  }

  return (
    <article className="space-y-4">
      <p className="text-sm text-muted">Ricetta condivisa con te</p>
      <h1 className="text-4xl font-medium leading-tight text-fg">{decoded.title}</h1>
      {decoded.description && <p className="text-lg text-fg-2">{decoded.description}</p>}
      <p className="text-sm text-muted">
        {decoded.servings} porzioni, {decoded.ingredients.length} ingredienti, {decoded.steps.length} passaggi
      </p>
      <button className="btn-primary w-full py-3 text-lg" onClick={save} disabled={busy}>
        <Icon name="download" size={20} /> Salva nel ricettario
      </button>
      <section className="rule pt-4">
        <h2 className="section-title mb-2">Ingredienti</h2>
        <ul className="space-y-1 text-fg-2">
          {decoded.ingredients.map((i) => (
            <li key={i.id}>{formatIngredientLine(i.name, i.quantity)}</li>
          ))}
        </ul>
      </section>
      <p className="text-sm text-muted">Dopo il salvataggio potrai cambiare le porzioni, cucinarla passo per passo e modificarla: sarà una copia tua.</p>
    </article>
  )
}
