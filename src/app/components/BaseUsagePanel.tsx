import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { saveRecipe } from '@/data/repo'
import { baseFingerprint, baseUsages, copyStatus, formatDoses, formatQuantity, isDoseUnit, updateBaseCopy, type BaseCopy, type BaseUsage, type Recipe } from '@/core'
import Icon from './Icon'
import { useConfirm } from './ConfirmDialog'

function quantityText(c: BaseCopy): string {
  return isDoseUnit(c.quantity.unit) ? formatDoses(c.quantity.amount) : formatQuantity(c.quantity)
}

/** Lo stato di una copia in parole. */
function statusText(u: BaseUsage, base: Recipe): string {
  const changed = baseFingerprint(base) !== u.copy.baseVersion
  switch (u.status) {
    case 'current':
      return 'uguale alla Base'
    case 'outdated':
      return 'la Base è cambiata'
    case 'modified':
      return changed ? 'modificata nella ricetta, e la Base è cambiata' : 'modificata nella ricetta'
    case 'orphan':
      return 'Base cancellata'
  }
}

/** Si propone di aggiornare una copia quando la Base è cambiata dopo la copia. */
function canOffer(u: BaseUsage, base: Recipe): boolean {
  return baseFingerprint(base) !== u.copy.baseVersion
}

const usageKey = (u: BaseUsage) => `${u.recipe.id}|${u.copy.section}`

/** Aggiorna le copie scelte; più copie nella stessa ricetta si applicano una dopo l'altra. */
async function applyUpdates(usages: BaseUsage[], base: Recipe): Promise<number> {
  const byRecipe = new Map<string, { recipe: Recipe; sections: string[] }>()
  for (const u of usages) {
    const entry = byRecipe.get(u.recipe.id) ?? { recipe: u.recipe, sections: [] }
    entry.sections.push(u.copy.section)
    byRecipe.set(u.recipe.id, entry)
  }
  let done = 0
  for (const { recipe, sections } of byRecipe.values()) {
    let next = recipe
    for (const s of sections) {
      const res = updateBaseCopy(next, s, base)
      if (res.ok) {
        next = res.recipe
        done++
      }
    }
    if (next !== recipe) await saveRecipe(next)
  }
  return done
}

