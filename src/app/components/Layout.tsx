import { Link, NavLink, Outlet } from 'react-router'
import { APP_NAME } from '../branding'
import TimerBar from './TimerBar'

export default function Layout() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-brand-200 bg-brand-50/90 px-4 py-3 backdrop-blur">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold text-brand-900">
          <img src="/icon.svg" alt="" className="h-7 w-7 rounded-md" />
          {APP_NAME}
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <NavLink to="/importa" className="btn-ghost px-3 py-1.5">
            ✨ Importa
          </NavLink>
          <NavLink to="/ricetta/nuova" className="btn-primary px-3 py-1.5">
            + Nuova
          </NavLink>
          <NavLink to="/impostazioni" className="btn-ghost px-3 py-1.5" aria-label="Impostazioni">
            ⚙︎
          </NavLink>
        </nav>
      </header>
      <TimerBar />
      <main className="flex-1 px-4 py-4">
        <Outlet />
      </main>
    </div>
  )
}
