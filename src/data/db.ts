import Dexie, { type EntityTable } from 'dexie'
import type { Recipe } from '@/core'

/** Sessione di cottura: cosa è successo quando ho preparato la ricetta. */
export interface CookSession {
  id: string
  recipeId: string
  factor: number
  startedAt: string
  finishedAt?: string
  rating?: number
  notes?: string
}

/** Conversazione con l'assistente, una per ricetta. */
export interface Chat {
  id: string
  recipeId: string
  turns: Array<{ role: 'user' | 'assistant'; text: string; costUsd?: number }>
  updatedAt: string
}

export interface Setting {
  key: string
  value: unknown
}

class RicettarioDB extends Dexie {
  recipes!: EntityTable<Recipe, 'id'>
  sessions!: EntityTable<CookSession, 'id'>
  settings!: EntityTable<Setting, 'key'>
  chats!: EntityTable<Chat, 'id'>

  constructor() {
    super('ricettario')
    this.version(1).stores({
      recipes: 'id, title, updatedAt, *tags',
      sessions: 'id, recipeId, startedAt',
      settings: 'key',
    })
    this.version(2).stores({
      recipes: 'id, title, updatedAt, *tags',
      sessions: 'id, recipeId, startedAt',
      settings: 'key',
      chats: 'id, recipeId, updatedAt',
    })
  }
}

export const db = new RicettarioDB()
