import type { PagesFunction } from '../../_lib/pages'
import { getSession } from '../../_lib/session'
import { error, json, parseJsonBody, withErrorHandler, HttpError, requireBody } from '../../_lib/response'
import { readValues, appendValues, updateValues, rowsToObjects } from '../../_lib/sheets'
import { TABS, SCHOOL_HEADERS, type Env } from '../../_lib/types'

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return withErrorHandler(async () => {
    const env = context.env
    const session = await getSession(env, context.request)
    if (!session) return error(401, 'Not authenticated')
    if (session.role !== 'admin') return error(403, 'Admin only')

    let rows: string[][] = []
    try {
      rows = await readValues(env, `${TABS.schools}!A:C`)
    } catch {
      // empty
    }
    const schools = rowsToObjects(rows, SCHOOL_HEADERS) as {
      schoolId: string
      schoolName: string
      active: string
    }[]
    return json({
      schools: schools.map((s) => ({
        schoolId: s.schoolId.trim(),
        schoolName: s.schoolName.trim(),
        active: (s.active || 'true').trim().toLowerCase() === 'true',
      })),
    })
  })
}

interface SchoolBody {
  schoolName?: string
  active?: boolean
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  return withErrorHandler(async () => {
    const env = context.env
    const session = await getSession(env, context.request)
    if (!session) return error(401, 'Not authenticated')
    if (session.role !== 'admin') return error(403, 'Admin only')

    const body = await parseJsonBody<SchoolBody>(context.request)
    const schoolName = requireBody<string>(body as Record<string, unknown>, 'schoolName')
    const active = body.active ?? true

    // Read existing schools to determine next id and check duplicates
    let existing: { schoolId: string; schoolName: string; active: string }[] = []
    try {
      const rows = await readValues(env, `${TABS.schools}!A:C`)
      existing = (rowsToObjects(rows, SCHOOL_HEADERS) as {
        schoolId: string
        schoolName: string
        active: string
      }[]).map((s) => ({
        schoolId: s.schoolId.trim(),
        schoolName: s.schoolName.trim(),
        active: (s.active || 'true').trim().toLowerCase(),
      }))
    } catch {
      // none
    }

    if (existing.some((s) => s.schoolName.toLowerCase() === schoolName.trim().toLowerCase())) {
      throw new HttpError(409, 'School already exists')
    }

    const maxId = existing.reduce((max, s) => {
      const n = parseInt(s.schoolId.replace(/[^0-9]/g, ''), 10)
      return Number.isFinite(n) && n > max ? n : max
    }, 0)
    const schoolId = `S${String(maxId + 1).padStart(3, '0')}`

    await appendValues(env, `${TABS.schools}!A:C`, [
      [schoolId, schoolName.trim(), String(active)],
    ])

    return json({ ok: true, school: { schoolId, schoolName: schoolName.trim(), active } })
  })
}

interface UpdateBody {
  schoolId?: string
  schoolName?: string
  active?: boolean
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  return withErrorHandler(async () => {
    const env = context.env
    const session = await getSession(env, context.request)
    if (!session) return error(401, 'Not authenticated')
    if (session.role !== 'admin') return error(403, 'Admin only')

    const body = await parseJsonBody<UpdateBody>(context.request)
    const schoolId = requireBody<string>(body as Record<string, unknown>, 'schoolId')

    let rows: string[][] = []
    try {
      rows = await readValues(env, `${TABS.schools}!A:C`)
    } catch {
      // none
    }
    const schools = rowsToObjects(rows, SCHOOL_HEADERS) as {
      schoolId: string
      schoolName: string
      active: string
    }[]

    const idx = schools.findIndex((s) => s.schoolId.trim() === schoolId.trim())
    if (idx === -1) throw new HttpError(404, 'School not found')

    const rowNo = idx + 2 // header + 1-indexed
    const current = schools[idx]
    const newName = body.schoolName !== undefined ? body.schoolName.trim() : current.schoolName
    const newActive = body.active !== undefined ? body.active : current.active.toLowerCase() === 'true'

    await updateValues(env, `${TABS.schools}!A${rowNo}:C${rowNo}`, [
      [schoolId, newName, String(newActive)],
    ])

    return json({
      ok: true,
      school: { schoolId, schoolName: newName, active: newActive },
    })
  })
}