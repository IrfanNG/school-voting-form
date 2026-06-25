import type {
  ConfigResponse,
  ResultsResponse,
  SessionUser,
  SchoolInfo,
} from './types'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...init,
  })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // ignore
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`
    throw new Error(msg)
  }
  return data as T
}

export const api = {
  verify: (idToken: string, name?: string) =>
    req<{ ok: boolean; session: SessionUser }>('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ idToken, name }),
    }),
  me: () => req<{ user: SessionUser }>('/api/auth/session'),
  logout: () =>
    req<{ ok: boolean }>('/api/auth/session', { method: 'POST' }),
  config: () => req<ConfigResponse>('/api/config'),
  vote: (payload: { voterName: string; voterSchool: string; votedSchool: string }) =>
    req<{ ok: boolean; message: string }>('/api/votes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  voteStatus: () => req<{ hasVoted: boolean }>('/api/votes/status'),
  results: () => req<ResultsResponse>('/api/admin/results'),
  votingStatus: () => req<{ votingStatus: 'open' | 'closed'; closedAt: string; closedBy: string }>('/api/admin/voting-status'),
  setVotingStatus: (status: 'open' | 'closed') =>
    req<{ votingStatus: string; closedAt: string; closedBy: string }>('/api/admin/voting-status', {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  schools: () => req<{ schools: SchoolInfo[] }>('/api/admin/schools'),
  addSchool: (schoolName: string, active = true) =>
    req<{ ok: boolean; school: SchoolInfo }>('/api/admin/schools', {
      method: 'POST',
      body: JSON.stringify({ schoolName, active }),
    }),
  updateSchool: (payload: { schoolId: string; schoolName?: string; active?: boolean }) =>
    req<{ ok: boolean; school: SchoolInfo }>('/api/admin/schools', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
}

export function getGoogleClientId(): string {
  // Exposed to the client via Vite import.meta.env.VITE_GOOGLE_CLIENT_ID
  return import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
}