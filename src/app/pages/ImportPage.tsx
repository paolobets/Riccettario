import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { isAiConfigured, loadAiSettings } from '@/ai/settings'
import Icon from '../components/Icon'

type Mode = 'text' | 'photo' | 'url'

export default function ImportPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('text')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadAiSettings().then((s) => setConfigured(isAiConfigured(s)))
  }, [])

  // Anteprime create una volta per file e revocate quando cambiano, per non accumulare blob in memoria.
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  const canRun = mode === 'text' ? text.trim().length > 20 : mode === 'url' ? /^https?:\/\//.test(url.trim()) : files.length > 0

  const run = async () => {
    setError(null)
    setStatus('Avvio…')
    try {
      const input = mode === 'text' ? { text } : mode === 'url' ? { url } : { images: files }
      const { importRecipe } = await import('@/ai/import')
      const result = await importRecipe(input, setStatus)
      navigate('/ricetta/nuova', { state: { recipe: result.recipe, warnings: result.warnings, fromAi: true, costUsd: result.costUsd } })
    } catch (e) {
      const { describeAiError } = await import('@/ai/client')
      setError(describeAiError(e))
      setStatus(null)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-medium text-fg">Importa con l'AI</h1>
      <p className="text-sm text-muted">
        Incolla il testo di una ricetta, fotografa una pagina o indica un indirizzo web. L'AI la trasforma in una ricetta strutturata con le regole di scalatura; poi la rivedi nel wizard prima di salvarla.
      </p>

      {configured === false && (
        <div className="notice bg-warning-soft text-warning">
          L'AI non è ancora configurata.{' '}
          <Link to="/impostazioni" className="underline">
            Inserisci la chiave API nelle impostazioni
          </Link>
          .
        </div>
      )}

      <div className="flex gap-1 rounded-xl bg-surface-2 p-1" role="group" aria-label="Sorgente">
        {(
          [
            ['text', 'Testo'],
            ['photo', 'Foto'],
            ['url', 'Indirizzo web'],
          ] as Array<[Mode, string]>
        ).map(([m, label]) => (
          <button
            key={m}
            className={`min-h-10 flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${mode === m ? 'bg-surface text-fg shadow-sm' : 'text-muted'}`}
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'text' && (
        <textarea
          className="w-full"
          rows={12}
          aria-label="Testo della ricetta"
          placeholder={'Es.\nTorta di mele\nIngredienti per 8: 3 mele, 200 g di farina, 150 g di zucchero, 2 uova…\nPreparazione: …'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}

      {mode === 'url' && (
        <input className="w-full" type="url" placeholder="https://…" aria-label="Indirizzo web della ricetta" value={url} onChange={(e) => setUrl(e.target.value)} />
      )}

      {mode === 'photo' && (
        <div className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              setFiles([...files, ...Array.from(e.target.files ?? [])])
              e.target.value = ''
            }}
          />
          <button className="btn-secondary w-full py-3" onClick={() => fileRef.current?.click()}>
            <Icon name="camera" /> Scatta o scegli foto
          </button>
          {files.length > 0 && (
            <ul className="grid grid-cols-3 gap-2">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="relative">
                  <img src={previews[i]} alt={`Foto ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
                  <button
                    className="absolute top-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 text-sm"
                    onClick={() => setFiles(files.filter((_, k) => k !== i))}
                    aria-label={`Rimuovi foto ${i + 1}`}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">Più pagine? Aggiungi più foto: vengono ridotte prima dell'invio.</p>
        </div>
      )}

      {error && <p className="notice bg-danger-soft text-danger">{error}</p>}

      <button className="btn-primary w-full py-3 text-lg" onClick={run} disabled={!canRun || status !== null || configured === false}>
        {status ?? 'Struttura la ricetta'}
      </button>
    </div>
  )
}
