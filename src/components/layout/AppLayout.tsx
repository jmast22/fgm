import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ThemeToggle } from '../common/ThemeToggle'

interface AppLayoutProps {
  children: ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user } = useAuth()
  const location = useLocation()
  
  const navItems = [
    { name: 'Dashboard', path: '/', icon: '🏠' },
    { name: 'Profile', path: '/profile', icon: '👤' },
    ...(user?.email === 'jmast22@gmail.com' ? [{ name: 'Admin', path: '/admin/import', icon: '⚙️' }] : []),
  ]

  // Without session, just show a minimal layout
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-surface-950">
        <header className="bg-surface-900/80 backdrop-blur-md border-b border-surface-800 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 no-underline group text-surface-100">
              <span className="text-2xl group-hover:scale-110 transition-transform duration-200">⛳</span>
              <span className="font-display font-bold text-lg text-primary-400 tracking-tight">FGM</span>
            </Link>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 w-full px-4 py-4 mb-safe">
          {children}
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-surface-950">
      {/* Mobile Top Header */}
      <header className="md:hidden bg-surface-900/80 backdrop-blur-md border-b border-surface-800 sticky top-0 z-50">
        <div className="px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 no-underline group text-surface-100">
            <span className="text-2xl">⛳</span>
            <span className="font-display font-bold text-lg text-primary-400 tracking-tight">FGM</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-surface-900/80 border-r border-surface-800 h-screen sticky top-0 py-6 z-50 shadow-2xl">
        <Link to="/" className="flex items-center gap-3 no-underline group mb-10 px-6 text-surface-100">
          <span className="text-3xl group-hover:scale-110 transition-transform duration-200">⛳</span>
          <div className="flex flex-col">
            <span className="font-display font-black text-2xl text-primary-400 tracking-tight leading-none group-hover:text-primary-300 transition-colors">
              FGM
            </span>
            <span className="text-[10px] text-surface-500 font-bold uppercase tracking-widest mt-0.5">Fantasy Golf</span>
          </div>
        </Link>

        <nav className="flex-1 flex flex-col gap-2 px-4">
          {navItems.map(item => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all duration-200 group ${
                  isActive 
                    ? 'bg-primary-600/15 text-primary-400 border border-primary-500/20 shadow-glow/10 relative' 
                    : 'text-surface-400 hover:bg-surface-800/80 hover:text-surface-100'
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary-500 rounded-r-full shadow-glow" />
                )}
                <span className={`text-xl transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-110 grayscale group-hover:grayscale-0 opacity-70 group-hover:opacity-100'}`}>
                  {item.icon}
                </span>
                <span className="tracking-wide">{item.name}</span>
              </Link>
            )
          })}
        </nav>
        
        <div className="px-4 mt-auto space-y-4">
          <ThemeToggle />
          <div className="p-4 rounded-2xl bg-surface-800/40 border border-surface-700/50 flex flex-col items-center justify-center gap-2">
            <span className="text-[10px] text-surface-500 font-bold uppercase tracking-widest">Version</span>
            <span className="text-xs text-surface-300 font-mono bg-surface-950 px-2 py-1 rounded">Beta 1.0</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl px-4 py-6 md:p-10 pb-24 md:pb-10 flex flex-col min-h-0 relative h-full">
        <div className="flex-1 w-full h-full max-w-5xl mx-auto">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface-900/90 backdrop-blur-xl border-t border-surface-800 z-50 pb-safe pt-1">
        <div className="flex items-center justify-around h-[64px] px-2 max-w-md mx-auto relative">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`relative flex flex-col items-center justify-center w-full h-full space-y-1 transition-all duration-300 ${
                  isActive ? 'text-primary-400' : 'text-surface-500 hover:text-surface-300'
                }`}
              >
                <div className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 ${isActive ? 'bg-primary-600/20' : ''}`}>
                  <span className={`text-xl transition-all duration-300 ${isActive ? 'scale-110 drop-shadow-xl' : 'grayscale opacity-70'}`}>
                    {item.icon}
                  </span>
                </div>
                <span className={`text-[9px] font-black tracking-widest uppercase transition-all duration-300 ${isActive ? 'text-primary-400 opacity-100' : 'opacity-70'}`}>
                  {item.name}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
