/**
 * "Pronto per le 20:00": dato l'orario del pasto, calcola a ritroso quando
 * iniziare ogni passaggio. I passaggi in sequenza sommano le loro durate; quelli
 * paralleli partono insieme al passaggio durante il quale si svolgono.
 */
import type { Step } from './model'

export interface PlannedStep {
  index: number
  step: Step
  minutes: number
  startsAt: Date
  endsAt: Date
  parallel: boolean
}

export interface Plan {
  readyAt: Date
  startAt: Date
  /** Minuti sul percorso critico, cioè quanto prima bisogna iniziare. */
  totalMinutes: number
  items: PlannedStep[]
}

/** Durata di un passaggio ai fini del piano: il timer o la durata indicata, la più lunga. */
export function stepMinutes(step: Step): number {
  return Math.max(step.durationMin ?? 0, step.timer?.minutes ?? 0)
}

export function planBackwards(steps: Step[], readyAt: Date): Plan {
  const ids = new Set(steps.map((s) => s.id))
  const isParallel = (s: Step) => Boolean(s.parallelWith && ids.has(s.parallelWith) && s.parallelWith !== s.id)
  const items: PlannedStep[] = []
  let cursor = readyAt.getTime()
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]!
    if (isParallel(step)) continue
    const minutes = stepMinutes(step)
    const endsAt = new Date(cursor)
    cursor -= minutes * 60_000
    items.push({ index: i, step, minutes, startsAt: new Date(cursor), endsAt, parallel: false })
  }
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!
    if (!isParallel(step)) continue
    const parent = items.find((it) => it.step.id === step.parallelWith)
    const startsAt = parent ? parent.startsAt : new Date(cursor)
    const minutes = stepMinutes(step)
    items.push({ index: i, step, minutes, startsAt, endsAt: new Date(startsAt.getTime() + minutes * 60_000), parallel: true })
  }
  items.sort((a, b) => a.index - b.index)
  const startAt = new Date(Math.min(cursor, ...items.map((it) => it.startsAt.getTime())))
  return { readyAt, startAt, totalMinutes: Math.round((readyAt.getTime() - cursor) / 60_000), items }
}

/** Passaggi che devono ancora iniziare, dal più vicino. */
export function upcomingStarts(plan: Plan, now: Date): PlannedStep[] {
  return plan.items.filter((it) => it.startsAt.getTime() > now.getTime() && it.minutes > 0).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

/** "20:00" → oggi alle 20:00, o domani se l'ora è già passata. `null` se il testo non è un orario. */
export function parseReadyAt(value: string, now: Date): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  const d = new Date(now)
  d.setHours(h, min, 0, 0)
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1)
  return d
}

export function formatClock(d: Date): string {
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}
