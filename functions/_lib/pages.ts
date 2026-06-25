import type { Env } from './types'

export interface PagesContext<E = Env, P = Record<string, string>> {
  request: Request
  env: E
  params: P
  waitUntil: (promise: Promise<unknown>) => void
  next: () => Promise<Response>
  data: Record<string, unknown>
}

export type PagesFunction<E = Env> = (
  context: PagesContext<E>,
) => Response | Promise<Response>