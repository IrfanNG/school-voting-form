import { useEffect, useRef, useState } from 'react'
import { getGoogleClientId } from '../api'

let gisInitialized = false

interface Props {
  onCredential: (idToken: string) => void
}

export default function GoogleButton({ onCredential }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [timedOut, setTimedOut] = useState(false)
  const clientId = getGoogleClientId()
  const onCredRef = useRef(onCredential)
  onCredRef.current = onCredential

  useEffect(() => {
    if (!clientId) return
    let cancelled = false

    const timeout = setTimeout(() => {
      if (!cancelled && !window.google?.accounts?.id) {
        setTimedOut(true)
      }
    }, 10000)

    const tryRender = () => {
      if (cancelled) return
      if (!window.google?.accounts?.id || !ref.current) {
        setTimeout(tryRender, 200)
        return
      }
      clearTimeout(timeout)

      if (!gisInitialized) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (res) => {
            if (res.credential) onCredRef.current(res.credential)
          },
          cancel_on_tap_outside: true,
          use_fedcm_for_button: true,
        })
        gisInitialized = true
      }

      while (ref.current.firstChild) {
        ref.current.removeChild(ref.current.firstChild)
      }

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
      clearTimeout(timeout)
    }
  }, [clientId])

  if (!clientId) {
    return <p className="muted">Google Client ID not configured (set VITE_GOOGLE_CLIENT_ID).</p>
  }

  if (timedOut) {
    return <p className="muted">Gagal memuatkan Google Identity. Sila muat semula halaman.</p>
  }

  return <div ref={ref} />
}