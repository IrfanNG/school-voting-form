import { useEffect, useState } from 'react'
import { api } from '../api'
import type { ConfigResponse, SessionUser } from '../types'

interface Props {
  user: SessionUser | null
  onVoted: () => void
}

export default function Voter({ user, onVoted }: Props) {
  const [config, setConfig] = useState<ConfigResponse | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [configError, setConfigError] = useState('')
  const [voterName, setVoterName] = useState('')
  const [voterSchool, setVoterSchool] = useState('')
  const [votedSchool, setVotedSchool] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadConfig()
  }, [])

  useEffect(() => {
    if (user && !voterName) setVoterName(user.name || '')
  }, [user])

  async function loadConfig() {
    setConfigLoading(true)
    setConfigError('')
    try {
      const c = await api.config()
      setConfig(c)
    } catch (e) {
      setConfigError((e as Error).message)
    } finally {
      setConfigLoading(false)
    }
  }

  const closed = config?.votingStatus === 'closed'

  function changeVoterSchool(value: string) {
    setVoterSchool(value)
    if (value && value === votedSchool) setVotedSchool('')
  }

  const canSubmit =
    !!user &&
    !closed &&
    voterName.trim().length > 0 &&
    voterSchool.trim().length > 0 &&
    votedSchool.trim().length > 0 &&
    voterSchool !== votedSchool &&
    !submitting

  async function submit() {
    setSubmitting(true)
    setError('')
    try {
      await api.vote({
        voterName: voterName.trim(),
        voterSchool,
        votedSchool,
      })
      onVoted()
    } catch (e) {
      const msg = (e as Error).message
      if (msg.includes('already voted')) {
        onVoted()
        return
      }
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card form-card">
      <div className="title-row">
        <img src="/cybergen-logo.png" alt="Cybergen Junior logo" className="title-logo" />
        <div>
          <h1 className="form-title">Borang Undian Cybergen Junior</h1>
          <p className="form-sub muted">
            Setiap pengguna hanya boleh mengundi sekali dan tidak dibenarkan mengundi sekolah sendiri.
          </p>
        </div>
      </div>

      {user && (
        <div className="login-chip">
          <span className="chip in">
            <span className="dot-ok" /> Daftar masuk sebagai {user.email}
          </span>
        </div>
      )}

      {closed && (
        <div className="alert warn">
          Pengundian buat masa ini ditutup.
          {config?.closedAt && ` Ditutup ${new Date(config.closedAt).toLocaleString()}.`}
        </div>
      )}

      {error && <div className="alert error">{error}</div>}

      {configError && !configLoading && (
        <div className="alert error">
          {configError}
          <button className="btn-outline sm" onClick={loadConfig} style={{ marginLeft: 8 }}>
            Cuba Lagi
          </button>
        </div>
      )}

      {configLoading && <p className="muted">Memuatkan senarai sekolah…</p>}

      <div className="q-block">
        <label className="q-label">
          Nama Pengundi <span className="req">*</span>
        </label>
        <input
          className="q-input"
          value={voterName}
          onChange={(e) => setVoterName(e.target.value)}
          placeholder="Nama penuh anda"
        />
      </div>

      <div className="q-block">
        <label className="q-label">
          Sekolah Anda <span className="req">*</span>
        </label>
        <select
          className="q-input"
          value={voterSchool}
          onChange={(e) => changeVoterSchool(e.target.value)}
          disabled={configLoading || !!configError}
        >
          <option value="">Pilih sekolah anda</option>
          {(config?.activeSchools ?? []).map((s) => (
            <option key={s.schoolId + '-' + s.schoolName} value={s.schoolName}>
              {s.schoolName}
            </option>
          ))}
        </select>
      </div>

      <div className="q-block">
        <label className="q-label">
          Undi Sekolah <span className="req">*</span>
        </label>
        <select
          className="q-input"
          value={votedSchool}
          onChange={(e) => setVotedSchool(e.target.value)}
          disabled={configLoading || !!configError}
        >
          <option value="">Pilih sekolah untuk diundi</option>
          {(config?.activeSchools ?? [])
            .filter((s) => s.schoolName !== voterSchool)
            .map((s) => (
              <option key={s.schoolId + '-' + s.schoolName} value={s.schoolName}>
                {s.schoolName}
              </option>
            ))}
        </select>
      </div>

      <div className="form-actions">
        <button className="btn-primary" onClick={submit} disabled={!canSubmit}>
          {submitting ? <span className="spinner" /> : 'Hantar Undian'}
        </button>
      </div>
    </div>
  )
}