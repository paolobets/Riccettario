import { useEffect, useRef, useState } from 'react'
import type { Timer } from '@/core'

interface Props {
  timer: Timer
  size?: 'sm' | 'lg'
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function notify(label: string) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Timer finito', { body: label, icon: '/icon.svg' })
    }
    if ('vibrate' in navigator) navigator.vibrate?.([300, 100, 300, 100, 600])
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.value = 0.2
    osc.start()
    osc.stop(ctx.currentTime + 0.8)
  } catch {
    // ambiente senza audio/notifiche
  }
}

/** Timer a conto alla rovescia basato su timestamp, resistente alla sospensione del tab. */
export default function TimerButton({ timer, size = 'sm' }: Props) {
  const total = timer.minutes * 60
  const [endAt, setEndAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [done, setDone] = useState(false)
  const fired = useRef(false)

  useEffect(() => {
    if (endAt === null) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [endAt])

  const remaining = endAt === null ? total : (endAt - now) / 1000

  useEffect(() => {
    if (endAt !== null && remaining <= 0 && !fired.current) {
      fired.current = true
      setDone(true)
      notify(timer.label ?? `${timer.minutes} minuti`)
    }
  }, [remaining, endAt, timer])

  const start = () => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => undefined)
    }
    fired.current = false
    setDone(false)
    setEndAt(Date.now() + total * 1000)
  }
  const stop = () => {
    setEndAt(null)
    setDone(false)
  }

  const big = size === 'lg'
  const label = timer.label ?? 'Timer'
  if (endAt === null) {
    return (
      <button className={`btn-secondary ${big ? 'px-6 py-3 text-lg' : 'text-sm'}`} onClick={start}>
        ⏱ {label} · {fmt(total)}
      </button>
    )
  }
  return (
    <div className={`flex items-center gap-3 rounded-xl ${done ? 'bg-green-100 text-green-900' : 'bg-brand-100 text-brand-900'} ${big ? 'px-5 py-3' : 'px-3 py-1.5'}`}>
      <span className={`font-mono font-bold tabular-nums ${big ? 'text-3xl' : 'text-base'}`}>{done ? 'Pronto!' : fmt(remaining)}</span>
      <span className="text-sm">{label}</span>
      <button className="btn-ghost px-2 py-1 text-sm" onClick={stop}>
        {done ? 'OK' : 'Annulla'}
      </button>
    </div>
  )
}
