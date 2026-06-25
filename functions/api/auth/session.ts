import type { PagesFunction } from '../../_lib/pages'
import { getSession } from '../../_lib/session'
import { error, json, clearSessionCookie, withErrorHandler } from '../../_lib/response'
import type { Env } from '../../_lib/types'

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return withErrorHandler(async () => {
    const session = await getSession(context.env, context.request)
    if (!session) return error(401, 'Not authenticated')
    return json({ user: session })
  })
}

export const onRequestPost: PagesFunction<Env> = async () => {
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() })
}