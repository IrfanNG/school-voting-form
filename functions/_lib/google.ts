import { jwtVerify, importJWK, errors as joseErrors } from 'jose'

interface GoogleIdToken {
  sub: string
  email?: string
  name?: string
  email_verified?: boolean
}

interface Jwk {
  kid?: string
  kty?: string
  [key: string]: unknown
}

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'

let cachedJwks: { keys: Jwk[]; fetchedAt: number } | null = null
async function getGoogleJwks(): Promise<{ keys: Jwk[] }> {
  const now = Date.now()
  if (cachedJwks && now - cachedJwks.fetchedAt < 60 * 60 * 1000) {
    return { keys: cachedJwks.keys }
  }
  const res = await fetch(JWKS_URL)
  if (!res.ok) throw new Error('Failed to fetch Google JWKS')
  const jwks = (await res.json()) as { keys: Jwk[] }
  cachedJwks = { keys: jwks.keys, fetchedAt: now }
  return jwks
}

export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
): Promise<GoogleIdToken> {
  if (!idToken) throw new Error('missing_id_token')
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID not configured')

  const headerB64 = idToken.split('.')[0]
  let header: { kid?: string; alg?: string }
  try {
    header = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    throw new Error('invalid_id_token_format')
  }

  const jwks = await getGoogleJwks()
  const jwk = jwks.keys.find((k) => k.kid === header.kid)
  if (!jwk) {
    cachedJwks = null
    throw new Error('jwk_not_found')
  }
  const key = await importJWK(jwk as unknown as Parameters<typeof importJWK>[0], 'RS256')

  let payload: unknown
  try {
    const { payload: p } = await jwtVerify(idToken, key, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: clientId,
      algorithms: ['RS256'],
    })
    payload = p
  } catch (e) {
    if (e instanceof joseErrors.JWTExpired) throw new Error('id_token_expired')
    if (e instanceof joseErrors.JWTClaimValidationFailed) {
      throw new Error(`id_token_claim_invalid: ${(e as Error).message}`)
    }
    if (e instanceof joseErrors.JWTInvalid) throw new Error('id_token_invalid')
    throw e
  }

  const p = payload as GoogleIdToken
  if (!p.sub) throw new Error('id_token_missing_sub')
  if (p.email_verified === false) throw new Error('email_not_verified')
  return {
    sub: p.sub,
    email: p.email,
    name: p.name,
  }
}