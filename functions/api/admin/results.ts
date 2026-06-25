import type { PagesFunction } from '../../_lib/pages'
import { getSession } from '../../_lib/session'
import { error, json, withErrorHandler } from '../../_lib/response'
import { readValues, rowsToObjects } from '../../_lib/sheets'
import { TABS, VOTE_HEADERS, type Env } from '../../_lib/types'

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return withErrorHandler(async () => {
    const env = context.env
    const session = await getSession(env, context.request)
    if (!session) return error(401, 'Not authenticated')
    if (session.role !== 'admin') return error(403, 'Admin only')

    let voteRows: string[][] = []
    try {
      voteRows = await readValues(env, `${TABS.votes}!A:F`)
    } catch {
      // empty
    }
    const votes = rowsToObjects(voteRows, VOTE_HEADERS) as {
      timestamp: string
      googleSub: string
      email: string
      voterName: string
      voterSchool: string
      votedSchool: string
    }[]

    const totals = new Map<string, number>()
    for (const v of votes) {
      const school = v.votedSchool.trim()
      if (!school) continue
      totals.set(school, (totals.get(school) ?? 0) + 1)
    }

    const aggregated = [...totals.entries()]
      .map(([schoolName, count]) => ({ schoolName, count }))
      .sort((a, b) => b.count - a.count)

    const topSchool = aggregated.length > 0 ? aggregated[0] : null
    const totalVotes = votes.length
    const uniqueVoters = new Set(votes.map((v) => v.googleSub)).size

    return json({
      totalVotes,
      uniqueVoters,
      totals: aggregated,
      topSchool,
      votes: votes.map((v) => ({
        timestamp: v.timestamp,
        voterName: v.voterName,
        voterSchool: v.voterSchool,
        votedSchool: v.votedSchool,
        googleSub: v.googleSub,
        email: v.email,
      })),
    })
  })
}