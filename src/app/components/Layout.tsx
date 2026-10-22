import { Link, NavLink, Outlet } from 'react-router'
import { APP_NAME } from '../branding'
import TimerBar from './TimerBar'
import Icon from './Icon'
import { HOSTED } from '@/ai/settings'
import { useSignedIn } from '@/auth/session'

export default function Layout() {
  const signedIn = useSignedIn()
  const locked = HOSTED && signedIn === false
  const nav = ({ isActive }: { isActive: boolean }) => `btn-ghost min-h-10 min-w-10 px-2 py-1.5 text-sm ${isActive ? 'bg-accent-soft' : ''}`
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
      <header className="sticky top-[env(safe-area-inset-top)] z-10 flex items-center justify-between border-b border-line bg-bg/85 px-4 py-2 backdrop-blur-md print:hidden">
        <Link to="/" className="font-display flex min-h-10 items-center gap-2 text-xl font-semibold text-fg">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-7 w-7 rounded-lg" />
          {APP_NAME}
        </Link>
        {!locked && (
        <nav className="flex items-center gap-1">
          <NavLink to="/spesa" className={nav} aria-label="Lista della spesa">
            <Icon name="cart" size={18} />
          </NavLink>
          <NavLink to="/importa" className={nav} aria-label="Importa con l'AI">
            <Icon name="sparkles" size={16} />
            <span className="hidden sm:inline">Importa</span>
          </NavLink>
          <NavLink to="/ricetta/nuova" className="btn-primary min-h-10 min-w-10 px-2 py-1.5 text-sm min-[360px]:px-3" aria-label="Nuova ricetta">
            <Icon name="plus" size={16} />
            <span className="hidden min-[360px]:inline">Nuova</span>
          </NavLink>
          <NavLink to="/impostazioni" className={nav} aria-label="Impostazioni">
            <Icon name="settings" size={18} />
          </NavLink>
        </nav>
        )}
      </header>
      <div className="print:hidden">
        <TimerBar />
      </div>
      <main className="flex-1 px-4 py-4">
        <Outlet />
      </main>
    </div>
  )
}
