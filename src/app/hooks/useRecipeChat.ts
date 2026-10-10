import { useCallback, useEffect, useState } from 'react'
import { db, type Chat } from '@/data/db'
import { newId, type Recipe } from '@/core'
import type { ChatTurn } from '@/ai/assist'

/**
 * Conversazione con l'assistente per una ricetta, persistita in Dexie:
 * si ritrova riaprendo la ricetta, anche dalla modalità cucina.
 */
export function useRecipeChat(recipe: Recipe, factor: number) {
  const [chat, setChat] = useState<Chat | null>(null)
  const [partial, setPartial] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    db.chats
      .where('recipeId')
      .equals(recipe.id)
      .reverse()
      .sortBy('updatedAt')
      .then((rows) => {
        if (alive) setChat(rows[0] ?? { id: newId('c'), recipeId: recipe.id, turns: [], updatedAt: new Date().toISOString() })
      })
    return () => {
      alive = false
    }
  }, [recipe.id])

  const ask = useCallback(
    async (question: string, stepContext?: string) => {
      if (!chat || !question.trim() || busy) return
      setError(null)
      setBusy(true)
      setPartial('')
      try {
        const [{ askAboutRecipe }, sessions] = await Promise.all([
          import('@/ai/assist'),
          db.sessions.where('recipeId').equals(recipe.id).toArray(),
        ])
        let acc = ''
        const history: ChatTurn[] = chat.turns.map((t) => ({ role: t.role, text: t.text }))
        const { text, costUsd } = await askAboutRecipe({ recipe, factor, sessions, history, question, stepContext }, (d) => {
          acc += d
          setPartial(acc)
        })
        const next: Chat = {
          ...chat,
          turns: [...chat.turns, { role: 'user', text: question }, { role: 'assistant', text, costUsd }],
          updatedAt: new Date().toISOString(),
        }
        await db.chats.put(next)
        setChat(next)
      } catch (e) {
        const { describeAiError } = await import('@/ai/client')
        setError(describeAiError(e))
      } finally {
        setPartial(null)
        setBusy(false)
      }
    },
    [chat, busy, recipe, factor],
  )

  const reset = useCallback(async () => {
    if (chat && chat.turns.length > 0) await db.chats.delete(chat.id)
    setChat({ id: newId('c'), recipeId: recipe.id, turns: [], updatedAt: new Date().toISOString() })
    setError(null)
  }, [chat, recipe.id])

  return { turns: chat?.turns ?? [], partial, busy, error, ask, reset, ready: chat !== null }
}
