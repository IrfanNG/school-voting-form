import GoogleButton from '../components/GoogleButton'
import { api } from '../api'
import type { ConfigResponse } from '../types'
import { useEffect, useState } from 'react'

interface Props {
  signedIn: boolean
  onSignedIn: () => void
}

export default function Landing({ signedIn, onSignedIn }: Props) {
  const [config, setConfig] = useState<ConfigResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.config().then(setConfig).catch((e) => setErr(e.message))
  }, [])

  async function handleCredential(idToken: string) {
    setLoading(true)
    setErr('')
    try {
      await api.verify(idToken)
      onSignedIn()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const closed = config?.votingStatus === 'closed'

  return (
    <div className="card form-card landing-card">
      <div className="title-row">
        <img src="/cybergen-logo.png" alt="Cybergen Junior logo" className="title-logo" />
        <div>
          <h1 className="form-title">Borang Undian Cybergen Junior</h1>
          <p className="form-sub muted">
            Setiap pengguna hanya boleh mengundi sekali dan tidak dibenarkan mengundi sekolah sendiri.
          </p>
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}
      {closed && (
        <div className="alert warn">
          Pengundian buat masa ini ditutup.
          {config?.closedAt && ` Ditutup ${new Date(config.closedAt).toLocaleString()}.`}
        </div>
      )}

      <div className="login-chip">
        {signedIn ? (
          <button className="btn-primary" onClick={() => { window.location.hash = '#/vote' }}>
            Mula Mengundi
          </button>
        ) : (
          <div className="chip-row">
            <span className="muted small">Daftar masuk untuk meneruskan:</span>
            <GoogleButton onCredential={handleCredential} />
          </div>
        )}
      </div>

      {loading && <p className="muted small">Mendaftar masuk…</p>}
    </div>
  )
}