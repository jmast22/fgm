import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export default function Profile() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return
      
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single()
        
      if (!error && data) {
        setDisplayName(data.display_name || '')
      }
      setLoading(false)
    }
    
    fetchProfile()
  }, [user])

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    
    setSaving(true)
    setMessage(null)
    
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName })
      .eq('id', user.id)
      
    if (error) {
      setMessage({ type: 'error', text: 'Error updating profile' })
    } else {
      setMessage({ type: 'success', text: 'Profile updated successfully' })
    }
    
    setSaving(false)
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  if (loading) return <div className="p-8 text-center text-surface-400">Loading profile...</div>

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-surface-700">
        <div>
          <h1 className="text-3xl font-display font-bold text-surface-100">Your Profile</h1>
          <p className="text-surface-400 mt-1">Manage your account settings</p>
        </div>
        <div className="w-16 h-16 rounded-full bg-primary-600/30 border-2 border-primary-500/50 flex items-center justify-center text-3xl">
          ⛳
        </div>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg border text-sm ${
          message.type === 'success' 
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      <div className="bg-surface-800 border border-surface-700 rounded-xl p-6 shadow-xl mb-6">
        <h2 className="text-xl font-bold mb-4">Account Information</h2>
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1">Email</label>
            <input
              type="text"
              disabled
              value={user?.email || ''}
              className="w-full px-4 py-2 rounded-lg bg-surface-900 border border-surface-700 text-surface-400 opacity-70 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-surface-900 border border-surface-600 focus:border-primary-500 text-surface-100"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-100 font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-surface-800 border border-surface-700 rounded-xl p-6 shadow-xl pt-4">
        <h2 className="text-xl font-bold text-red-400 mb-4">Danger Zone</h2>
        <button
          onClick={handleSignOut}
          className="px-6 py-2 rounded-lg border border-red-500/50 text-red-500 hover:bg-red-500/10 font-medium transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
