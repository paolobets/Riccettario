import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { saveRecipe } from '@/data/repo'
import { ALLERGENS, allergenLabel, collectAllergens, labelItems, totalGrams, type AllergenId, type LabelInfo, type LabelItem } from '@/core'
import Icon from '../components/Icon'
import NotFound from './NotFound'

const LOGO_KEY = 'label-logo'
const FORMAT_KEY = 'etichetta:formato'
const FORMATS = [
  { id: '70x50', label: 'Etichetta 70×50 mm', w: 70, h: 50 },
  { id: '100x70', label: 'Etichetta 100×70 mm', w: 100, h: 70 },
  { id: 'a6', label: 'Cartoncino A6 (105×148 mm)', w: 105, h: 148 },
] as const
type FormatId = (typeof FORMATS)[number]['id']

interface PrintSetup {
  format: FormatId
  sheet: boolean
  copies: number
}

function loadSetup(): PrintSetup {
  try {
    const v = JSON.parse(localStorage.getItem(FORMAT_KEY) ?? '{}') as Partial<PrintSetup>
    return { format: FORMATS.some((f) => f.id === v.format) ? v.format! : '100x70', sheet: v.sheet ?? false, copies: Math.min(24, Math.max(1, v.copies ?? 1)) }
  } catch {
    return { format: '100x70', sheet: false, copies: 1 }
  }
}

