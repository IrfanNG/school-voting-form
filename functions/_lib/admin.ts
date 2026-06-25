import { readValues } from './sheets'
import type { Env } from './types'
import { TABS } from './types'

export function adminEmailsFromEnv(env: Env): string[] {
  return (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export async function adminAllowlist(env: Env): Promise<string[]> {
  let fromSheet: string[] = []
  try {
    const rows = await readValues(env, `${TABS.admins}!A2:A`)
    fromSheet = rows.flat().map((e) => e.trim().toLowerCase()).filter(Boolean)
  } catch {
    // Admins tab may not exist yet
  }
  const merged = new Set<string>([...fromSheet, ...adminEmailsFromEnv(env)])
  return [...merged]
}

export function isAdminEmail(email: string, allowlist: string[]): boolean {
  return allowlist.includes(email.trim().toLowerCase())
}