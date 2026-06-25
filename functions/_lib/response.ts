import type { SessionPayload } from './types'

export function json<T>(body: T, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  })
}

export function error(status: number, message: string): Response {
  return json({ error: message }, status)
}

export function getSessionToken(request: Request): string | null {
  const header = request.headers.get('Authorization')
  if (header?.startsWith('Bearer ')) return header.slice(7).trim()
  const cookie = request.headers.get('Cookie')
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)session=([^;]+)/)
    if (match) return decodeURIComponent(match[1])
  }
  return null
}

export function setSessionCookie(token: string, maxAge = 60 * 60 * 12): string {
  const flags = [
    `session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ]
  return flags.join('; ')
}

export function clearSessionCookie(): string {
  return 'session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
}

export function parseJsonBody<T = unknown>(request: Request): Promise<T> {
  return request.json() as Promise<T>
}

export function requireBody<T>(
  body: Record<string, unknown>,
  field: string,
): T {
  const value = body[field]
  if (value === undefined || value === null || value === '') {
    throw new HttpError(400, `Missing field: ${field}`)
  }
  return value as T
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function withErrorHandler(
  fn: () => Promise<Response>,
): Promise<Response> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof HttpError) return error(e.status, e.message)
    console.error('Unhandled error', e)
    return error(500, 'Internal error')
  }
}

export type { SessionPayload }