import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function SignUp() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    // Sign up the user (passed display_name in metadata so the DB trigger creates profile)
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }
    
    navigate('/')
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center -mt-6">
      <div className="w-full max-w-md p-8 rounded-2xl bg-surface-800 border border-surface-700 shadow-2xl animate-scale-in">
        <div className="text-center mb-8">
          <span className="text-4xl block mb-4">⛳</span>
          <h1 className="text-3xl font-display font-bold text-primary-400">Join the Tour</h1>
          <p className="text-surface-400 mt-2">Create an account to start drafting</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSignUp} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1">Display Name</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-surface-900 border border-surface-600 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-surface-100 transition-colors"
              placeholder="e.g. TigerWoods99"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-surface-900 border border-surface-600 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-surface-100 transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-surface-900 border border-surface-600 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-surface-100 transition-colors"
              placeholder="••••••••"
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-medium shadow-lg hover:shadow-primary-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            {loading ? 'Creating Account...' : 'Sign Up'}
          </button>
        </form>

        <p className="mt-6 text-center text-surface-400 text-sm">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
