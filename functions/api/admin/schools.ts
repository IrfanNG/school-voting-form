import type { PagesFunction } from '../../_lib/pages'
import { getSession } from '../../_lib/session'
import { error, json, parseJsonBody, withErrorHandler, HttpError, requireBody } from '../../_lib/response'
import { readValues, appendValues, updateValues, clearValues, rowsToObjects } from '../../_lib/sheets'
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
    const schoolId = requireBody<string>(body as Record<string, unknown>, 'schoolId').trim()

    let rows: string[][] = []
    try {
      rows = await readValues(env, `${TABS.schools}!A:C`)
    } catch {
      // none
    }

    const dataRows = rows.slice(1)
    const idx = dataRows.findIndex((row) => (row[0] ?? '').trim() === schoolId)
    if (idx === -1) throw new HttpError(404, 'School not found')

    const currentRow = dataRows[idx]
    const currentName = (currentRow[1] ?? '').trim()
    const currentActive = ((currentRow[2] ?? 'true').trim().toLowerCase()) === 'true'
    const newName = body.schoolName !== undefined ? body.schoolName.trim() : currentName
    const newActive = body.active !== undefined ? body.active : currentActive

    if (!newName) throw new HttpError(400, 'School name is required')

    const duplicate = dataRows.some((row) => {
      const id = (row[0] ?? '').trim()
      const name = (row[1] ?? '').trim().toLowerCase()
      return id !== schoolId && name === newName.toLowerCase()
    })
    if (duplicate) throw new HttpError(409, 'School already exists')

    const rowNo = idx + 2 // header + 1-indexed
    await updateValues(env, `${TABS.schools}!A${rowNo}:C${rowNo}`, [
      [schoolId, newName, String(newActive)],
    ])

    return json({
      ok: true,
      school: { schoolId, schoolName: newName, active: newActive },
    })
  })
}

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  return withErrorHandler(async () => {
    const env = context.env
    const session = await getSession(env, context.request)
    if (!session) return error(401, 'Not authenticated')
    if (session.role !== 'admin') return error(403, 'Admin only')

    const body = await parseJsonBody<UpdateBody>(context.request)
    const schoolId = requireBody<string>(body as Record<string, unknown>, 'schoolId').trim()

    let rows: string[][] = []
    try {
      rows = await readValues(env, `${TABS.schools}!A:C`)
    } catch {
      // none
    }

    const dataRows = rows.slice(1)
    const idx = dataRows.findIndex((row) => (row[0] ?? '').trim() === schoolId)
    if (idx === -1) throw new HttpError(404, 'School not found')

    const rowNo = idx + 2 // header + 1-indexed
    await clearValues(env, `${TABS.schools}!A${rowNo}:C${rowNo}`)

    return json({ ok: true })
  })
}
