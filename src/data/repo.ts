import { db, type CookSession } from './db'
import { sampleRecipes } from './samples'
import type { Recipe } from '@/core'
import { newId } from '@/core'

const SEEDED_KEY = 'seeded'

/** Alla prima apertura carica le ricette di esempio. */
export async function seedIfEmpty(): Promise<void> {
  const seeded = await db.settings.get(SEEDED_KEY)
  if (seeded) return
  const count = await db.recipes.count()
  if (count === 0) await db.recipes.bulkPut(sampleRecipes)
  await db.settings.put({ key: SEEDED_KEY, value: true })
}

export async function saveRecipe(recipe: Recipe): Promise<Recipe> {
  const saved = { ...recipe, updatedAt: new Date().toISOString() }
  await db.recipes.put(saved)
  return saved
}

export async function deleteRecipe(id: string): Promise<void> {
  await db.transaction('rw', db.recipes, db.sessions, db.chats, async () => {
    await db.recipes.delete(id)
    await db.sessions.where('recipeId').equals(id).delete()
    await db.chats.where('recipeId').equals(id).delete()
  })
}

export async function duplicateRecipe(recipe: Recipe): Promise<Recipe> {
  const copy: Recipe = {
    ...recipe,
    id: newId('r'),
    title: `${recipe.title} (variante)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await db.recipes.put(copy)
  return copy
}

export async function startSession(recipeId: string, factor: number): Promise<CookSession> {
  const s: CookSession = { id: newId('s'), recipeId, factor, startedAt: new Date().toISOString() }
  await db.sessions.put(s)
  return s
}

export async function finishSession(id: string, data: { rating?: number; notes?: string }): Promise<void> {
  await db.sessions.update(id, { ...data, finishedAt: new Date().toISOString() })
}

export async function exportAll(): Promise<string> {
  const recipes = await db.recipes.toArray()
  const sessions = await db.sessions.toArray()
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), recipes, sessions }, null, 2)
}

export async function importJson(text: string): Promise<number> {
  const data = JSON.parse(text) as { recipes?: Recipe[]; sessions?: CookSession[] }
  const recipes = Array.isArray(data.recipes) ? data.recipes : []
  await db.recipes.bulkPut(recipes)
  if (Array.isArray(data.sessions)) await db.sessions.bulkPut(data.sessions)
  return recipes.length
}
