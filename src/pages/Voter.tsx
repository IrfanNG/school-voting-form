import { useEffect, useState } from 'react'
import GoogleButton from '../components/GoogleButton'
import { api } from '../api'
import type { ConfigResponse, SessionUser } from '../types'

export default function Voter() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [config, setConfig] = useState<ConfigResponse | null>(null)
  const [voterName, setVoterName] = useState('')
  const [voterSchool, setVoterSchool] = useState('')
  const [votedSchool, setVotedSchool] = useState('')
  const [loading, setLoading] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [hasVoted, setHasVoted] = useState(false)

  useEffect(() => {
    api.me()
      .then((r) => setUser(r.user))
      .catch(() => {})
      .finally(() => setAuthChecking(false))
    api.config()
      .then(setConfig)
      .catch((e) => setError(e.message))
  }, [])

  const closed = config?.votingStatus === 'closed'

  // Check if the logged-in user already voted (best-effort via /api/admin/results not allowed for voters,
  // so rely on backend duplicate rejection to surface hasVoted after submit attempt).
  const canSubmit =
    !!user &&
    !closed &&
    voterName.trim().length > 0 &&
    voterSchool.trim().length > 0 &&
    votedSchool.trim().length > 0 &&
    !loading &&
    !done

  async function handleCredential(idToken: string) {
    setLoading(true)
    setError('')
    try {
      const { session } = await api.verify(idToken)
      setUser(session)
      if (session.role === 'admin') {
        setError('Admins may vote too. Admin dashboard is at #/admin.')
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function submit() {
    setLoading(true)
    setError('')
    try {
      const { message } = await api.vote({
        voterName: voterName.trim(),
        voterSchool,
        votedSchool,
      })
      setDone(true)
      setError(message || 'Vote recorded. Thank you!')
    } catch (e) {
      const msg = (e as Error).message
      if (/already voted/i.test(msg)) setHasVoted(true)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const disabled = done || hasVoted

  return (
    <div className="card form-card">
      <h1 className="form-title">School Voting Forms</h1>
      <p className="form-sub muted">Vote for the school you think should win. One vote per Google account.</p>

      <div className="login-chip">
        {authChecking ? (
          <span className="muted small">Checking session…</span>
        ) : user ? (
          <span className="chip in">
            <span className="dot-ok" /> Signed in as {user.email}
          </span>
        ) : (
          <div className="chip-row">
            <span className="muted small">Sign in to submit:</span>
            <GoogleButton onCredential={handleCredential} />
          </div>
        )}
      </div>

      {closed && (
        <div className="alert warn">
          Voting is currently closed.
          {config?.closedAt && ` Closed ${new Date(config.closedAt).toLocaleString()}.`}
        </div>
      )}

      {error && (
        <div className={done ? 'alert success' : hasVoted ? 'alert warn' : 'alert error'}>
          {error}
        </div>
      )}

      <div className="q-block">
        <label className="q-label">
          Voter Name <span className="req">*</span>
        </label>
        <input
          className="q-input"
          value={voterName}
          onChange={(e) => setVoterName(e.target.value)}
          placeholder="Your full name"
          disabled={disabled}
        />
      </div>

      <div className="q-block">
        <label className="q-label">
          Your School <span className="req">*</span>
        </label>
        <select
          className="q-input"
          value={voterSchool}
          onChange={(e) => setVoterSchool(e.target.value)}
          disabled={disabled}
        >
          <option value="">Select your school</option>
          {(config?.schools ?? []).map((s) => (
            <option key={s.schoolId} value={s.schoolName}>
              {s.schoolName}
            </option>
          ))}
        </select>
      </div>

      <div className="q-block">
        <label className="q-label">
          Vote for a School <span className="req">*</span>
        </label>
        <select
          className="q-input"
          value={votedSchool}
          onChange={(e) => setVotedSchool(e.target.value)}
          disabled={disabled}
        >
          <option value="">Select a school to vote for</option>
          {(config?.activeSchools ?? []).map((s) => (
            <option key={s.schoolId} value={s.schoolName}>
              {s.schoolName}
            </option>
          ))}
        </select>
      </div>

      <div className="form-actions">
        {done ? (
          <span className="alert success inline">Submitted — thank you!</span>
        ) : hasVoted ? (
          <span className="alert warn inline">You have already voted.</span>
        ) : (
          <button className="btn-primary" onClick={submit} disabled={!canSubmit}>
            {loading ? <span className="spinner" /> : 'Submit'}
          </button>
        )}
      </div>

      {!user && !authChecking && (
        <p className="muted small hint">Google sign-in is required before submitting.</p>
      )}
    </div>
  )
}