import { useEffect, useRef, useState } from 'react'
import GoogleButton from '../components/GoogleButton'
import DonutChart from '../components/DonutChart'
import { api } from '../api'
import type { ResultsResponse, SchoolInfo, SessionUser } from '../types'

type Section = 'overview' | 'records' | 'schools'

export default function Admin() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [results, setResults] = useState<ResultsResponse | null>(null)
  const [status, setStatus] = useState<{ votingStatus: 'open' | 'closed'; closedAt: string; closedBy: string } | null>(null)
  const [schools, setSchools] = useState<SchoolInfo[]>([])
  const [filter, setFilter] = useState('')
  const [working, setWorking] = useState(false)
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [newSchool, setNewSchool] = useState('')
  const [section, setSection] = useState<Section>('overview')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)

  useEffect(() => {
    api.me()
      .then((r) => setUser(r.user))
      .catch(() => {})
      .finally(() => setAuthLoading(false))
  }, [])

  const liveLoadingRef = useRef(false)
  const refreshLiveRef = useRef<() => void>(() => {})
  const refreshAllRef = useRef<() => void>(() => {})

  useEffect(() => {
    liveLoadingRef.current = liveLoading
  }, [liveLoading])

  useEffect(() => {
    if (user?.role !== 'admin') return
    void refreshAllRef.current()
    const interval = setInterval(() => { void refreshLiveRef.current() }, 5000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshLiveRef.current()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user])

  async function refreshAll() {
    setErr('')
    setNotice('')
    try {
      const [r, s, sc] = await Promise.all([
        api.results(),
        api.votingStatus(),
        api.schools(),
      ])
      setResults(r)
      setStatus(s)
      setSchools(sc.schools)
      setLastUpdated(new Date())
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function refreshLive() {
    if (liveLoading || liveLoadingRef.current) return
    setLiveLoading(true)
    try {
      const [r, s] = await Promise.all([
        api.results(),
        api.votingStatus(),
      ])
      setResults(r)
      setStatus(s)
      setLastUpdated(new Date())
      if (err) setErr('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLiveLoading(false)
    }
  }

  refreshLiveRef.current = refreshLive
  refreshAllRef.current = refreshAll

  async function handleCredential(idToken: string) {
    setAuthLoading(true)
    setAuthError('')
    try {
      const { session } = await api.verify(idToken, { adminAccess: true })
      setUser(session)
    } catch (e) {
      setAuthError((e as Error).message)
    } finally {
      setAuthLoading(false)
    }
  }

  async function toggleVoting() {
    if (!status) return
    setWorking(true)
    try {
      await api.setVotingStatus(status.votingStatus === 'open' ? 'closed' : 'open')
      await refreshAll()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  async function addSchool() {
    if (!newSchool.trim()) return
    setWorking(true)
    try {
      await api.addSchool(newSchool.trim(), true)
      setNewSchool('')
      await refreshAll()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  async function toggleSchoolActive(s: SchoolInfo) {
    setWorking(true)
    try {
      await api.updateSchool({ schoolId: s.schoolId, active: !s.active })
      await refreshAll()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  function startEdit(s: SchoolInfo) {
    setEditingId(s.schoolId)
    setEditName(s.schoolName)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
  }

  async function saveEdit(s: SchoolInfo) {
    if (!editName.trim()) return
    setWorking(true)
    try {
      await api.updateSchool({ schoolId: s.schoolId, schoolName: editName.trim() })
      setEditingId(null)
      setEditName('')
      await refreshAll()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  async function deleteSchool(s: SchoolInfo) {
    if (!confirm('Delete this school? Existing vote records will remain unchanged.')) return
    setWorking(true)
    try {
      await api.deleteSchool(s.schoolId)
      await refreshAll()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  async function clearVotes() {
    if (!confirm('Clear all vote records? This cannot be undone.')) return
    setWorking(true)
    setErr('')
    setNotice('')
    try {
      const res = await api.clearVotes()
      await refreshAll()
      setNotice(`Cleared ${res.cleared} vote record${res.cleared === 1 ? '' : 's'}.`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  function exportCsv() {
    if (!results) return
    const headers = ['timestamp', 'voterName', 'voterSchool', 'votedSchool', 'email', 'googleSub']
    const rows = results.votes.map((v) => [
      v.timestamp, v.voterName, v.voterSchool, v.votedSchool, v.email, v.googleSub,
    ])
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `votes-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!user) {
    return (
      <div className="admin-login">
        <div className="card">
          <h1>Cybergen Junior Voting Forms</h1>
          <p className="muted">Admin Dashboard · Sign in with Google to continue.</p>
          <p className="muted small credits">Credits: Azim Ayub x Irfan Ariff</p>
          {authError && <div className="alert error">{authError}</div>}
          {authLoading ? <p className="muted">Loading…</p> : <GoogleButton onCredential={handleCredential} />}
        </div>
        <p className="credits" style={{ textAlign: 'center', marginTop: 16 }}>Credits: Azim Ayub x Irfan Ariff</p>
      </div>
    )
  }

  if (user.role !== 'admin') {
    return (
      <div className="admin-login">
        <div className="card">
          <h1>Cybergen Junior Voting Forms</h1>
          <p className="muted">Admin Dashboard · Sign in again to continue as admin.</p>
          <p className="muted small credits">Credits: Azim Ayub x Irfan Ariff</p>
          {authError && <div className="alert error">{authError}</div>}
          <GoogleButton onCredential={handleCredential} />
        </div>
        <p className="credits" style={{ textAlign: 'center', marginTop: 16 }}>Credits: Azim Ayub x Irfan Ariff</p>
      </div>
    )
  }

  const filtered = results
    ? results.votes.filter((v) => {
        const q = filter.toLowerCase()
        if (!q) return true
        return (
          v.voterName.toLowerCase().includes(q) ||
          v.voterSchool.toLowerCase().includes(q) ||
          v.votedSchool.toLowerCase().includes(q) ||
          v.email.toLowerCase().includes(q)
        )
      })
    : []

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/cybergen-logo.png" alt="Cybergen Junior logo" className="brand-logo" />
          <div>
            <div className="brand-title">Cybergen Junior Voting Forms</div>
            <div className="muted small">Admin Dashboard</div>
          </div>
        </div>

        <div className="side-user">
          <div className="dot-ok" />
          <div className="side-user-info">
            <div className="side-email">{user.email}</div>
            <div className="muted small">
              {status?.votingStatus === 'open' ? 'Voting open' : 'Voting closed'}
            </div>
          </div>
        </div>

        <nav className="side-nav">
          <button className={section === 'overview' ? 'active' : ''} onClick={() => setSection('overview')}>
            Overview
          </button>
          <button className={section === 'records' ? 'active' : ''} onClick={() => setSection('records')}>
            Vote Records
          </button>
          <button className={section === 'schools' ? 'active' : ''} onClick={() => setSection('schools')}>
            Schools
          </button>
        </nav>

        <div className="side-footer">
          <div className="live-status" aria-live="polite">
            <span className={'live-dot' + (liveLoading ? ' pulse' : '')} />
            <span>
              {lastUpdated
                ? `Live · updated ${lastUpdated.toLocaleTimeString()}`
                : liveLoading ? 'Live · loading…' : 'Live · waiting'}
            </span>
          </div>
          <button className="btn-outline sm full" onClick={toggleVoting} disabled={working}>
            {status?.votingStatus === 'open' ? 'Close voting' : 'Reopen voting'}
          </button>
          <button className="btn-outline sm full" onClick={refreshAll} disabled={working} style={{ marginTop: 8 }}>
            Refresh
          </button>
          <p className="muted small credits side-credits">Credits: Azim Ayub x Irfan Ariff</p>
          <p className="credits" style={{ marginTop: 12, marginBottom: 0 }}>Credits: Azim Ayub x Irfan Ariff</p>
        </div>
      </aside>

      <main className="admin-main">
        {err && <div className="alert error">{err}</div>}
        {notice && <div className="alert success">{notice}</div>}

        {section === 'overview' && (
          <>
            <div className="admin-grid">
              <div className="stat card">
                <span className="stat-label">Total votes</span>
                <span className="stat-value">{results?.totalVotes ?? 0}</span>
              </div>
              <div className="stat card">
                <span className="stat-label">Unique voters</span>
                <span className="stat-value">{results?.uniqueVoters ?? 0}</span>
              </div>
              <div className="stat card">
                <span className="stat-label">Top school</span>
                <span className="stat-value-sm">{results?.topSchool?.schoolName ?? '—'}</span>
                <span className="muted small">{results?.topSchool ? `${results.topSchool.count} votes` : ''}</span>
              </div>
              <div className="stat card">
                <span className="stat-label">Voting status</span>
                {status ? (
                  <span className={'badge ' + (status.votingStatus === 'open' ? 'open' : 'closed')}>
                    {status.votingStatus.toUpperCase()}
                  </span>
                ) : '—'}
              </div>
            </div>

            <div className="card analytics-card">
              <h2>Vote share by school</h2>
              <DonutChart totals={results?.totals ?? []} />
            </div>
          </>
        )}

        {section === 'records' && (
          <div className="card">
            <div className="row between">
              <h2>Vote records</h2>
              <div className="row">
                <button className="btn-outline sm" onClick={exportCsv} disabled={!results?.votes.length}>
                  Export CSV
                </button>
                <button className="btn-danger sm" onClick={clearVotes} disabled={working || !results?.votes.length} style={{ marginLeft: 8 }}>
                  Clear Data
                </button>
              </div>
            </div>
            <input
              className="q-input filter-input"
              placeholder="Filter by name, school, or email…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Voter</th>
                    <th>Their school</th>
                    <th>Voted for</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((v, i) => (
                    <tr key={i}>
                      <td>{new Date(v.timestamp).toLocaleString()}</td>
                      <td>{v.voterName}</td>
                      <td>{v.voterSchool}</td>
                      <td><strong>{v.votedSchool}</strong></td>
                      <td className="muted">{v.email}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} className="muted">No matching votes.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {section === 'schools' && (
          <div className="card">
            <h2>Schools</h2>
            <div className="row">
              <input
                className="q-input filter-input"
                placeholder="New school name"
                value={newSchool}
                onChange={(e) => setNewSchool(e.target.value)}
              />
              <button className="btn-primary" onClick={addSchool} disabled={working || !newSchool.trim()}>
                Add
              </button>
            </div>
            <div className="school-list">
              {schools.map((s) => (
                <div className="school-row" key={s.schoolId}>
                  {editingId === s.schoolId ? (
                    <>
                      <input
                        className="q-input school-edit-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        disabled={working}
                      />
                      <button className="btn-primary sm" onClick={() => saveEdit(s)} disabled={working || !editName.trim()}>
                        Save
                      </button>
                      <button className="btn-outline sm" onClick={cancelEdit} disabled={working}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span>{s.schoolName}</span>
                      <span className="muted small">{s.schoolId}</span>
                      <button
                        className={'btn-outline sm ' + (s.active ? 'on' : 'off')}
                        onClick={() => toggleSchoolActive(s)}
                        disabled={working}
                      >
                        {s.active ? 'Active' : 'Inactive'}
                      </button>
                      <button className="btn-outline sm" onClick={() => startEdit(s)} disabled={working}>
                        Edit
                      </button>
                      <button className="btn-danger sm" onClick={() => deleteSchool(s)} disabled={working}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              ))}
              {schools.length === 0 && <p className="muted">No schools configured.</p>}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}