export interface SessionUser {
  sub: string
  email: string
  name: string
  role: 'voter' | 'admin'
}

export interface SchoolInfo {
  schoolId: string
  schoolName: string
  active: boolean
}

export interface ConfigResponse {
  votingStatus: 'open' | 'closed'
  closedAt: string
  closedBy: string
  schools: SchoolInfo[]
  activeSchools: { schoolId: string; schoolName: string }[]
}

export interface TotalsRow {
  schoolName: string
  count: number
}

export interface VoteRow {
  timestamp: string
  googleSub: string
  email: string
  voterName: string
  voterSchool: string
  votedSchool: string
}

export interface ResultsResponse {
  totalVotes: number
  uniqueVoters: number
  totals: TotalsRow[]
  topSchool: TotalsRow | null
  votes: VoteRow[]
}