import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface ConfirmOptions {
  /** Domanda diretta, con l'oggetto: "Eliminare «Tiramisù»?" */
  title: string
  /** Conseguenze, in una frase. */
  body?: string
  /** Il bottone nomina l'azione: "Elimina ricetta", non "OK". */
  confirmLabel: string
  /** Il bottone di rinuncia nomina lo stato che resta: "Tieni", "Resta in cucina". */
  cancelLabel?: string
  /** Azione irreversibile: bottone rosso e focus iniziale sulla rinuncia. */
  danger?: boolean
}

interface DialogProps {
  options: ConfirmOptions
  onClose: (ok: boolean) => void
}

/** Finestra di conferma dell'app, al posto di `confirm()` del browser. Usa `<dialog>` nativo: focus intrappolato, Escape, sfondo. */
function ConfirmDialog({ options, onClose }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault()
        onClose(false)
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(false)
      }}
    >
      <h2 id="confirm-title" className="section-title text-xl">
        {options.title}
      </h2>
      {options.body && <p className="mt-2 text-fg-2">{options.body}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-secondary" autoFocus={options.danger} onClick={() => onClose(false)}>
          {options.cancelLabel ?? 'Annulla'}
        </button>
        <button type="button" className={options.danger ? 'btn-danger' : 'btn-primary'} autoFocus={!options.danger} onClick={() => onClose(true)}>
          {options.confirmLabel}
        </button>
      </div>
    </dialog>
  )
}

/**
 * `const { confirm, dialog } = useConfirm()`: `confirm(opzioni)` restituisce una promessa
 * che vale `true` se la persona conferma; `dialog` va reso una volta nella pagina.
 */
export function useConfirm(): { confirm: (o: ConfirmOptions) => Promise<boolean>; dialog: ReactNode } {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)
  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false)
        resolver.current = resolve
        setOptions(o)
      }),
    [],
  )
  const close = useCallback((ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setOptions(null)
  }, [])
  // Portale su body: fuori da contenitori con `space-y`, che altrimenti sovrascrivono i margini del dialogo.
  return { confirm, dialog: options ? createPortal(<ConfirmDialog options={options} onClose={close} />, document.body) : null }
}
