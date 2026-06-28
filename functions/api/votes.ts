import type { PagesFunction } from '../_lib/pages'
import { getSession } from '../_lib/session'
import { error, json, parseJsonBody, requireBody, withErrorHandler, HttpError } from '../_lib/response'
import { readValues, rowsToObjects } from '../_lib/sheets'
import { TABS, SCHOOL_HEADERS, SETTINGS_KEYS, type Env, type Fetcher } from '../_lib/types'

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

    const voterSchoolName =
      schools.find((s) => s.schoolId === voterSchool)?.schoolName ?? voterSchool
    if (voterSchoolName === votedSchool)
      return error(400, 'You cannot vote for your own school')

    // Get current roundId from DO config
    let roundId = 'round-1'
    try {
      const ingestion = env.VOTE_INGESTION as Fetcher
      if (ingestion) {
        const configResp = await ingestion.fetch('https://internal/api/config')
        if (configResp.ok) {
          const configData = (await configResp.json()) as { currentRoundId?: string }
          roundId = configData.currentRoundId || 'round-1'
        }
      }
    } catch {
      // Fall back to round-1
    }

    // Submit via Durable Object
    const doName = `${roundId}:${session.sub}`
    try {
      const ingestion = env.VOTE_INGESTION as Fetcher
      if (!ingestion) throw new Error('VOTE_INGESTION binding not available')

      const submitResp = await ingestion.fetch(`https://internal/api/submit/${roundId}/${session.sub}`, {
        method: 'POST',
        body: JSON.stringify({
          doName,
          googleSub: session.sub,
          email: session.email,
          voterName,
          voterSchool,
          votedSchool,
        }),
      })

      if (!submitResp.ok) {
        const errData = await submitResp.json().catch(() => ({}))
        return error(503, (errData as { error?: string })?.error || 'Vote temporarily unavailable')
      }

      const result = (await submitResp.json()) as { result: string }
      if (result.result === 'already_voted') {
        return error(409, 'You have already voted')
      }
      if (result.result === 'accepted') {
        return json({ ok: true, message: 'Vote recorded' })
      }

      return error(503, 'Vote temporarily unavailable')
    } catch {
      return error(503, 'Vote service temporarily unavailable. Please try again.')
    }
  })
}
