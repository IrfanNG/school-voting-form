import { useEffect, useState } from 'react'
import GoogleButton from '../components/GoogleButton'
import { api } from '../api'
import type { ConfigResponse, SessionUser } from '../types'

const STEP = { login: 'login', name: 'name', school: 'school', vote: 'vote', done: 'done' } as const
type Step = (typeof STEP)[keyof typeof STEP]

export default function Voter() {
  const [step, setStep] = useState<Step>(STEP.login)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [config, setConfig] = useState<ConfigResponse | null>(null)
  const [name, setName] = useState('')
  const [voterSchool, setVoterSchool] = useState('')
  const [votedSchool, setVotedSchool] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    api.me().then((r) => {
      setUser(r.user)
      if (r.user.role === 'admin') {
        setStep(STEP.done)
        setMessage(`Signed in as admin: ${r.user.email}. Open the Admin dashboard from the top.`)
      } else if (r.user.name) {
        setStep(STEP.school)
      }
    }).catch(() => {})
    api.config().then(setConfig).catch((e) => setError(e.message))
  }, [])

  async function handleCredential(idToken: string) {
    setLoading(true)
    setError('')
    try {
      const { session } = await api.verify(idToken)
      setUser(session)
      if (session.role === 'admin') {
        setMessage('Admins can vote too, but the Admin dashboard is in the top nav.')
      }
      setName(session.name || '')
      setStep(session.name ? STEP.school : STEP.name)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function submitVote() {
    setLoading(true)
    setError('')
    try {
      const actualName = name.trim() || user?.name || ''
      const { message } = await api.vote({
        voterName: actualName,
        voterSchool,
        votedSchool,
      })
      setStep(STEP.done)
      setMessage(message || 'Vote recorded. Thank you!')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const closed = config?.votingStatus === 'closed'

  return (
    <div className="card">
      <h1>School Voting Forms</h1>
      <p className="muted">Vote for the school you think should win. Sign in with Google — one vote per account.</p>

      <Progress step={step} />

      {error && <div className="alert error">{error}</div>}
      {message && step === STEP.done && (
        <div className="alert success">{message}</div>
      )}

      {closed && step !== STEP.done && (
        <div className="alert warn">
          Voting is currently closed. {config?.closedAt && `Closed ${new Date(config.closedAt).toLocaleString()}.`}
        </div>
      )}

      {step === STEP.login && (
        <div className="step">
          <GoogleButton onCredential={handleCredential} />
          {loading && <p className="muted">Signing in…</p>}
        </div>
      )}

      {step === STEP.name && (
        <div className="step">
          <label className="field">
            <span>Your name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ahmad bin Ali"
              autoFocus
            />
          </label>
          <div className="row">
            <button className="btn-primary" onClick={() => setStep(STEP.school)} disabled={!name.trim()}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === STEP.school && (
        <div className="step">
          <label className="field">
            <span>Your school</span>
            <select value={voterSchool} onChange={(e) => setVoterSchool(e.target.value)} autoFocus>
              <option value="">Select your school</option>
              {(config?.schools ?? []).map((s) => (
                <option key={s.schoolId} value={s.schoolName}>
                  {s.schoolName}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <button className="btn-outline" onClick={() => setStep(STEP.name)}>Back</button>
            <button className="btn-primary" onClick={() => setStep(STEP.vote)} disabled={!voterSchool}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === STEP.vote && (
        <div className="step">
          <label className="field">
            <span>Vote for a school</span>
            <select value={votedSchool} onChange={(e) => setVotedSchool(e.target.value)} autoFocus>
              <option value="">Select a school to vote for</option>
              {(config?.activeSchools ?? []).map((s) => (
                <option key={s.schoolId} value={s.schoolName}>
                  {s.schoolName}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <button className="btn-outline" onClick={() => setStep(STEP.school)}>Back</button>
            <button className="btn-primary" onClick={submitVote} disabled={!votedSchool || closed || loading}>
              {loading ? <span className="spinner" /> : 'Submit vote'}
            </button>
          </div>
          {user && (
            <p className="muted small">Signed in as {user.email}. You can only vote once per Google account.</p>
          )}
        </div>
      )}

      {step === STEP.done && (
        <div className="step">
          <p>You’re all set.</p>
          {user?.role === 'admin' && (
            <p className="muted small">Switch to Admin from the top navigation.</p>
          )}
        </div>
      )}
    </div>
  )
}

function Progress({ step }: { step: Step }) {
  const order = [STEP.login, STEP.name, STEP.school, STEP.vote, STEP.done]
  const idx = order.indexOf(step)
  return (
    <div className="progress">
      {order.map((s, i) => (
        <span
          key={s}
          className={'dot' + (i <= idx ? ' active' : '') + (i === idx ? ' current' : '')}
        />
      ))}
    </div>
  )
}