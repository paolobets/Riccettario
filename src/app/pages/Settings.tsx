import { useEffect, useRef, useState } from 'react'
import { exportAll, importJson } from '@/data/repo'
import { DEFAULT_MODEL, loadAiSettings, MODELS, saveAiSettings, type AiSettings } from '@/ai/settings'
import { formatUsd, loadUsage, resetUsage, type UsageTotals } from '@/ai/usage'

export default function Settings() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [ai, setAi] = useState<AiSettings>({ apiKey: '', proxyUrl: '', model: DEFAULT_MODEL })
  const [aiSaved, setAiSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [usage, setUsage] = useState<UsageTotals | null>(null)
  useEffect(() => {
    loadAiSettings().then(setAi)
    loadUsage().then(setUsage)
  }, [])

  const download = async () => {
    const json = await exportAll()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ricettario-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const upload = async (file: File) => {
    try {
      const n = await importJson(await file.text())
      setMessage(`Importate ${n} ricette.`)
    } catch (e) {
      setMessage(`Errore di importazione: ${(e as Error).message}`)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-brand-900">Impostazioni</h1>
      <section className="card space-y-3">
        <h2 className="font-semibold">Assistente AI</h2>
        <p className="text-sm text-stone-600">
          Serve per importare ricette da testo e foto, fare domande e creare varianti. La chiave resta solo su questo dispositivo e viene inviata esclusivamente ad Anthropic (o al tuo proxy). Ogni richiesta ha un costo sul tuo account.
        </p>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Chiave API Anthropic</span>
          <div className="flex gap-2">
            <input
              className="flex-1 font-mono text-sm"
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              placeholder="sk-ant-…"
              value={ai.apiKey}
              onChange={(e) => {
                setAi({ ...ai, apiKey: e.target.value })
                setAiSaved(false)
              }}
            />
            <button className="btn-secondary px-3" type="button" onClick={() => setShowKey(!showKey)}>
              {showKey ? 'Nascondi' : 'Mostra'}
            </button>
          </div>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Modello</span>
          <select className="w-full" value={ai.model} onChange={(e) => { setAi({ ...ai, model: e.target.value }); setAiSaved(false) }}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <details className="text-sm">
          <summary className="cursor-pointer text-stone-700">Opzionale: proxy per non tenere la chiave nel browser</summary>
          <p className="mt-2 text-stone-600">
            Pubblica <code>proxy/cloudflare-worker.js</code> (istruzioni nel file), poi inserisci qui l'URL del worker e, nel campo chiave, la password del proxy.
          </p>
          <input className="mt-2 w-full" type="url" placeholder="https://ricettario-proxy.xxx.workers.dev" value={ai.proxyUrl} onChange={(e) => { setAi({ ...ai, proxyUrl: e.target.value }); setAiSaved(false) }} />
        </details>
        <div className="flex items-center gap-3">
          <button
            className="btn-primary"
            onClick={async () => {
              await saveAiSettings(ai)
              setAiSaved(true)
            }}
          >
            Salva
          </button>
          {aiSaved && <span className="text-sm text-green-700">Salvato.</span>}
        </div>
        {usage && usage.requests > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 p-3 text-sm text-stone-700">
            <span>
              Spesa stimata finora: <b>{formatUsd(usage.costUsd)}</b> in {usage.requests} richieste ({usage.inputTokens.toLocaleString('it-IT')} token in ingresso, {usage.outputTokens.toLocaleString('it-IT')} in uscita).
            </span>
            <button
              className="btn-ghost px-2 py-1 text-xs"
              onClick={async () => {
                await resetUsage()
                setUsage(await loadUsage())
              }}
            >
              Azzera
            </button>
          </div>
        )}
      </section>
      <section className="card space-y-3">
        <h2 className="font-semibold">Backup</h2>
        <p className="text-sm text-stone-600">
          Le ricette vivono solo su questo dispositivo. Esporta un file JSON per conservarle o portarle altrove.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={download}>
            Esporta tutto
          </button>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
            Importa da file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) upload(f)
              e.target.value = ''
            }}
          />
        </div>
        {message && <p className="text-sm text-stone-700">{message}</p>}
      </section>
      <section className="card space-y-2 text-sm text-stone-600">
        <h2 className="font-semibold text-stone-900">Come funziona la scalatura</h2>
        <ul className="list-inside list-disc space-y-1">
          <li><b>Lineare</b>: moltiplicato per il fattore (farina, acqua, pasta).</li>
          <li><b>Sub-lineare</b>: cresce meno del fattore, per sale, spezie e lieviti.</li>
          <li><b>A pezzi interi</b>: uova e simili, arrotondati a numeri interi con avviso.</li>
          <li><b>Fissa</b>: non cambia mai (una foglia di alloro, la teglia).</li>
          <li><b>Quanto basta</b>: solo informativo.</li>
          <li><b>% del panettiere</b>: percentuale di un ingrediente base, tipicamente la farina.</li>
        </ul>
        <p>I timer e i tempi di cottura non vengono scalati: quando il fattore è lontano da 1 l'app lo segnala.</p>
      </section>
    </div>
  )
}
