import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router'
import { seedIfEmpty } from '@/data/repo'
import Layout from './components/Layout'
import RecipeList from './pages/RecipeList'
import RecipeView from './pages/RecipeView'
import CookMode from './pages/CookMode'
import RecipeWizard from './pages/RecipeWizard'
import Settings from './pages/Settings'
import ImportPage from './pages/ImportPage'

export default function App() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    seedIfEmpty().finally(() => setReady(true))
  }, [])
  if (!ready) return null
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<RecipeList />} />
        <Route path="ricetta/nuova" element={<RecipeWizard />} />
        <Route path="ricetta/:id" element={<RecipeView />} />
        <Route path="ricetta/:id/modifica" element={<RecipeWizard />} />
        <Route path="impostazioni" element={<Settings />} />
        <Route path="importa" element={<ImportPage />} />
      </Route>
      <Route path="ricetta/:id/cucina" element={<CookMode />} />
    </Routes>
  )
}
