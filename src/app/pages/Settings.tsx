import { useEffect, useRef, useState } from 'react'
import { exportAll, importJson } from '@/data/repo'
import { DEFAULT_MODEL, loadAiSettings, MODELS, saveAiSettings, type AiSettings } from '@/ai/settings'
import { formatUsd, loadUsage, resetUsage, type UsageTotals } from '@/ai/usage'
import { loadTheme, saveTheme, type Theme } from '../theme'
import Icon from '../components/Icon'

export default function Settings() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [ai, setAi] = useState<AiSettings>({ apiKey: '', proxyUrl: '', model: DEFAULT_MODEL, fastKitchenAnswers: true })
  const [aiSaved, setAiSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [usage, setUsage] = useState<UsageTotals | null>(null)
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
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
      setMessage(`Il file non è un backup del Ricettario: ${(e as Error).message}. Esporta di nuovo dall'altro dispositivo e riprova.`)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-medium text-fg">Impostazioni</h1>
      <section className="rule space-y-3 pt-4">
        <h2 className="section-title text-lg">Aspetto</h2>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Tema">
          {(
            [
              ['auto', 'Automatico', 'auto'],
              ['light', 'Chiaro', 'sun'],
              ['dark', 'Scuro', 'moon'],
            ] as Array<[Theme, string, 'auto' | 'sun' | 'moon']>
          ).map(([t, label, icon]) => (
            <button
              key={t}
              role="radio"
              aria-checked={theme === t}
              className={`flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-sm font-medium transition ${theme === t ? 'bg-surface text-fg shadow-sm' : 'text-muted'}`}
              onClick={() => {
                setTheme(t)
                saveTheme(t)
              }}
            >
              <Icon name={icon} size={16} className="hidden min-[400px]:block" /> <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">Automatico segue le impostazioni del dispositivo.</p>
      </section>
      <section className="rule space-y-3 pt-4">
        <h2 className="section-title text-lg">Assistente AI</h2>
        <p className="text-sm text-muted">
          Serve per importare ricette da testo e foto, fare domande e creare varianti. La chiave resta solo su questo dispositivo e viene inviata esclusivamente ad Anthropic (o al tuo proxy). Ogni richiesta ha un costo sul tuo account.
        </p>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-fg-2">Chiave API Anthropic</span>
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 font-mono text-sm"
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              placeholder="sk-ant-…"
              value={ai.apiKey}
              onChange={(e) => {
                setAi({ ...ai, apiKey: e.target.value })
                setAiSaved(false)
              }}
            />
            <button className="btn-secondary shrink-0 px-3" type="button" onClick={() => setShowKey(!showKey)} aria-pressed={showKey}>
              {showKey ? 'Nascondi' : 'Mostra'}
            </button>
          </div>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-fg-2">Modello</span>
          <select className="w-full" value={ai.model} onChange={(e) => { setAi({ ...ai, model: e.target.value }); setAiSaved(false) }}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 accent-accent"
            checked={ai.fastKitchenAnswers}
            onChange={(e) => {
              setAi({ ...ai, fastKitchenAnswers: e.target.checked })
              setAiSaved(false)
            }}
          />
          <span>
            <span className="font-medium text-fg-2">Risposte veloci in cucina</span>
            <span className="block text-muted">Le domande fatte durante la cottura usano Claude Haiku 5.5: risposte brevi, costo quaranta volte più basso.</span>
          </span>
        </label>
        <details className="text-sm">
          <summary className="cursor-pointer text-fg-2">Opzionale: proxy per non tenere la chiave nel browser</summary>
          <p className="mt-2 text-muted">
            Pubblica <code>proxy/cloudflare-worker.js</code> (istruzioni nel file), poi inserisci qui l'URL del worker e, nel campo chiave, la password del proxy. Con il proxy l'import da sito legge i dati della pagina senza passare dall'AI, quando il sito li espone.
          </p>
          <input className="mt-2 w-full" type="url" placeholder="https://ricettario-proxy.xxx.workers.dev" aria-label="Indirizzo del proxy" value={ai.proxyUrl} onChange={(e) => { setAi({ ...ai, proxyUrl: e.target.value }); setAiSaved(false) }} />
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
          {aiSaved && <span className="text-sm text-success">Salvato.</span>}
        </div>
        {usage && usage.requests > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 p-3 text-sm text-fg-2">
            <span>
              Spesa stimata finora: <b>{formatUsd(usage.costUsd)}</b> in {usage.requests} richieste ({usage.inputTokens.toLocaleString('it-IT')} token in ingresso, {usage.outputTokens.toLocaleString('it-IT')} in uscita).
            </span>
            <button
              className="btn-ghost min-h-9 px-2 py-1 text-xs"
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
      <section className="rule space-y-3 pt-4">
        <h2 className="section-title text-lg">Backup</h2>
        <p className="text-sm text-muted">
          Le ricette vivono solo su questo dispositivo. Esporta un file JSON per conservarle o portarle altrove.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={download}>
            <Icon name="download" size={16} /> Esporta tutto
          </button>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} /> Importa da file
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
        {message && (
          <p className="text-sm text-fg-2" role="status">
            {message}
          </p>
        )}
      </section>
      <section className="rule space-y-2 pt-4 text-sm text-fg-2">
        <h2 className="section-title text-lg">Come funziona la scalatura</h2>
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
