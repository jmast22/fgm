import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

interface AppLayoutProps {
  children: ReactNode
}

const navItems = [
  { path: '/', label: 'Dashboard', icon: '🏠' },
  { path: '/leagues', label: 'Leagues', icon: '🏆' },
  { path: '/tournaments', label: 'Tournaments', icon: '⛳' },
  { path: '/draft', label: 'Draft', icon: '📋' },
  { path: '/admin/import', label: 'Admin', icon: '⚙️' },
]

export default function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation()
  const { session } = useAuth()
  
  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup'

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Header */}
      <header className="bg-surface-800/80 backdrop-blur-md border-b border-surface-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 no-underline">
            <span className="text-2xl">⛳</span>
            <span className="font-display font-bold text-lg text-primary-400 tracking-tight">
              Fantasy Golf
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {session && !isAuthPage && navItems.map((item) => {
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 no-underline
                    ${isActive
                      ? 'bg-primary-600/20 text-primary-400'
                      : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'
                    }
                  `}
                >
                  <span className="mr-1.5">{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* User Menu */}
          {session ? (
            <Link to="/profile" className="w-8 h-8 rounded-full bg-primary-600/30 hover:bg-primary-500/40 border border-primary-500/30 flex items-center justify-center text-sm transition-colors cursor-pointer no-underline">
              👤
            </Link>
          ) : (
            <div className="w-8 h-8 flex items-center justify-center" />
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 animate-fade-in">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      {session && !isAuthPage && (
        <>
          <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface-800/95 backdrop-blur-md border-t border-surface-700 z-50 safe-area-pb">
            <div className="flex items-center justify-around h-16">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`
                      flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all duration-200 no-underline
                      ${isActive
                        ? 'text-primary-400'
                        : 'text-surface-500 hover:text-surface-300'
                      }
                    `}
                  >
                    <span className="text-xl">{item.icon}</span>
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </nav>

          {/* Bottom padding for mobile nav */}
          <div className="md:hidden h-16" />
        </>
      )}
    </div>
  )
}
