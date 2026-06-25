import { useEffect, useRef } from 'react'
import { getGoogleClientId } from '../api'

interface Props {
  onCredential: (idToken: string) => void
}

export default function GoogleButton({ onCredential }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const clientId = getGoogleClientId()

  useEffect(() => {
    let cancelled = false
    const tryRender = () => {
      if (cancelled) return
      if (!clientId) return
      if (!window.google || !ref.current) {
        setTimeout(tryRender, 200)
        return
      }
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (res) => {
          if (res.credential) onCredential(res.credential)
        },
        cancel_on_tap_outside: true,
      })
      window.google.accounts.id.renderButton(ref.current, {
        theme: 'filled_blue',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        width: 280,
      })
    }
    tryRender()
    return () => {
      cancelled = true
    }
  }, [clientId, onCredential])

  if (!clientId) {
    return <p className="muted">Google Client ID not configured (set VITE_GOOGLE_CLIENT_ID).</p>
  }
  return <div ref={ref} />
}