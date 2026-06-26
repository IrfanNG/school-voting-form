import { useEffect, useCallback, useState } from 'react'
import Landing from './pages/Landing'
import Voter from './pages/Voter'
import ThankYou from './pages/ThankYou'
import Admin from './pages/Admin'
import { api } from './api'
import type { SessionUser } from './types'

export type Route = 'landing' | 'vote' | 'thankyou' | 'admin'
export type ThankYouMode = 'done' | 'locked'

function currentRoute(): Route {
  const h = window.location.hash.replace(/^#/, '').toLowerCase()
  if (h.startsWith('/admin')) return 'admin'
  if (h.startsWith('/vote')) return 'vote'
  if (h.startsWith('/thank-you') || h.startsWith('/thankyou')) return 'thankyou'
  return 'landing'
}

function navigate(route: Route) {
  const map: Record<Route, string> = {
    landing: '#/',
    vote: '#/vote',
    thankyou: '#/thank-you',
    admin: '#/admin',
  }
  window.location.hash = map[route]
}

export default function App() {
  const [route, setRoute] = useState<Route>(currentRoute())
  const [user, setUser] = useState<SessionUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [voteChecked, setVoteChecked] = useState(false)
  const [hasVoted, setHasVoted] = useState(false)
  const [thanksMode, setThanksMode] = useState<ThankYouMode>('done')

  useEffect(() => {
    const onHash = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    api.me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true))
  }, [])

  const checkVoteStatus = useCallback(async () => {
    try {
      const status = await api.voteStatus()
      setHasVoted(status.hasVoted)
      return status.hasVoted
    } catch {
      setHasVoted(false)
      return false
    } finally {
      setVoteChecked(true)
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setHasVoted(false)
      setVoteChecked(true)
      return
    }

    setVoteChecked(false)
    checkVoteStatus().then((alreadyVoted) => {
      if (alreadyVoted && (route === 'landing' || route === 'vote')) {
        setThanksMode('locked')
        navigate('thankyou')
      }
    })
  }, [user, route, checkVoteStatus])

  useEffect(() => {
    if (route === 'vote' && authChecked && !user) navigate('landing')
  }, [route, authChecked, user])

  const handleSignedIn = useCallback(async () => {
    const session = await api.me()
    setUser(session.user)
    setVoteChecked(false)
    const alreadyVoted = await checkVoteStatus()
    if (alreadyVoted) {
      setThanksMode('locked')
      navigate('thankyou')
      return
    }
    navigate('vote')
  }, [checkVoteStatus])

  const handleVoted = useCallback(() => {
    setHasVoted(true)
    setThanksMode('done')
    navigate('thankyou')
  }, [])

  if (route === 'admin') return <Admin />

  const checkingVoteBeforeForm = route === 'vote' && !!user && !voteChecked
  const showVoteForm = route === 'vote' && !!user && voteChecked && !hasVoted
  const showThankYou = route === 'thankyou' || (hasVoted && authChecked && voteChecked)
  const showLanding = route === 'landing' && !showThankYou

  return (
    <div className="app-shell">
      {checkingVoteBeforeForm && (
        <div className="card form-card">
          <p className="muted">Menyemak status undian…</p>
        </div>
      )}
      {showVoteForm && <Voter user={user} onVoted={handleVoted} />}
      {showThankYou && <ThankYou mode={thanksMode} />}
      {showLanding && <Landing signedIn={!!user} onSignedIn={handleSignedIn} />}
      <footer className="footer">
        <p className="muted small">Cybergen Junior Voting Forms · satu undian per akaun Google</p>
        <p className="muted small credits">Credits: Azim Ayub x Irfan Ariff</p>
      </footer>
    </div>
  )
}
