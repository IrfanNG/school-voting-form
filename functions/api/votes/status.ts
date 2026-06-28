import type { PagesFunction } from '../../_lib/pages'
import { getSession } from '../../_lib/session'
import { error, json, withErrorHandler } from '../../_lib/response'
import { readValues, rowsToObjects } from '../../_lib/sheets'
import { TABS, VOTE_HEADERS, type Env, type Fetcher } from '../../_lib/types'

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return withErrorHandler(async () => {
    const env = context.env
    const session = await getSession(env, context.request)
    if (!session) return error(401, 'Not authenticated')

    // Try DO first for real-time status
    try {
      const ingestion = env.VOTE_INGESTION as Fetcher | undefined
      if (ingestion) {
        const configResp = await ingestion.fetch('https://internal/api/config')
        const configData = configResp.ok
          ? (await configResp.json()) as { currentRoundId?: string }
          : { currentRoundId: 'round-1' }
        const roundId = configData.currentRoundId || 'round-1'

        const statusResp = await ingestion.fetch(
          `https://internal/api/status/${roundId}/${session.sub}`,
        )
        if (statusResp.ok) {
          const data = (await statusResp.json()) as { status: string }
          if (data.status !== 'none') {
            return json({ hasVoted: true, status: data.status })
          }
        }
      }
    } catch {
      // Fall through to Sheets check
    }

    // Fallback: check Sheets for votes imported before DO migration
    let hasVoted = false
    try {
      const rows = await readValues(env, `${TABS.votes}!A:G`)
      const objs = rowsToObjects(rows, VOTE_HEADERS) as { googleSub: string }[]
      hasVoted = objs.some((r) => r.googleSub.trim() === session.sub)
    } catch {
      // Votes tab may be empty
    }

    return json({ hasVoted })
  })
}
