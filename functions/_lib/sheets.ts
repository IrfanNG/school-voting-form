import { SignJWT, importPKCS8 } from 'jose'
import type { Env } from './types'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

let tokenCache: { token: string; exp: number } | null = null

async function getAccessToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.token

  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
    throw new Error('Google service account not configured')
  }

  const privateKeyPem = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  const privateKey = await importPKCS8(privateKeyPem, 'RS256')

  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(env.GOOGLE_SERVICE_ACCOUNT_EMAIL)
    .setSubject(env.GOOGLE_SERVICE_ACCOUNT_EMAIL)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to mint access token: ${text}`)
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache = { token: data.access_token, exp: now + data.expires_in }
  return tokenCache.token
}

function sheetUrl(env: Env): string {
  return `${SHEETS_API}/${env.GOOGLE_SHEET_ID}`
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

export async function readValues(
  env: Env,
  range: string,
): Promise<string[][]> {
  const token = await getAccessToken(env)
  const url = `${sheetUrl(env)}/values/${encodeURIComponent(range)}`
  const res = await fetch(url, { headers: authHeaders(token) })
  if (!res.ok) throw new Error(`Sheets read failed (${res.status}): ${await res.text()}`)
  const data = (await res.json()) as { values?: string[][] }
  return data.values ?? []
}

export async function appendValues(
  env: Env,
  range: string,
  values: (string | number)[][],
): Promise<void> {
  const token = await getAccessToken(env)
  const url = `${sheetUrl(env)}/values/${encodeURIComponent(range)}:append?insertDataOption=INSERT_ROWS&valueInputOption=RAW`
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ values }),
  })
  if (!res.ok) throw new Error(`Sheets append failed (${res.status}): ${await res.text()}`)
}

export async function updateValues(
  env: Env,
  range: string,
  values: (string | number)[][],
): Promise<void> {
  const token = await getAccessToken(env)
  const url = `${sheetUrl(env)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`
  const res = await fetch(url, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ values }),
  })
  if (!res.ok) throw new Error(`Sheets update failed (${res.status}): ${await res.text()}`)
}

export function sheetRows(
  env: Env,
  tab: string,
  cols: number,
): Promise<string[][]> {
  const endCol = String.fromCharCode(64 + cols)
  return readValues(env, `${tab}!A:${endCol}`)
}

export function rowsToObjects(
  rows: string[][],
  headers: readonly string[],
): Record<string, string>[] {
  if (rows.length === 0) return []
  const [, ...dataRows] = rows
  return dataRows
    .filter((r) => r.some((c) => c && c.trim() !== ''))
    .map((row) => {
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => {
        obj[h] = (row[i] ?? '').trim()
      })
      return obj
    })
}