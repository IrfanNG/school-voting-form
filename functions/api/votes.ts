import type { PagesFunction } from '../_lib/pages'
import { getSession } from '../_lib/session'
import { error, json, parseJsonBody, requireBody, withErrorHandler, HttpError } from '../_lib/response'
import { readValues, appendValues, rowsToObjects } from '../_lib/sheets'
import { TABS, VOTE_HEADERS, SCHOOL_HEADERS, SETTINGS_KEYS, type Env } from '../_lib/types'

interface VoteBody {
  voterName?: string
  voterSchool?: string
  votedSchool?: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  return withErrorHandler(async () => {
    const env = context.env
    const session = await getSession(env, context.request)
    if (!session) return error(401, 'Not authenticated')

    const body = await parseJsonBody<VoteBody>(context.request)
    const voterName = requireBody<string>(body as Record<string, unknown>, 'voterName')
    const voterSchool = requireBody<string>(body as Record<string, unknown>, 'voterSchool')
    const votedSchool = requireBody<string>(body as Record<string, unknown>, 'votedSchool')

    // Voting status check
    let votingStatus = 'open'
    try {
      const rows = await readValues(env, `${TABS.settings}!A2:C`)
      for (const row of rows) {
        if ((row[0] ?? '').trim() === SETTINGS_KEYS.votingStatus) {
          votingStatus = (row[1] ?? '').trim() || 'open'
          break
        }
      }
    } catch {
      // default open
    }
    if (votingStatus === 'closed') return error(403, 'Voting is closed')

    // Duplicate check by googleSub
    let duplicate = false
    try {
      const rows = await readValues(env, `${TABS.votes}!A:F`)
      const objs = rowsToObjects(rows, VOTE_HEADERS) as {
        googleSub: string
      }[]
      duplicate = objs.some((r) => r.googleSub.trim() === session.sub)
    } catch {
      // Votes tab may be empty/missing: not a duplicate
    }
    if (duplicate) return error(409, 'You have already voted')

    // Validate voted school exists and active, voter school exists
    let schools: { schoolId: string; schoolName: string; active: string }[] = []
    try {
      const rows = await readValues(env, `${TABS.schools}!A:C`)
      schools = (rowsToObjects(rows, SCHOOL_HEADERS) as {
        schoolId: string
        schoolName: string
        active: string
      }[]).map((s) => ({
        schoolId: s.schoolId.trim(),
        schoolName: s.schoolName,
        active: (s.active || 'true').trim().toLowerCase(),
      }))
    } catch {
      // Schools tab missing: reject to be safe
      throw new HttpError(500, 'Schools configuration unavailable')
    }

    const allIds = new Set(schools.map((s) => s.schoolId))
    const allNames = new Set(schools.map((s) => s.schoolName))
    const activeNames = new Set(
      schools.filter((s) => s.active === 'true').map((s) => s.schoolName),
    )

    const matchVoter = allIds.has(voterSchool) || allNames.has(voterSchool)
    if (!matchVoter) return error(400, 'Unknown voter school')

    const activeMatch = activeNames.has(votedSchool)
    if (!activeMatch) return error(400, 'Invalid or inactive school to vote for')

    // Resolve voterSchool to its canonical schoolName so an ID submission
    // can't bypass the self-vote guard.
    const voterSchoolName =
      schools.find((s) => s.schoolId === voterSchool)?.schoolName ?? voterSchool
    if (voterSchoolName === votedSchool)
      return error(400, 'You cannot vote for your own school')

    await appendValues(env, `${TABS.votes}!A:F`, [
      [
        new Date().toISOString(),
        session.sub,
        session.email,
        voterName,
        voterSchool,
        votedSchool,
      ],
    ])

    return json({ ok: true, message: 'Vote recorded' })
  })
}