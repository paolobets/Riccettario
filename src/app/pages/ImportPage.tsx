import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { isAiConfigured, loadAiSettings } from '@/ai/settings'

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

  const canRun = mode === 'text' ? text.trim().length > 20 : mode === 'url' ? /^https?:\/\//.test(url.trim()) : files.length > 0

  const run = async () => {
    setError(null)
    setStatus('Avvio…')
    try {
      const input = mode === 'text' ? { text } : mode === 'url' ? { url } : { images: files }
      const { importRecipe } = await import('@/ai/import')
      const result = await importRecipe(input, setStatus)
      navigate('/ricetta/nuova', { state: { recipe: result.recipe, warnings: result.warnings, fromAi: true } })
    } catch (e) {
      const { describeAiError } = await import('@/ai/client')
      setError(describeAiError(e))
      setStatus(null)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-brand-900">Importa con l'AI</h1>
      <p className="text-sm text-stone-600">
        Incolla il testo di una ricetta, fotografa una pagina o indica un indirizzo web. L'AI la trasforma in una ricetta strutturata con le regole di scalatura; poi la rivedi nel wizard prima di salvarla.
      </p>

      {configured === false && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          L'AI non è ancora configurata.{' '}
          <Link to="/impostazioni" className="underline">
            Inserisci la chiave API nelle impostazioni
          </Link>
          .
        </div>
      )}

      <div className="flex gap-1 rounded-xl bg-brand-100 p-1">
        {(
          [
            ['text', 'Testo'],
            ['photo', 'Foto'],
            ['url', 'Indirizzo web'],
          ] as Array<[Mode, string]>
        ).map(([m, label]) => (
          <button
            key={m}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${mode === m ? 'bg-white text-brand-900 shadow-sm' : 'text-brand-800'}`}
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
          placeholder={'Es.\nTorta di mele\nIngredienti per 8: 3 mele, 200 g di farina, 150 g di zucchero, 2 uova…\nPreparazione: …'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}

      {mode === 'url' && (
        <input className="w-full" type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
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
            📷 Scatta o scegli foto
          </button>
          {files.length > 0 && (
            <ul className="grid grid-cols-3 gap-2">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="relative">
                  <img src={URL.createObjectURL(f)} alt="" className="aspect-square w-full rounded-lg object-cover" />
                  <button
                    className="absolute top-1 right-1 rounded-full bg-white/90 px-2 text-sm"
                    onClick={() => setFiles(files.filter((_, k) => k !== i))}
                    aria-label="Rimuovi foto"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-stone-500">Più pagine? Aggiungi più foto: vengono ridotte prima dell'invio.</p>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <button className="btn-primary w-full py-3 text-lg" onClick={run} disabled={!canRun || status !== null || configured === false}>
        {status ?? 'Struttura la ricetta'}
      </button>
    </div>
  )
}
