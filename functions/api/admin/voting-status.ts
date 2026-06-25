import type { PagesFunction } from '../../_lib/pages'
import { getSession } from '../../_lib/session'
import { error, json, parseJsonBody, withErrorHandler, HttpError } from '../../_lib/response'
import { readValues, updateValues } from '../../_lib/sheets'
import { TABS, SETTINGS_KEYS, type Env } from '../../_lib/types'

interface StatusBody {
  status?: string
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return withErrorHandler(async () => {
    const env = context.env
    const session = await getSession(env, context.request)
    if (!session) return error(401, 'Not authenticated')
    if (session.role !== 'admin') return error(403, 'Admin only')

    let status = 'open'
    let closedAt = ''
    let closedBy = ''
    try {
      const rows = await readValues(env, `${TABS.settings}!A2:C`)
      for (const row of rows) {
        const k = (row[0] ?? '').trim()
        if (k === SETTINGS_KEYS.votingStatus) status = (row[1] ?? '').trim() || 'open'
        else if (k === SETTINGS_KEYS.closedAt) closedAt = (row[1] ?? '').trim()
        else if (k === SETTINGS_KEYS.closedBy) closedBy = (row[1] ?? '').trim()
      }
    } catch {
      // defaults
    }
    return json({
      votingStatus: status === 'closed' ? 'closed' : 'open',
      closedAt,
      closedBy,
    })
  })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  return withErrorHandler(async () => {
    const env = context.env
    const session = await getSession(env, context.request)
    if (!session) return error(401, 'Not authenticated')
    if (session.role !== 'admin') return error(403, 'Admin only')

    const body = await parseJsonBody<StatusBody>(context.request)
    const requested = (body.status ?? '').trim().toLowerCase()
    if (requested !== 'open' && requested !== 'closed') {
      throw new HttpError(400, 'status must be "open" or "closed"')
    }

    const now = new Date().toISOString()
    const statusValue = requested
    const closedAt = requested === 'closed' ? now : ''
    const closedBy = requested === 'closed' ? session.email : ''

    // Write the three rows into Settings!A2:C4
    await updateValues(env, `${TABS.settings}!A2:C4`, [
      [SETTINGS_KEYS.votingStatus, statusValue, ''],
      [SETTINGS_KEYS.closedAt, closedAt, ''],
      [SETTINGS_KEYS.closedBy, closedBy, ''],
    ])

    return json({
      votingStatus: statusValue,
      closedAt,
      closedBy,
    })
  })
}