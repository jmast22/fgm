import { useState, useEffect } from 'react'
import { rosterService, type RosterGolfer } from '../../services/rosterService'
import { tradeService } from '../../services/tradeService'
import type { League, Team } from '../../services/leagueService'

interface ProposeTradeModalProps {
  league: League
  myTeam: Team
  teams: Team[]
  onClose: () => void
  onSuccess: () => void
}

export default function ProposeTradeModal({ league, myTeam, teams, onClose, onSuccess }: ProposeTradeModalProps) {
  const [selectedRecipientId, setSelectedRecipientId] = useState('')
  const [myRoster, setMyRoster] = useState<RosterGolfer[]>([])
  const [recipientRoster, setRecipientRoster] = useState<RosterGolfer[]>([])
  const [mySelected, setMySelected] = useState<string[]>([])
  const [recipientSelected, setRecipientSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const otherTeams = teams.filter(t => t.id !== myTeam.id && t.user_id)

  useEffect(() => {
    async function loadRosters() {
      setLoading(true)
      try {
        const myData = await rosterService.getTeamRoster(myTeam.id)
        setMyRoster(myData)

        if (selectedRecipientId) {
          const recipientData = await rosterService.getTeamRoster(selectedRecipientId)
          setRecipientRoster(recipientData)
        }
      } catch (err) {
        console.error('Error loading rosters:', err)
      } finally {
        setLoading(false)
      }
    }
    loadRosters()
  }, [selectedRecipientId, myTeam.id])

  const handleToggleMy = (id: string) => {
    setMySelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const handleToggleRecipient = (id: string) => {
    setRecipientSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const handleSubmit = async () => {
    if (!selectedRecipientId || (mySelected.length === 0 && recipientSelected.length === 0)) {
      alert('Please select a recipient and at least one golfer to trade.')
      return
    }

    setSubmitting(true)
    try {
      await tradeService.proposeTrade({
        league_id: league.id,
        offering_team_id: myTeam.id,
        receiving_team_id: selectedRecipientId,
        offered_golfers: mySelected,
        requested_golfers: recipientSelected,
        status: 'pending'
      })
      onSuccess()
    } catch (err: any) {
      alert('Error proposing trade: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-sm">
      <div className="bg-surface-800 border border-surface-700 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="p-6 border-b border-surface-700 flex items-center justify-between bg-surface-800/50">
          <div>
            <h2 className="text-2xl font-display font-bold text-surface-50">Propose Trade</h2>
            <p className="text-surface-400 text-sm">Swap golfers with another team in {league.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-700 rounded-xl transition-colors text-surface-400">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div>
            <label className="block text-surface-400 text-xs font-bold uppercase tracking-wider mb-3">Trade With</label>
            <select 
              value={selectedRecipientId}
              onChange={e => setSelectedRecipientId(e.target.value)}
              className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-surface-100 focus:ring-2 focus:ring-primary-500/50 outline-none transition-all"
            >
              <option value="">Select a team...</option>
              {otherTeams.map(t => (
                <option key={t.id} value={t.id}>{t.team_name}</option>
              ))}
            </select>
          </div>

          <div className="grid md:grid-cols-2 gap-8 relative">
            {loading && (
              <div className="absolute inset-0 bg-surface-800/50 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-2xl">
                <div className="flex items-center gap-3 text-primary-400 font-bold">
                  <span className="animate-spin text-2xl">⏳</span> Loading Rosters...
                </div>
              </div>
            )}
            {/* My Team */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-surface-500 uppercase tracking-widest">Your Golfers (Offered)</h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
                {myRoster.map(golfer => (
                  <button
                    key={golfer.id}
                    onClick={() => handleToggleMy(golfer.id)}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${mySelected.includes(golfer.id) ? 'bg-primary-600/10 border-primary-500 text-primary-400' : 'bg-surface-900/50 border-surface-700/50 text-surface-400 hover:border-surface-600'}`}
                  >
                    <span className="font-bold">{golfer.name}</span>
                    <span className="text-xs">{mySelected.includes(golfer.id) ? '✓' : ''}</span>
                  </button>
                ))}
                {myRoster.length === 0 && <p className="text-surface-500 italic text-sm text-center py-4">Your roster is empty.</p>}
              </div>
            </div>

            {/* Recipient Team */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-surface-500 uppercase tracking-widest">Their Golfers (Requested)</h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
                {selectedRecipientId ? (
                  recipientRoster.map(golfer => (
                    <button
                      key={golfer.id}
                      onClick={() => handleToggleRecipient(golfer.id)}
                      className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${recipientSelected.includes(golfer.id) ? 'bg-primary-600/10 border-primary-500 text-primary-400' : 'bg-surface-900/50 border-surface-700/50 text-surface-400 hover:border-surface-600'}`}
                    >
                      <span className="font-bold">{golfer.name}</span>
                      <span className="text-xs">{recipientSelected.includes(golfer.id) ? '✓' : ''}</span>
                    </button>
                  ))
                ) : (
                  <p className="text-surface-600 italic text-sm text-center py-4">Select a team to see their roster.</p>
                )}
                {selectedRecipientId && recipientRoster.length === 0 && <p className="text-surface-500 italic text-sm text-center py-4">Their roster is empty.</p>}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-surface-700 bg-surface-800/50 flex gap-4">
          <button 
            onClick={handleSubmit}
            disabled={submitting || !selectedRecipientId}
            className="flex-1 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-surface-900 font-black py-4 rounded-2xl transition-all shadow-glow/20 uppercase tracking-wider"
          >
            {submitting ? 'Proposing...' : '🚀 Send Trade Proposal'}
          </button>
          <button 
            onClick={onClose}
            className="flex-1 bg-surface-700 hover:bg-surface-600 text-surface-100 font-bold py-4 rounded-2xl transition-all shadow-lg uppercase tracking-wider"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
