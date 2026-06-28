import type { PagesFunction } from '../_lib/pages'
import { readValues, rowsToObjects } from '../_lib/sheets'
import { withErrorHandler, json, error } from '../_lib/response'
import { TABS, SCHOOL_HEADERS, SETTINGS_KEYS, type Env } from '../_lib/types'

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return withErrorHandler(async () => {
    const env = context.env

    let votingStatus = 'open'
    let closedAt = ''
    let closedBy = ''
    try {
      const rows = await readValues(env, `${TABS.settings}!A2:C`)
      for (const row of rows) {
        const [k, v, extra] = row.map((c) => (c ?? '').trim())
        if (k === SETTINGS_KEYS.votingStatus) votingStatus = v || 'open'
        else if (k === SETTINGS_KEYS.closedAt) closedAt = v
        else if (k === SETTINGS_KEYS.closedBy && extra === undefined) closedBy = v
      }
    } catch {
      // Settings tab may be missing; default to open
    }

    let schools: { schoolId: string; schoolName: string; active: string }[] = []
    try {
      const rows = await readValues(env, `${TABS.schools}!A:C`)
      schools = (rowsToObjects(rows, SCHOOL_HEADERS) as {
        schoolId: string
        schoolName: string
        active: string
      }[]).map((s) => ({
        schoolId: s.schoolId.trim(),
        schoolName: s.schoolName.trim(),
        active: (s.active || 'true').trim().toLowerCase(),
      }))
    } catch {
      return error(503, 'School data temporarily unavailable')
    }

    // Filter empty records and deduplicate by name (case-insensitive)
    schools = schools.filter((s) => s.schoolId && s.schoolName)
    const seen = new Set<string>()
    schools = schools.filter((s) => {
      const key = s.schoolName.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    const activeSchools = schools.filter((s) => s.active === 'true')
    return json({
      votingStatus: votingStatus === 'closed' ? 'closed' : 'open',
      closedAt,
      closedBy,
      schools: schools.map((s) => ({
        schoolId: s.schoolId,
        schoolName: s.schoolName,
        active: s.active === 'true',
      })),
      activeSchools: activeSchools.map((s) => ({
        schoolId: s.schoolId,
        schoolName: s.schoolName,
      })),
    })
  })
}