import { useEffect, useState } from 'react'
import GoogleButton from '../components/GoogleButton'
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
  const [newSchool, setNewSchool] = useState('')
  const [section, setSection] = useState<Section>('overview')

  useEffect(() => {
    api.me()
      .then((r) => {
        setUser(r.user)
        if (r.user.role !== 'admin') setAuthError('This account is not an admin.')
      })
      .catch(() => {})
      .finally(() => setAuthLoading(false))
  }, [])

  useEffect(() => {
    if (user?.role !== 'admin') return
    refreshAll()
  }, [user])

  async function refreshAll() {
    setErr('')
    try {
      const [r, s, sc] = await Promise.all([
        api.results(),
        api.votingStatus(),
        api.schools(),
      ])
      setResults(r)
      setStatus(s)
      setSchools(sc.schools)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function handleCredential(idToken: string) {
    setAuthLoading(true)
    setAuthError('')
    try {
      const { session } = await api.verify(idToken)
      setUser(session)
      if (session.role !== 'admin') setAuthError('This account is not an admin.')
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
          <h1>Admin Dashboard</h1>
          <p className="muted">Sign in with an allowed admin Google account.</p>
          {authError && <div className="alert error">{authError}</div>}
          {authLoading ? <p className="muted">Loading…</p> : <GoogleButton onCredential={handleCredential} />}
        </div>
      </div>
    )
  }

  if (user.role !== 'admin') {
    return (
      <div className="admin-login">
        <div className="card">
          <h1>Admin Dashboard</h1>
          <div className="alert error">{authError || 'Not an admin account.'}</div>
        </div>
      </div>
    )
  }

  const maxCount = results ? Math.max(1, ...results.totals.map((t) => t.count)) : 1
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
          <span className="brand-mark">★</span>
          <div>
            <div className="brand-title">School Voting</div>
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
          <button className="btn-outline sm full" onClick={toggleVoting} disabled={working}>
            {status?.votingStatus === 'open' ? 'Close voting' : 'Reopen voting'}
          </button>
          <button className="btn-outline sm full" onClick={refreshAll} disabled={working} style={{ marginTop: 8 }}>
            Refresh
          </button>
        </div>
      </aside>

      <main className="admin-main">
        {err && <div className="alert error">{err}</div>}

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

            <div className="card">
              <h2>Votes by school</h2>
              {results && results.totals.length > 0 ? (
                <div className="bars">
                  {results.totals.map((t, i) => (
                    <div className="bar-row" key={t.schoolName}>
                      <div className="bar-name">
                        {i === 0 && <span className="crown">★</span>} {t.schoolName}
                      </div>
                      <div className="bar-track">
                        <div
                          className={'bar-fill' + (i === 0 ? ' top' : '')}
                          style={{ width: `${(t.count / maxCount) * 100}%` }}
                        />
                        <span className="bar-count">{t.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No votes yet.</p>
              )}
            </div>
          </>
        )}

        {section === 'records' && (
          <div className="card">
            <div className="row between">
              <h2>Vote records</h2>
              <button className="btn-outline sm" onClick={exportCsv} disabled={!results?.votes.length}>
                Export CSV
              </button>
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
                  <span>{s.schoolName}</span>
                  <span className="muted small">{s.schoolId}</span>
                  <button
                    className={'btn-outline sm ' + (s.active ? 'on' : 'off')}
                    onClick={() => toggleSchoolActive(s)}
                    disabled={working}
                  >
                    {s.active ? 'Active' : 'Inactive'}
                  </button>
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