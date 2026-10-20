import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router'
import { seedIfEmpty } from '@/data/repo'
import { HOSTED } from '@/ai/settings'
import { startSync } from '@/data/sync'
import Layout from './components/Layout'
import RecipeList from './pages/RecipeList'
import RecipeView from './pages/RecipeView'
import CookMode from './pages/CookMode'
import RecipeWizard from './pages/RecipeWizard'
import Settings from './pages/Settings'
import ImportPage from './pages/ImportPage'
import NotFound from './pages/NotFound'
import SuggestPage from './pages/SuggestPage'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import ForgotPage from './pages/auth/ForgotPage'
import ResetPage from './pages/auth/ResetPage'
import ShoppingPage from './pages/ShoppingPage'
import SharedPage from './pages/SharedPage'
import ComposePage from './pages/ComposePage'
import SplitPage from './pages/SplitPage'
import LabelPage from './pages/LabelPage'
import AdminPage from './pages/AdminPage'
import RequireAuth from './components/RequireAuth'

export default function App() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let stop: (() => void) | undefined
    // Con il backend l'archivio arriva dal server: niente esempi non richiesti nell'account.
    ;(HOSTED ? Promise.resolve() : seedIfEmpty()).finally(() => {
      setReady(true)
      stop = startSync()
    })
    return () => stop?.()
  }, [])
  if (!ready) return null
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route element={<RequireAuth />}>
          <Route index element={<RecipeList />} />
          <Route path="ricetta/nuova" element={<RecipeWizard />} />
          <Route path="ricetta/:id" element={<RecipeView />} />
          <Route path="ricetta/:id/modifica" element={<RecipeWizard />} />
          <Route path="ricetta/:id/scomponi" element={<SplitPage />} />
          <Route path="ricetta/:id/etichetta" element={<LabelPage />} />
          <Route path="componi" element={<ComposePage />} />
          <Route path="impostazioni" element={<Settings />} />
          <Route path="importa" element={<ImportPage />} />
          <Route path="cosa-preparo" element={<SuggestPage />} />
          <Route path="spesa" element={<ShoppingPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="condivisa" element={<SharedPage />} />
        <Route path="amministrazione" element={<AdminPage />} />
        <Route path="accedi" element={<LoginPage />} />
        <Route path="registrati" element={<RegisterPage />} />
        <Route path="password-dimenticata" element={<ForgotPage />} />
        <Route path="reimposta" element={<ResetPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="ricetta/:id/cucina" element={<CookMode />} />
      </Route>
    </Routes>
  )
}
