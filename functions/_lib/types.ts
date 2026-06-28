export interface Fetcher {
  fetch: (url: string, init?: RequestInit) => Promise<Response>
}

export interface Env {
  GOOGLE_CLIENT_ID: string
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string
  GOOGLE_PRIVATE_KEY: string
  GOOGLE_SHEET_ID: string
  SESSION_SECRET: string
  ADMIN_EMAILS?: string
  VOTE_INGESTION?: Fetcher
}

export interface SessionPayload {
  sub: string
  email: string
  name: string
  role: 'voter' | 'admin'
  iat?: number
}

export interface VoterSession extends SessionPayload {
  role: 'voter'
}

export interface AdminSession extends SessionPayload {
  role: 'admin'
}

export const TABS = {
  votes: 'Votes',
  schools: 'Schools',
  settings: 'Settings',
  admins: 'Admins',
} as const

export const VOTE_HEADERS = [
  'timestamp',
  'googleSub',
  'email',
  'voterName',
  'voterSchool',
  'votedSchool',
  'voteId',
] as const

export const SCHOOL_HEADERS = ['schoolId', 'schoolName', 'active'] as const

export const SETTINGS_KEYS = {
  votingStatus: 'votingStatus',
  closedAt: 'closedAt',
  closedBy: 'closedBy',
  currentRoundId: 'currentRoundId',
} as const