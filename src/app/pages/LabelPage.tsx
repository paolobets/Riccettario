import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { saveRecipe } from '@/data/repo'
import { ALLERGENS, allergenLabel, collectAllergens, labelIngredients, labelItems, totalGrams, type AllergenId, type LabelInfo } from '@/core'
import Icon from '../components/Icon'
import NotFound from './NotFound'

const LOGO_KEY = 'label-logo'
const FORMAT_KEY = 'etichetta:formato'
/**
 * Formati con il loro corpo del testo e l'altezza del logo. Il corpo resta sopra
 * l'altezza minima della x chiesta dal reg. UE 1169/2011 (1,2 mm, 0,9 mm sotto gli 80 cm²).
 */
const FORMATS = [
  { id: '70x50', label: 'Etichetta 70×50 mm', w: 70, h: 50, font: '7pt', logo: 9 },
  { id: '100x70', label: 'Etichetta 100×70 mm', w: 100, h: 70, font: '8pt', logo: 12 },
  { id: '100x100', label: 'Etichetta 100×100 mm', w: 100, h: 100, font: '8.5pt', logo: 14 },
  { id: '100x150', label: 'Etichetta 100×150 mm', w: 100, h: 150, font: '9.5pt', logo: 16 },
  { id: 'a6', label: 'Cartoncino A6 (105×148 mm)', w: 105, h: 148, font: '9.5pt', logo: 16 },
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

const MM_TO_PX = 96 / 25.4
const DEFAULT_STATEMENT = 'Prodotto artigianale, preparato in casa'

/** Titoletto di una sezione dell'etichetta, in grassetto. */
function LabelHeading({ children }: { children: ReactNode }) {
  return (
    <p className="font-bold text-fg" style={{ fontSize: '1.05em', marginBottom: '0.15em' }}>
      {children}
    </p>
  )
}

/** Elenco puntato dell'etichetta, su due colonne quando le voci sono tante. */
function LabelList({ children, columns }: { children: ReactNode; columns: number }) {
  return (
    <ul className="list-disc leading-snug marker:text-accent" style={{ paddingLeft: '1.15em', columnCount: columns, columnGap: '1.2em' }}>
      {children}
    </ul>
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
  const ingredients = useMemo(() => labelIngredients(items), [items])
  const previewRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState(false)
  // Il contenuto che supera l'altezza del formato in stampa finirebbe su una seconda pagina.
  useLayoutEffect(() => {
    const el = previewRef.current
    if (!el) return
    const paper = el.firstElementChild
    if (!paper) return
    const over = paper.getBoundingClientRect().height > Number(el.dataset.h) * MM_TO_PX + 1
    if (over !== overflow) setOverflow(over)
  })

  if (recipe === undefined || logo === undefined) return null
  if (recipe === null || !info) return <NotFound what="ricetta" />
  const confirmed = new Set<AllergenId>((info.allergens as AllergenId[] | undefined) ?? detected)
  const fmt = FORMATS.find((f) => f.id === setup.format)!
  const grams = totalGrams(recipe, factor, lookup)
  const expiry = info.shelfLifeDays ? new Date(new Date(producedOn).getTime() + info.shelfLifeDays * 86_400_000) : null
  const baseFont = fmt.font

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

  const small = fmt.h < 80
  const allergenList = ALLERGENS.filter((a) => confirmed.has(a.id))
  // Sui formati orizzontali ingredienti e allergeni stanno affiancati, su quelli verticali uno sotto l'altro.
  const landscape = fmt.w > fmt.h
  const hasAllergenBlock = confirmed.size > 0 || !!info.mayContain
  const sideBySide = landscape && hasAllergenBlock
  const ingredientColumns = ingredients.length > (sideBySide ? 7 : small ? 3 : 5) ? 2 : 1
  const notes = info.notes?.trim()
  const statement = info.showStatement ? (info.statement ?? DEFAULT_STATEMENT).trim() : ''
  const label = (
    <div
      className="label label-paper flex flex-col bg-surface text-fg"
      style={{ width: `${fmt.w}mm`, minHeight: `${fmt.h}mm`, fontSize: baseFont, padding: small ? '2.5mm' : '4mm', gap: small ? '0.45em' : '0.7em', boxSizing: 'border-box' }}
    >
      <div className="flex items-center border-b border-accent" style={{ gap: '2.5mm', paddingBottom: small ? '1.5mm' : '2.5mm', borderBottomWidth: '0.4mm' }}>
        {logo && <img src={logo} alt="" className="shrink-0" style={{ height: `${fmt.logo}mm`, maxWidth: '35%', objectFit: 'contain' }} />}
        <p className="min-w-0 flex-1 font-display leading-tight font-semibold text-fg" style={{ fontSize: small ? '1.55em' : '1.85em', overflowWrap: 'anywhere' }}>
          {recipe.title}
        </p>
      </div>

      <div style={sideBySide ? { display: 'grid', gridTemplateColumns: ingredientColumns === 2 ? '2fr 1fr' : '3fr 2fr', columnGap: '3mm' } : { display: 'contents' }}>
      <div>
        <LabelHeading>Ingredienti</LabelHeading>
        <LabelList columns={ingredientColumns}>
          {ingredients.map((it, i) => (
            <li key={`${it.name}-${i}`}className={it.allergens.length > 0 ? 'font-bold' : undefined} style={{ breakInside: 'avoid' }}>
              {it.name}
            </li>
          ))}
        </LabelList>
      </div>

      {hasAllergenBlock && (
        <div>
          <LabelHeading>Allergeni</LabelHeading>
          {allergenList.length > 0 && (
            <LabelList columns={!sideBySide && allergenList.length > 3 ? 2 : 1}>
              {allergenList.map((a) => (
                <li key={a.id} style={{ breakInside: 'avoid' }}>
                  {a.label.charAt(0).toUpperCase() + a.label.slice(1)}
                </li>
              ))}
            </LabelList>
          )}
          {info.mayContain && (
            <p className="leading-snug text-fg-2" style={{ marginTop: '0.2em', fontSize: '0.92em' }}>
              Può contenere tracce di {info.mayContain}.
            </p>
          )}
        </div>
      )}
      </div>

      {notes && (
        <div>
          <LabelHeading>Note</LabelHeading>
          <p className="leading-snug whitespace-pre-line">{notes}</p>
        </div>
      )}

      <div className="mt-auto border-t border-line leading-snug text-fg-2" style={{ paddingTop: small ? '1.2mm' : '2mm', fontSize: '0.88em' }}>
        <div className="flex flex-wrap justify-between" style={{ columnGap: '3mm' }}>
          <span>Prodotto il {formatDate(new Date(producedOn))}</span>
          {expiry && <span className="font-bold text-fg">Da consumarsi entro il {formatDate(expiry)}</span>}
        </div>
        {(info.netWeight || info.storage) && (
          <div className="flex flex-wrap justify-between" style={{ columnGap: '3mm' }}>
            {info.netWeight && <span>Peso netto {info.netWeight}</span>}
            {info.storage && <span>{info.storage}</span>}
          </div>
        )}
        {info.producer && <p>Prodotto da {info.producer}</p>}
        {statement && <p className="italic">{statement}</p>}
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
          <div ref={previewRef} data-h={fmt.h} className="relative inline-block border border-line shadow-sm">
            {label}
            {overflow && <div aria-hidden className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-danger" style={{ top: `${fmt.h}mm` }} />}
          </div>
        </div>
        {overflow && (
          <p className="mt-2 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning" role="status">
            <Icon name="alert" size={16} /> Il testo non sta nel formato {fmt.label.replace('Etichetta ', '')}: oltre la linea rossa andrebbe su una seconda pagina. Scegli un formato più grande o accorcia le note.
          </p>
        )}
        <p className="mt-2 text-xs text-muted">Ingredienti in ordine decrescente di peso, ognuno una volta sola anche se compare in più basi, allergeni in grassetto. È un aiuto a scrivere l'etichetta: controlla sempre le etichette dei prodotti che usi e le regole per la vendita.</p>
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
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-fg-2">Note</span>
            <textarea className="w-full" rows={3} value={info.notes ?? ''} onChange={(e) => persist({ ...info, notes: e.target.value })} placeholder="Togliere dal frigo mezz'ora prima di servire" />
            <span className="mt-1 block text-xs text-muted">Testo libero, compare sull'etichetta sotto gli allergeni. Gli a capo restano.</span>
          </label>
          <div className="space-y-2 sm:col-span-2">
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-accent" checked={!!info.showStatement} onChange={(e) => persist({ ...info, showStatement: e.target.checked })} />
              <span className="font-medium text-fg-2">Mostra la dicitura sulla produzione</span>
            </label>
            {info.showStatement && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-fg-2">Dicitura</span>
                <input className="w-full" value={info.statement ?? DEFAULT_STATEMENT} onChange={(e) => persist({ ...info, statement: e.target.value })} />
                <span className="mt-1 block text-xs text-muted">Facoltativa, in corsivo in fondo all'etichetta. Il testo resta salvato anche se la spegni.</span>
              </label>
            )}
          </div>
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
