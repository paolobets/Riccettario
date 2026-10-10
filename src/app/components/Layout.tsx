import { Link, NavLink, Outlet } from 'react-router'
import { APP_NAME } from '../branding'
import TimerBar from './TimerBar'
import Icon from './Icon'

export default function Layout() {
  const nav = ({ isActive }: { isActive: boolean }) => `btn-ghost min-h-10 px-3 py-1.5 text-sm ${isActive ? 'bg-accent-soft' : ''}`
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/85 px-4 py-2 backdrop-blur-md">
        <Link to="/" className="font-display flex min-h-10 items-center gap-2 text-xl font-semibold text-fg">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-7 w-7 rounded-lg" />
          {APP_NAME}
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink to="/importa" className={nav} aria-label="Importa con l'AI">
            <Icon name="sparkles" size={16} />
            <span className="hidden sm:inline">Importa</span>
          </NavLink>
          <NavLink to="/ricetta/nuova" className="btn-primary min-h-10 px-3 py-1.5 text-sm">
            <Icon name="plus" size={16} />
            Nuova
          </NavLink>
          <NavLink to="/impostazioni" className={nav} aria-label="Impostazioni">
            <Icon name="settings" size={18} />
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
