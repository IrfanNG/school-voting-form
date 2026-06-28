import type { PagesFunction } from '../../_lib/pages'
import { getSession } from '../../_lib/session'
import { error, json, withErrorHandler } from '../../_lib/response'
import { clearValues, readValues, rowsToObjects, updateValues } from '../../_lib/sheets'
import { TABS, VOTE_HEADERS, SETTINGS_KEYS, type Env, type Fetcher } from '../../_lib/types'

export const onRequestPost: PagesFunction<Env> = async (context) => {
  return withErrorHandler(async () => {
    const env = context.env
    const session = await getSession(env, context.request)
    if (!session) return error(401, 'Not authenticated')
    if (session.role !== 'admin') return error(403, 'Admin only')

    let cleared = 0
    try {
      const rows = await readValues(env, `${TABS.votes}!A:G`)
      cleared = rowsToObjects(rows, VOTE_HEADERS).length
    } catch {
      cleared = 0
    }

    await clearValues(env, `${TABS.votes}!A2:G`)

    // Generate new roundId and update DO config
    const newRoundId = `round-${Date.now()}`
    try {
      const ingestion = env.VOTE_INGESTION as Fetcher | undefined
      if (ingestion) {
        await ingestion.fetch('https://internal/api/config', {
          method: 'PUT',
          body: JSON.stringify({ currentRoundId: newRoundId }),
        })
      }
    } catch {
      // Non-critical: DO may not be available yet
    }

    // Also persist roundId to Settings sheet so config endpoint can read it
    try {
      await updateValues(env, `${TABS.settings}!D1:D2`, [
        [SETTINGS_KEYS.currentRoundId],
        [newRoundId],
      ])
    } catch {
      // Non-critical
    }

    return json({ ok: true, cleared, roundId: newRoundId })
  })
}
