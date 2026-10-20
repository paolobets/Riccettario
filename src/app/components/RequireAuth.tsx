import { Navigate, Outlet, useLocation } from 'react-router'
import { HOSTED } from '@/ai/settings'
import { useSignedIn } from '@/auth/session'

/**
 * Con il backend integrato l'app si usa solo con un account: chi non è
 * entrato viene portato all'accesso e, dopo, riportato dove voleva andare.
 * Senza backend (GitHub Pages, locale) non cambia nulla.
 */
export default function RequireAuth() {
  const signedIn = useSignedIn()
  const location = useLocation()
  if (!HOSTED) return <Outlet />
  if (signedIn === undefined) return null
  if (!signedIn) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/accedi${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} replace />
  }
  return <Outlet />
}
