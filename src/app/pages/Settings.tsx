import { useRef, useState } from 'react'
import { exportAll, importJson } from '@/data/repo'

export default function Settings() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)

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