/** Riduce il logo a 480 px di lato e lo salva come immagine, così l'etichetta resta leggera. */
async function shrinkImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Immagine non leggibile'))
      i.src = url
    })
    const scale = Math.min(1, 480 / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function ItemText({ item }: { item: LabelItem }): ReactNode {
  const name = item.allergens.length > 0 && !item.parts ? <b className="uppercase">{item.name}</b> : item.name
  if (!item.parts) return name
  return (
    <>
      {name} (
      {item.parts.map((p, i) => (
        <span key={`${p.name}-${i}`}>
          {i > 0 ? ', ' : ''}
          <ItemText item={p} />
        </span>
      ))}
      )
    </>
  )
}

/** Etichetta da stampare o salvare in PDF: ingredienti in ordine di peso, allergeni evidenziati, logo. */
export default function LabelPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const rawF = Number(params.get('f'))
  const factor = Number.isFinite(rawF) && rawF > 0 ? rawF : 1
  const recipe = useLiveQuery(async () => (id ? ((await db.recipes.get(id)) ?? null) : null), [id])
  const allRecipes = useLiveQuery(() => db.recipes.toArray(), [])
  const logo = useLiveQuery(async () => ((await db.settings.get(LOGO_KEY))?.value as string | undefined) ?? null, [])
  const [info, setInfo] = useState<LabelInfo | null>(null)
  const [producedOn, setProducedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [setup, setSetup] = useState<PrintSetup>(() => loadSetup())
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (recipe && info === null) setInfo(recipe.label ?? {})
  }, [recipe, info])
  useEffect(() => {
    try {
      localStorage.setItem(FORMAT_KEY, JSON.stringify(setup))
    } catch {
      // storage non disponibile
    }
  }, [setup])

  const lookup = useMemo(() => {
    const byId = new Map((allRecipes ?? []).map((r) => [r.id, r]))
    return (rid: string) => byId.get(rid)
  }, [allRecipes])
  const items = useMemo(() => (recipe ? labelItems(recipe, factor, lookup) : []), [recipe, factor, lookup])
  const detected = useMemo(() => collectAllergens(items), [items])

  if (recipe === undefined || logo === undefined) return null
  if (recipe === null || !info) return <NotFound what="ricetta" />
  const confirmed = new Set<AllergenId>((info.allergens as AllergenId[] | undefined) ?? detected)
  const fmt = FORMATS.find((f) => f.id === setup.format)!
  const grams = totalGrams(recipe, factor, lookup)
  const expiry = info.shelfLifeDays ? new Date(new Date(producedOn).getTime() + info.shelfLifeDays * 86_400_000) : null
  const baseFont = fmt.w < 80 ? '7.5pt' : fmt.w < 110 ? '9pt' : '10.5pt'

  const persist = async (next: LabelInfo) => {
    setInfo(next)
    setSaved(false)
  }
  const save = async () => {
    const clean: LabelInfo = Object.fromEntries(Object.entries(info).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0 && false))) as LabelInfo
    await saveRecipe({ ...recipe, label: Object.keys(clean).length ? clean : undefined })
    setSaved(true)
  }
  const print = async () => {
    await save()
    window.print()
  }
  const toggleAllergen = (a: AllergenId) => {
    const next = new Set(confirmed)
    if (next.has(a)) next.delete(a)
    else next.add(a)
    persist({ ...info, allergens: ALLERGENS.map((x) => x.id).filter((x) => next.has(x)) })
  }

  const label = (
    <div className="label flex flex-col gap-[0.6em] bg-surface text-fg" style={{ width: `${fmt.w}mm`, minHeight: `${fmt.h}mm`, fontSize: baseFont, padding: '3mm', boxSizing: 'border-box' }}>
      <div className="flex items-start gap-[2mm]">
        {logo && <img src={logo} alt="" style={{ maxHeight: '12mm', maxWidth: '30%', objectFit: 'contain' }} />}
        <div className="min-w-0 flex-1">
          <p className="font-display leading-tight font-semibold" style={{ fontSize: '1.6em' }}>
            {recipe.title}
          </p>
          {info.producer && <p style={{ fontSize: '0.9em' }}>{info.producer}</p>}
        </div>
      </div>
      <p className="leading-snug">
        <b>Ingredienti:</b>{' '}
        {items.map((it, i) => (
          <span key={`${it.name}-${i}`}>
            {i > 0 ? ', ' : ''}
            <ItemText item={it} />
          </span>
        ))}
        .
      </p>
      {confirmed.size > 0 && (
        <p>
          <b>Contiene:</b> {[...confirmed].map((a) => allergenLabel(a)).join(', ')}.
        </p>
      )}
      {info.mayContain && <p>Può contenere tracce di {info.mayContain}.</p>}
      <div className="mt-auto flex flex-wrap gap-x-[3mm] gap-y-0 leading-snug" style={{ fontSize: '0.9em' }}>
        {info.netWeight && <span>Peso netto: {info.netWeight}</span>}
        <span>Prodotto il {formatDate(new Date(producedOn))}</span>
        {expiry && <span>Da consumarsi entro il {formatDate(expiry)}</span>}
        {info.storage && <span>{info.storage}</span>}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <style>{`@media print { @page { size: ${setup.sheet ? 'A4' : `${fmt.w}mm ${fmt.h}mm`}; margin: ${setup.sheet ? '10mm' : '0'}; } .label-sheet { display: ${setup.sheet ? 'flex' : 'block'}; flex-wrap: wrap; gap: 4mm; } .label-sheet .label { border: ${setup.sheet ? '0.2mm dashed #999' : 'none'}; break-inside: avoid; } }`}</style>
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="min-w-0 flex-1 basis-40">
          <h1 className="text-3xl font-medium text-fg">Etichetta</h1>
          <p className="text-sm text-muted">
            <Link to={`/ricetta/${recipe.id}${params.toString() ? `?${params}` : ''}`} className="text-accent-text underline-offset-2 hover:underline">
              {recipe.title}
            </Link>
            {Math.abs(factor - 1) > 1e-9 ? `, fattore ×${factor}` : ''}, circa {Math.round(grams)} g di ingredienti.
          </p>
        </div>
        <button className="btn-primary shrink-0" onClick={print}>
          <Icon name="printer" size={16} /> Stampa o salva PDF
        </button>
      </div>

      <section className="print:hidden">
        <h2 className="section-title mb-2 text-lg">Anteprima</h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface-2 p-4">
          <div className="inline-block border border-line shadow-sm">{label}</div>
        </div>
        <p className="mt-2 text-xs text-muted">Gli ingredienti sono in ordine decrescente di peso, le basi tra parentesi, gli allergeni in maiuscolo. È un aiuto a scrivere l'etichetta: controlla sempre le etichette dei prodotti che usi e le regole per la vendita.</p>
      </section>

      <div className="label-sheet hidden print:block">
        {Array.from({ length: setup.copies }, (_, i) => (
          <div key={i}>{label}</div>
        ))}
      </div>

      <section className="rule space-y-3 pt-4 print:hidden">
        <h2 className="section-title text-lg">Allergeni</h2>
        <p className="text-sm text-muted">Riconosciuti dai nomi degli ingredienti{detected.length ? `: ${detected.map((a) => allergenLabel(a)).join(', ')}` : ': nessuno'}. Spunta quelli giusti: la scelta resta salvata con la ricetta.</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
          {ALLERGENS.map((a) => (
            <label key={a.id} className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-accent" checked={confirmed.has(a.id)} onChange={() => toggleAllergen(a.id)} />
              <span className={detected.includes(a.id) && !confirmed.has(a.id) ? 'text-warning' : ''}>{a.label}</span>
            </label>
          ))}
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-fg-2">Può contenere tracce di</span>
          <input className="w-full" value={info.mayContain ?? ''} onChange={(e) => persist({ ...info, mayContain: e.target.value })} placeholder="frutta a guscio, sesamo" />
        </label>
      </section>

      <section className="rule space-y-3 pt-4 print:hidden">
        <h2 className="section-title text-lg">Dati dell'etichetta</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-fg-2">Peso netto</span>
            <input className="w-full" value={info.netWeight ?? ''} onChange={(e) => persist({ ...info, netWeight: e.target.value })} placeholder={`${Math.round(grams)} g`} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-fg-2">Prodotto il</span>
            <input className="w-full" type="date" value={producedOn} onChange={(e) => setProducedOn(e.target.value || new Date().toISOString().slice(0, 10))} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-fg-2">Dura, in giorni</span>
            <input className="w-full" type="number" min={0} value={info.shelfLifeDays ?? ''} onChange={(e) => persist({ ...info, shelfLifeDays: e.target.value ? Number(e.target.value) : undefined })} placeholder="3" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-fg-2">Conservazione</span>
            <input className="w-full" value={info.storage ?? ''} onChange={(e) => persist({ ...info, storage: e.target.value })} placeholder="Conservare in frigorifero a +4 °C" />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-fg-2">Prodotto da</span>
            <input className="w-full" value={info.producer ?? ''} onChange={(e) => persist({ ...info, producer: e.target.value })} placeholder="Nome e indirizzo, come vuoi che compaia" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-secondary" onClick={save}>
            Salva nella ricetta
          </button>
          {saved && <span className="text-sm text-success">Salvato.</span>}
        </div>
      </section>

      <section className="rule space-y-3 pt-4 print:hidden">
        <h2 className="section-title text-lg">Logo e formato</h2>
        <div className="flex flex-wrap items-center gap-3">
          {logo ? (
            <>
              <img src={logo} alt="Logo attuale" className="h-12 w-auto rounded border border-line bg-surface p-1" />
              <button className="btn-ghost text-danger" onClick={() => db.settings.delete(LOGO_KEY)}>
                Togli il logo
              </button>
            </>
          ) : (
            <p className="text-sm text-muted">Nessun logo: compare in alto a sinistra su tutte le etichette. Resta su questo dispositivo.</p>
          )}
          <label className="btn-secondary cursor-pointer">
            <Icon name="upload" size={16} /> {logo ? 'Cambia logo' : 'Carica un logo'}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                try {
                  await db.settings.put({ key: LOGO_KEY, value: await shrinkImage(f) })
                  setMessage(null)
                } catch {
                  setMessage('Non riesco a leggere questa immagine: prova con un PNG o un JPG.')
                }
              }}
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-fg-2">Formato</span>
            <select className="w-full" value={setup.format} onChange={(e) => setSetup({ ...setup, format: e.target.value as FormatId })}>
              {FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-fg-2">Copie</span>
            <input className="w-full" type="number" min={1} max={24} value={setup.copies} onChange={(e) => setSetup({ ...setup, copies: Math.min(24, Math.max(1, Number(e.target.value) || 1)) })} />
          </label>
          <label className="flex min-h-10 items-center gap-2 self-end text-sm">
            <input type="checkbox" className="h-5 w-5 accent-accent" checked={setup.sheet} onChange={(e) => setSetup({ ...setup, sheet: e.target.checked })} />
            Su foglio A4, da ritagliare
          </label>
        </div>
        <p className="text-xs text-muted">Senza foglio A4 ogni etichetta è una pagina della misura scelta: va bene per le stampanti di etichette e per salvare un PDF. Sul telefono: Stampa, poi "Salva come PDF" o condividi.</p>
        {message && (
          <p className="text-sm text-danger" role="alert">
            {message}
          </p>
        )}
      </section>
    </div>
  )
}