function UpdateDialog({ base, usages, onClose }: { base: Recipe; usages: BaseUsage[]; onClose: (updated: number | null) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const problems = useMemo(() => new Map(usages.map((u) => [usageKey(u), (() => {
    const r = updateBaseCopy(u.recipe, u.copy.section, base)
    return r.ok ? null : r.problem
  })()])), [usages, base])
  const [selected, setSelected] = useState<Set<string>>(() => new Set(usages.filter((u) => u.status === 'outdated' && !problems.get(usageKey(u))).map(usageKey)))
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])
  const flip = (k: string) => {
    const next = new Set(selected)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    setSelected(next)
  }
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby="update-title"
      className="w-full max-w-lg"
      onCancel={(e) => {
        e.preventDefault()
        onClose(null)
      }}
    >
      <h2 id="update-title" className="section-title text-xl">
        Aggiornare le ricette con «{base.title}»?
      </h2>
      <p className="mt-2 text-fg-2">Scegli quali ricette prendono la versione nuova della Base, alla stessa quantità. Le altre restano come sono: le puoi aggiornare più tardi da qui.</p>
      <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto">
        {usages.map((u) => {
          const k = usageKey(u)
          const problem = problems.get(k)
          return (
            <li key={k}>
              <label className={`flex min-h-12 items-start gap-3 py-2 ${problem ? 'opacity-60' : 'cursor-pointer'}`}>
                <input type="checkbox" className="mt-0.5 h-5 w-5 accent-accent" checked={selected.has(k)} disabled={Boolean(problem)} onChange={() => flip(k)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-fg">
                    {u.recipe.title}
                    {u.copy.section !== base.title && <span className="text-muted"> ({u.copy.section})</span>}
                  </span>
                  <span className="block text-xs text-muted">{statusText(u, base)}</span>
                  {u.status === 'modified' && !problem && <span className="block text-xs text-warning">Aggiornando perdi le modifiche fatte in questa ricetta.</span>}
                  {problem && <span className="block text-xs text-warning">{problem}</span>}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => onClose(null)}>
          Non ora
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={selected.size === 0 || busy}
          onClick={async () => {
            setBusy(true)
            const n = await applyUpdates(usages.filter((u) => selected.has(usageKey(u))), base)
            onClose(n)
          }}
        >
          {busy ? 'Aggiorno…' : selected.size > 1 ? `Aggiorna ${selected.size} ricette` : 'Aggiorna'}
        </button>
      </div>
    </dialog>,
    document.body,
  )
}

/** Pagina di una Base: dove è usata, con lo stato di ogni copia, e l'aggiornamento a scelta. */
export default function BaseUsagePanel({ base, recipes, autoOpenUpdate }: { base: Recipe; recipes: Recipe[]; autoOpenUpdate: boolean }) {
  const usages = useMemo(() => baseUsages(recipes, base), [recipes, base])
  const offer = usages.filter((u) => canOffer(u, base))
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const autoOpened = useRef(false)
  useEffect(() => {
    if (autoOpenUpdate && !autoOpened.current && offer.length > 0) {
      autoOpened.current = true
      setOpen(true)
    }
  }, [autoOpenUpdate, offer.length])

  return (
    <section className="rule pt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">Usata in</h2>
        {offer.length > 0 && (
          <button className="btn-secondary min-h-10 px-3 py-1.5 text-sm print:hidden" onClick={() => setOpen(true)}>
            Aggiorna le ricette
          </button>
        )}
      </div>
      {usages.length === 0 ? (
        <p className="text-sm text-muted">Nessuna ricetta usa ancora questa Base. Per usarla: nel wizard di una ricetta, Aggiungi una Base o Sostituisci con una Base.</p>
      ) : (
        <ul className="divide-y divide-line">
          {usages.map((u) => (
            <li key={usageKey(u)} className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-3 py-2">
              <Link to={`/ricetta/${u.recipe.id}`} className="text-fg hover:text-accent-text">
                {u.recipe.title}
                {u.copy.section !== base.title && <span className="text-muted"> ({u.copy.section})</span>}
              </Link>
              <span className={`text-sm ${u.status === 'current' ? 'text-muted' : 'text-warning'}`}>
                {quantityText(u.copy)}, {statusText(u, base)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p className="mt-2 text-sm text-fg-2" role="status">
          {message}
        </p>
      )}
      {open && (
        <UpdateDialog
          base={base}
          usages={offer}
          onClose={(n) => {
            setOpen(false)
            if (n !== null) setMessage(n === 1 ? 'Una ricetta aggiornata.' : `${n} ricette aggiornate.`)
          }}
        />
      )}
    </section>
  )
}

/** In una ricetta: le sezioni copiate da una Base, con lo stato e l'aggiornamento della singola copia. */
export function BaseCopiesPanel({ recipe, recipes }: { recipe: Recipe; recipes: Recipe[] }) {
  const { confirm, dialog } = useConfirm()
  const [problem, setProblem] = useState<string | null>(null)
  const copies = recipe.baseCopies ?? []
  if (copies.length === 0) return null
  const byId = new Map(recipes.map((r) => [r.id, r]))
  return (
    <div className="mt-3 space-y-1 text-sm">
      {dialog}
      {copies.map((c) => {
        const base = byId.get(c.baseId)
        const status = copyStatus(recipe, c, base)
        const changed = base ? baseFingerprint(base) !== c.baseVersion : false
        return (
          <p key={c.section} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
            <Icon name="book" size={14} />
            <span>
              {c.section}: {base ? (
                <>
                  dalla Base <Link to={`/ricetta/${base.id}`} className="text-accent-text underline-offset-2 hover:underline">«{base.title}»</Link>, {quantityText(c)}
                </>
              ) : (
                "copiata da una Base che non c'è più"
              )}
              {status === 'modified' && ', modificata qui'}
              {changed && <span className="text-warning">. La Base è cambiata</span>}
            </span>
            {base && changed && (
              <button
                className="btn-ghost min-h-9 px-2 py-1 text-sm print:hidden"
                onClick={async () => {
                  if (status === 'modified') {
                    const ok = await confirm({
                      title: `Aggiornare «${c.section}»?`,
                      body: 'La sezione prende la versione nuova della Base, alla stessa quantità. Le modifiche fatte in questa ricetta si perdono.',
                      confirmLabel: 'Aggiorna e perdi le modifiche',
                      cancelLabel: 'Tieni la mia versione',
                      danger: true,
                    })
                    if (!ok) return
                  }
                  const res = updateBaseCopy(recipe, c.section, base)
                  if (!res.ok) {
                    setProblem(res.problem)
                    return
                  }
                  setProblem(null)
                  await saveRecipe(res.recipe)
                }}
              >
                Aggiorna
              </button>
            )}
          </p>
        )
      })}
      {problem && <p className="text-warning">{problem}</p>}
    </div>
  )
}
