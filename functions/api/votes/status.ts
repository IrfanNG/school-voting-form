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

    let hasVoted = false
    try {
      const rows = await readValues(env, `${TABS.votes}!A:F`)
      const objs = rowsToObjects(rows, VOTE_HEADERS) as { googleSub: string }[]
      hasVoted = objs.some((r) => r.googleSub.trim() === session.sub)
    } catch {
      // Votes tab may be empty/missing: not voted
    }

    return json({ hasVoted })
  })
}