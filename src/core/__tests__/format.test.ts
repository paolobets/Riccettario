import { describe, expect, it } from 'vitest'
import { formatAmount, formatDuration, formatIngredientLine, formatQuantity } from '../format'
import { roundPractical, toDisplayUnit } from '../units'

describe('format', () => {
  it('frazioni per le misure a cucchiaio', () => {
    expect(formatAmount(0.5, 'cucchiaino')).toBe('½')
    expect(formatAmount(1.5, 'cucchiaio')).toBe('1 ½')
    expect(formatAmount(2.25, 'tazza')).toBe('2 ¼')
    expect(formatAmount(3, 'pz')).toBe('3')
  })
  it('decimali italiani per i pesi', () => {
    expect(formatQuantity({ amount: 1500, unit: 'g' })).toBe('1,5 kg')
    expect(formatQuantity({ amount: 350, unit: 'ml' })).toBe('350 ml')
    expect(formatQuantity({ amount: 2, unit: 'cucchiaio' })).toBe('2 cucchiai')
    expect(formatQuantity({ amount: 1, unit: 'cucchiaio' })).toBe('1 cucchiaio')
  })
  it('riga ingrediente', () => {
    expect(formatIngredientLine('farina', { amount: 500, unit: 'g' })).toBe('500 g di farina')
    expect(formatIngredientLine('uova', { amount: 2, unit: '' })).toBe('2 uova')
    expect(formatIngredientLine('sale', { amount: 1, unit: 'q.b.' })).toBe('sale q.b.')
    expect(formatIngredientLine('prezzemolo', undefined)).toBe('prezzemolo')
  })
  it('durate', () => {
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(60)).toBe('1 h')
    expect(formatDuration(90)).toBe('1 h 30 min')
  })
})

describe('units', () => {
  it('arrotondamento pratico per fascia', () => {
    expect(roundPractical({ amount: 7.3, unit: 'g' }).amount).toBe(7.5)
    expect(roundPractical({ amount: 63.4, unit: 'g' }).amount).toBe(63)
    expect(roundPractical({ amount: 687, unit: 'g' }).amount).toBe(685)
    expect(roundPractical({ amount: 1234, unit: 'g' }).amount).toBe(1230)
    expect(roundPractical({ amount: 1.2, unit: 'kg' })).toEqual({ amount: 1200, unit: 'g' })
    expect(roundPractical({ amount: 0.1, unit: 'cucchiaino' }).amount).toBe(0.25)
  })
  it('unità di visualizzazione', () => {
    expect(toDisplayUnit({ amount: 2000, unit: 'ml' })).toEqual({ amount: 2, unit: 'l' })
    expect(toDisplayUnit({ amount: 999, unit: 'g' })).toEqual({ amount: 999, unit: 'g' })
  })
})
