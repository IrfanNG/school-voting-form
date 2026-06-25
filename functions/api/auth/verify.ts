import type { PagesFunction } from '../../_lib/pages'
import { verifyGoogleIdToken } from '../../_lib/google'
import { signSession } from '../../_lib/session'
import { adminAllowlist, isAdminEmail } from '../../_lib/admin'
import { error, json, parseJsonBody, setSessionCookie, withErrorHandler, requireBody, HttpError } from '../../_lib/response'
import type { Env } from '../../_lib/types'

interface VerifyBody {
  idToken?: string
  name?: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  return withErrorHandler(async () => {
    const env = context.env
    const body = await parseJsonBody<VerifyBody>(context.request)
    const idToken = requireBody<string>(body as Record<string, unknown>, 'idToken')

    let google
    try {
      google = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID)
    } catch (e) {
      const msg = (e as Error).message
      if (msg.startsWith('id_token') || msg === 'jwk_not_found' || msg === 'missing_id_token') {
        return error(401, `Invalid Google ID token (${msg})`)
      }
      throw e
    }

    const allowlist = await adminAllowlist(env)
    const role = google.email && isAdminEmail(google.email, allowlist) ? 'admin' : 'voter'

    const name = (body.name?.trim() && body.name.trim().length > 0
      ? body.name.trim()
      : google.name?.trim() || google.email || '')

    const token = await signSession(env, {
      sub: google.sub,
      email: google.email ?? '',
      name,
      role,
    })

    return json(
      {
        ok: true,
        session: { sub: google.sub, email: google.email, name, role },
      },
      200,
      { 'Set-Cookie': setSessionCookie(token) },
    )
  })
}

export const onRequestGet: PagesFunction<Env> = async () => {
  return json({ ok: true, endpoint: '/api/auth/verify', method: 'POST' })
}

export { HttpError }