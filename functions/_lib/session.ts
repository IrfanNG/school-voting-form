import { SignJWT, jwtVerify, errors as joseErrors } from 'jose'
import type { Env, SessionPayload } from './types'

const enc = (s: string) => new TextEncoder().encode(s)

export function sessionKey(env: Env): Uint8Array {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET not configured')
  return enc(env.SESSION_SECRET)
}

export async function signSession(
  env: Env,
  payload: SessionPayload,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(sessionKey(env))
}

export async function verifySession(
  env: Env,
  token: string,
): Promise<SessionPayload> {
  try {
    const { payload } = await jwtVerify(token, sessionKey(env), {
      algorithms: ['HS256'],
    })
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      name: payload.name as string,
      role: (payload.role as 'voter' | 'admin') ?? 'voter',
    }
  } catch (e) {
    if (e instanceof joseErrors.JWTExpired) throw new Error('session_expired')
    if (e instanceof joseErrors.JWTInvalid) throw new Error('session_invalid')
    throw e
  }
}

export async function getSession(
  env: Env,
  request: Request,
): Promise<SessionPayload | null> {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (token) {
    try {
      return await verifySession(env, token)
    } catch {
      return null
    }
  }
  const cookie = request.headers.get('Cookie')
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)session=([^;]+)/)
    if (match) {
      try {
        return await verifySession(env, decodeURIComponent(match[1]))
      } catch {
        return null
      }
    }
  }
  return null
}