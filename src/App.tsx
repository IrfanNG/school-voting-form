import { useEffect, useState } from 'react'
import Voter from './pages/Voter'
import Admin from './pages/Admin'

type Route = 'vote' | 'admin'

function currentRoute(): Route {
  const h = window.location.hash.replace(/^#/, '').toLowerCase()
  return h.startsWith('/admin') ? 'admin' : 'vote'
}

export default function App() {
  const [route, setRoute] = useState<Route>(currentRoute())

  useEffect(() => {
    const onHash = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="app-shell">
      <nav className="topnav">
        <button
          className={'nav ' + (route === 'vote' ? 'active' : '')}
          onClick={() => (window.location.hash = '/vote')}
        >
          Vote
        </button>
        <button
          className={'nav ' + (route === 'admin' ? 'active' : '')}
          onClick={() => (window.location.hash = '/admin')}
        >
          Admin
        </button>
      </nav>
      {route === 'admin' ? <Admin /> : <Voter />}
      <p className="muted small footer">School Voting Forms · one vote per Google account</p>
    </div>
  )
}