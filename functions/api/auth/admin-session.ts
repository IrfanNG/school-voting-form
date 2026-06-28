import type { PagesFunction } from '../../_lib/pages'
import { getSession, signSession } from '../../_lib/session'
import { error, json, setSessionCookie, withErrorHandler } from '../../_lib/response'
import type { Env } from '../../_lib/types'

export const onRequestPost: PagesFunction<Env> = async (context) => {
  return withErrorHandler(async () => {
    const env = context.env
    const session = await getSession(env, context.request)
    if (!session) return error(401, 'Not authenticated')

    const token = await signSession(env, {
      sub: session.sub,
      email: session.email,
      name: session.name,
      role: 'admin',
    })

    return json(
      {
        user: {
          sub: session.sub,
          email: session.email,
          name: session.name,
          role: 'admin' as const,
        },
      },
      200,
      { 'Set-Cookie': setSessionCookie(token) },
    )
  })
}
