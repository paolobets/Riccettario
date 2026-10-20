import { db, type Chat, type CookSession, type ShoppingList } from './db'
import { sampleRecipes } from './samples'
import type { Recipe } from '@/core'
import { detachBase, newId, usedAsBaseIn } from '@/core'
import { scheduleSync } from './sync'

const SEEDED_KEY = 'seeded'

/** Alla prima apertura senza backend carica le ricette di esempio. Con il backend si caricano a richiesta. */
export async function seedIfEmpty(): Promise<void> {
  const seeded = await db.settings.get(SEEDED_KEY)
  if (seeded) return
  const count = await db.recipes.count()
  if (count === 0) await db.recipes.bulkPut(sampleRecipes)
  await db.settings.put({ key: SEEDED_KEY, value: true })
}

/** Carica le tre ricette di esempio adesso (contano come modificate ora, così arrivano anche al server). */
export async function loadSamples(): Promise<number> {
  const now = new Date().toISOString()
  await db.recipes.bulkPut(sampleRecipes.map((r) => ({ ...r, createdAt: now, updatedAt: now })))
  await db.settings.put({ key: SEEDED_KEY, value: true })
  scheduleSync()
  return sampleRecipes.length
}

export async function saveRecipe(recipe: Recipe): Promise<Recipe> {
  const saved = { ...recipe, updatedAt: new Date().toISOString() }
  await db.recipes.put(saved)
  scheduleSync()
  return saved
}

/** Cancella ricetta, diario e conversazioni, lasciando le lapidi perché la cancellazione arrivi agli altri dispositivi. */
export async function deleteRecipe(id: string): Promise<void> {
  const deletedAt = new Date().toISOString()
  await db.transaction('rw', db.recipes, db.sessions, db.chats, db.tombstones, async () => {
    const sessionIds = await db.sessions.where('recipeId').equals(id).primaryKeys()
    const chatIds = await db.chats.where('recipeId').equals(id).primaryKeys()
    // Le ricette che la usavano come base la tengono come ingrediente semplice.
    const parents = usedAsBaseIn(await db.recipes.toArray(), id)
    if (parents.length) await db.recipes.bulkPut(parents.map((p) => ({ ...detachBase(p, id), updatedAt: deletedAt })))
    await db.recipes.delete(id)
    await db.sessions.bulkDelete(sessionIds)
    await db.chats.bulkDelete(chatIds)
    await db.tombstones.bulkPut([
      { table: 'recipes', id, deletedAt },
      ...sessionIds.map((sid) => ({ table: 'sessions' as const, id: sid, deletedAt })),
      ...chatIds.map((cid) => ({ table: 'chats' as const, id: cid, deletedAt })),
    ])
  })
  scheduleSync()
}

export async function saveChat(chat: Chat): Promise<void> {
  await db.chats.put(chat)
  scheduleSync()
}

export async function deleteChat(id: string): Promise<void> {
  await db.transaction('rw', db.chats, db.tombstones, async () => {
    await db.chats.delete(id)
    await db.tombstones.put({ table: 'chats', id, deletedAt: new Date().toISOString() })
  })
  scheduleSync()
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
  scheduleSync()
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

/**
 * Registra una cottura conclusa in un colpo solo: la modalità cucina la chiama
 * solo al salvataggio finale, così le cotture abbandonate non lasciano tracce nel diario.
 */
export async function recordSession(
  recipeId: string,
  factor: number,
  startedAt: string,
  data: { rating?: number; notes?: string },
): Promise<CookSession> {
  const s: CookSession = { id: newId('s'), recipeId, factor, startedAt, finishedAt: new Date().toISOString(), ...data }
  await db.sessions.put(s)
  scheduleSync()
  return s
}

export async function exportAll(): Promise<string> {
  const recipes = await db.recipes.toArray()
  const sessions = await db.sessions.toArray()
  const chats = await db.chats.toArray()
  return JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), recipes, sessions, chats }, null, 2)
}

export async function importJson(text: string): Promise<number> {
  const data = JSON.parse(text) as { recipes?: Recipe[]; sessions?: CookSession[]; chats?: Chat[] }
  const recipes = Array.isArray(data.recipes) ? data.recipes : []
  if (!Array.isArray(data.recipes)) throw new Error('nel file non c\'è l\'elenco "recipes"')
  // Le ricette importate contano come modificate ora: così arrivano anche agli altri dispositivi.
  const now = new Date().toISOString()
  await db.recipes.bulkPut(recipes.map((r) => ({ ...r, updatedAt: now })))
  if (Array.isArray(data.sessions)) await db.sessions.bulkPut(data.sessions)
  if (Array.isArray(data.chats)) await db.chats.bulkPut(data.chats)
  scheduleSync()
  return recipes.length
}

export async function toggleFavorite(recipe: Recipe): Promise<void> {
  await saveRecipe({ ...recipe, favorite: !recipe.favorite })
}

// --- Lista della spesa (solo su questo dispositivo) -----------------------------

export const SHOPPING_LIST_ID = 'current'

async function loadList(): Promise<ShoppingList> {
  return (await db.lists.get(SHOPPING_LIST_ID)) ?? { id: SHOPPING_LIST_ID, entries: [], checked: [], updatedAt: new Date().toISOString() }
}

/** Aggiunge una ricetta con il fattore corrente; se c'è già, aggiorna il fattore. */
export async function addToShoppingList(recipeId: string, factor: number): Promise<void> {
  const list = await loadList()
  const entries = list.entries.filter((e) => e.recipeId !== recipeId)
  entries.push({ recipeId, factor })
  await db.lists.put({ ...list, entries, updatedAt: new Date().toISOString() })
}

export async function removeFromShoppingList(recipeId: string): Promise<void> {
  const list = await loadList()
  await db.lists.put({ ...list, entries: list.entries.filter((e) => e.recipeId !== recipeId), updatedAt: new Date().toISOString() })
}

export async function setShoppingChecked(checked: string[]): Promise<void> {
  const list = await loadList()
  await db.lists.put({ ...list, checked, updatedAt: new Date().toISOString() })
}

export async function clearShoppingList(): Promise<void> {
  await db.lists.put({ id: SHOPPING_LIST_ID, entries: [], checked: [], updatedAt: new Date().toISOString() })
}
