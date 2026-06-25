import type { PagesFunction } from '../../_lib/pages'
import { getSession } from '../../_lib/session'
import { error, json, withErrorHandler } from '../../_lib/response'
import { clearValues, readValues, rowsToObjects } from '../../_lib/sheets'
import { TABS, VOTE_HEADERS, type Env } from '../../_lib/types'

export const onRequestPost: PagesFunction<Env> = async (context) => {
  return withErrorHandler(async () => {
    const env = context.env
    const session = await getSession(env, context.request)
    if (!session) return error(401, 'Not authenticated')
    if (session.role !== 'admin') return error(403, 'Admin only')

    let cleared = 0
    try {
      const rows = await readValues(env, `${TABS.votes}!A:F`)
      cleared = rowsToObjects(rows, VOTE_HEADERS).length
    } catch {
      cleared = 0
    }

    await clearValues(env, `${TABS.votes}!A2:F`)

    return json({ ok: true, cleared })
  })
}
