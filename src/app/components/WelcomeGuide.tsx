import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon, { type IconName } from './Icon'

const SEEN_KEY = 'guida:vista'

/** Vero se la guida di benvenuto è già stata vista o saltata su questo dispositivo. */
export function guideSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    // storage non disponibile: meglio non riproporla a ogni apertura
    return true
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // storage non disponibile
  }
}

interface Step {
  icon: IconName
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    icon: 'book',
    title: 'Benvenuto nel ricettario',
    body: "Le tue ricette in un posto solo, con dosi che si adattano e una guida passo passo quando cucini. Ecco le cose principali, in un minuto.",
  },
  {
    icon: 'sparkles',
    title: 'Aggiungi le ricette',
    body: "Scrivile a mano con Nuova, oppure apri Importa: l'assistente le ricava da un testo, una foto, un sito o il solo nome del piatto, e tu controlli prima di salvare.",
  },
  {
    icon: 'pan',
    title: 'Dosi che si adattano',
    body: 'Nella ricetta, Dosi cambia le porzioni, parte da quello che hai ("ho solo 300 g di farina") o dalla tua teglia. Sale, uova e lieviti seguono regole proprie.',
  },
  {
    icon: 'flame',
    title: 'Ai fornelli',
    body: "Cucina mostra un passaggio per schermata con i timer. Dici a che ora vuoi mangiare e l'app calcola quando iniziare; se hai un dubbio, chiedi all'assistente.",
  },
  {
    icon: 'cart',
    title: 'Organizza',
    body: "Se non sai cosa cucinare, Cosa preparo oggi? sceglie tra le tue ricette in base al tempo e a cosa hai in casa. E poi lista della spesa, preferite e tag, condivisione ed etichetta da stampare.",
  },
]

interface Props {
  /** Ricettario vuoto: all'ultimo passo propone anche le ricette di esempio. */
  empty: boolean
  onLoadSamples: () => void
  onClose: () => void
}

/** Guida di benvenuto in cinque schermate. Chiuderla in qualsiasi modo la segna come vista. */
export default function WelcomeGuide({ empty, onLoadSamples, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [i, setI] = useState(0)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
    // showModal mette il focus su Salta, il primo bottone: meglio sull'azione principale.
    d?.querySelector<HTMLButtonElement>('.btn-primary')?.focus()
  }, [])
  const close = () => {
    markSeen()
    onClose()
  }
  const step = STEPS[i] ?? STEPS[0]!
  const last = i === STEPS.length - 1
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby="guida-titolo"
      aria-describedby="guida-testo"
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1" aria-hidden="true">
          {STEPS.map((s, n) => (
            <span key={s.title} className={`h-1 w-6 rounded-full ${n <= i ? 'bg-accent' : 'bg-surface-3'}`} />
          ))}
        </div>
        <button type="button" className="btn-ghost min-h-10 px-3 py-1 text-sm" onClick={close}>
          Salta
        </button>
      </div>
      <Icon name={step.icon} size={36} className="mt-4 text-accent-text" />
      <p className="mt-3 text-sm text-muted">
        {i + 1} di {STEPS.length}
      </p>
      <h2 id="guida-titolo" className="font-display mt-1 text-2xl font-medium text-fg" aria-live="polite">
        {step.title}
      </h2>
      <p id="guida-testo" className="mt-2 min-h-[6.5rem] text-fg-2">
        {step.body}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        {i > 0 ? (
          <button type="button" className="btn-secondary min-h-10 min-w-10 px-3" aria-label="Indietro" onClick={() => setI(i - 1)}>
            <Icon name="left" size={18} />
          </button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {last && empty && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                onLoadSamples()
                close()
              }}
            >
              Carica gli esempi
            </button>
          )}
          {last ? (
            <button type="button" className="btn-primary" autoFocus onClick={close}>
              Inizia
            </button>
          ) : (
            <button type="button" className="btn-primary" autoFocus onClick={() => setI(i + 1)}>
              Avanti <Icon name="right" size={16} />
            </button>
          )}
        </div>
      </div>
    </dialog>,
    document.body,
  )
}
