import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

interface AppLayoutProps {
  children: ReactNode
}



export default function AppLayout({ children }: AppLayoutProps) {
  const { session } = useAuth()
  
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Header - Minimalist */}
      <header className="bg-surface-800/80 backdrop-blur-md border-b border-surface-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 no-underline group">
            <span className="text-2xl group-hover:scale-110 transition-transform duration-200">⛳</span>
            <span className="font-display font-bold text-lg text-primary-400 tracking-tight group-hover:text-primary-300 transition-colors">
              FGM
            </span>
          </Link>

          {/* User Menu */}
          {session && (
            <div className="flex items-center gap-3">
              <Link to="/profile" className="w-8 h-8 rounded-full bg-primary-600/20 hover:bg-primary-500/30 border border-primary-500/20 flex items-center justify-center text-sm transition-all duration-200 cursor-pointer no-underline hover:scale-105 active:scale-95">
                👤
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-4 animate-fade-in mb-safe">
        {children}
      </main>
    </div>
  )
}
