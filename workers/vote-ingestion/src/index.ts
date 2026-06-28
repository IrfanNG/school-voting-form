import { SignJWT, importPKCS8 } from 'jose'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

interface VoteMessage {
  doName: string
  googleSub: string
  email: string
  voterName: string
  voterSchool: string
  votedSchool: string
}

interface Env {
  VOTE_GUARD: DurableObjectNamespace
  VOTE_QUEUE: Queue<VoteMessage>
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string
  GOOGLE_PRIVATE_KEY: string
  GOOGLE_SHEET_ID: string
}

// ─── Google Sheets helpers (self-contained for Worker) ───

let tokenCache: { token: string; exp: number } | null = null

async function getAccessToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.token
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
    throw new Error('Google service account not configured in Worker')
  }
  const pem = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  const key = await importPKCS8(pem, 'RS256')
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(env.GOOGLE_SERVICE_ACCOUNT_EMAIL)
    .setSubject(env.GOOGLE_SERVICE_ACCOUNT_EMAIL)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!res.ok) throw new Error(`Failed to mint token: ${await res.text()}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache = { token: data.access_token, exp: now + data.expires_in }
  return tokenCache.token
}

async function appendToSheet(env: Env, range: string, values: string[][]) {
  const token = await getAccessToken(env)
  const url = `${SHEETS_API}/${env.GOOGLE_SHEET_ID}/values/${encodeURIComponent(range)}:append?insertDataOption=INSERT_ROWS&valueInputOption=RAW`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  })
  if (!res.ok) throw new Error(`Sheets append failed (${res.status}): ${await res.text()}`)
}

// ─── Durable Object ───

export class VoteGuard extends DurableObject<Env> {
  private doEnv: Env

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.doEnv = env
  }

  async fetch(request: Request) {
    const url = new URL(request.url)

    if (request.method === 'POST' && url.pathname === '/submit') {
      return this.handleSubmit(await request.json<VoteMessage>())
    }

    if (request.method === 'GET' && url.pathname === '/status') {
      const status = (await this.state.storage.get<string>('status')) || 'none'
      return new Response(JSON.stringify({ status }))
    }

    if (url.pathname === '/config') {
      if (request.method === 'GET') {
        const currentRoundId = (await this.state.storage.get<string>('currentRoundId')) || 'round-1'
        return new Response(JSON.stringify({ currentRoundId }))
      }
      if (request.method === 'PUT') {
        const body = await request.json<{ currentRoundId?: string }>()
        if (body.currentRoundId) {
          await this.state.storage.put('currentRoundId', body.currentRoundId)
          await this.state.storage.delete('status')
          await this.state.storage.delete('data')
        }
        return new Response(JSON.stringify({ ok: true }))
      }
    }

    if (request.method === 'POST' && url.pathname === '/synced') {
      await this.state.storage.put('status', 'synced')
      await this.state.storage.deleteAlarm()
      return new Response(JSON.stringify({ ok: true }))
    }

    return new Response('Not found', { status: 404 })
  }

  async alarm() {
    const status = await this.state.storage.get<string>('status')
    if (status === 'synced' || !status || status === 'none') return

    const data = await this.state.storage.get<VoteMessage>('data')
    if (!data) return

    const retries = ((await this.state.storage.get<number>('retries')) || 0) + 1
    await this.state.storage.put('retries', retries)

    if (retries > 10) {
      console.error(`DO alarm: giving up on ${this.state.id.name} after ${retries} retries`)
      return
    }

    try {
      await this.doEnv.VOTE_QUEUE.send(data)
      await this.state.storage.put('status', 'queued')
    } catch {
      const delay = Math.min(5000 * Math.pow(2, retries - 1), 60000)
      await this.state.storage.setAlarm(Date.now() + delay)
    }
  }

  private async handleSubmit(data: VoteMessage) {
    const status = (await this.state.storage.get<string>('status')) || 'none'
    if (status !== 'none' && status !== 'pending') {
      return new Response(JSON.stringify({ result: 'already_voted' }))
    }

    await this.state.storage.put({ status: 'pending', data, retries: 0 })

    try {
      await this.doEnv.VOTE_QUEUE.send(data)
      await this.state.storage.put('status', 'queued')
    } catch {
      await this.state.storage.setAlarm(Date.now() + 5000)
    }

    return new Response(JSON.stringify({ result: 'accepted' }))
  }
}

// ─── Worker fetch handler ───

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (request.method === 'POST' && url.pathname.startsWith('/api/submit/')) {
      const [, , , roundId, googleSub] = url.pathname.split('/')
      const doName = `${roundId}:${googleSub}`
      const stub = env.VOTE_GUARD.get(env.VOTE_GUARD.idFromName(doName))
      const body = await request.text()
      return stub.fetch(new Request('https://do/submit', { method: 'POST', body }))
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/status/')) {
      const [, , , roundId, googleSub] = url.pathname.split('/')
      const doName = `${roundId}:${googleSub}`
      const stub = env.VOTE_GUARD.get(env.VOTE_GUARD.idFromName(doName))
      return stub.fetch(new Request('https://do/status'))
    }

    if (url.pathname === '/api/config') {
      if (request.method === 'GET') {
        const stub = env.VOTE_GUARD.get(env.VOTE_GUARD.idFromName('_config'))
        return stub.fetch(new Request('https://do/config'))
      }
      if (request.method === 'PUT') {
        const stub = env.VOTE_GUARD.get(env.VOTE_GUARD.idFromName('_config'))
        const body = await request.text()
        return stub.fetch(new Request('https://do/config', { method: 'PUT', body }))
      }
    }

    if (request.method === 'POST' && url.pathname.startsWith('/api/synced/')) {
      const [, , , doName] = url.pathname.split('/')
      const stub = env.VOTE_GUARD.get(env.VOTE_GUARD.idFromName(doName))
      return stub.fetch(new Request('https://do/synced', { method: 'POST' }))
    }

    return new Response('Not found', { status: 404 })
  },

  // ─── Queue consumer ───

  async queue(batch: MessageBatch<VoteMessage>, env: Env) {
    const messages = batch.messages
    if (messages.length === 0) return

    // Get current roundId from DO config to filter old-round messages
    let currentRoundId = 'round-1'
    try {
      const configStub = env.VOTE_GUARD.get(env.VOTE_GUARD.idFromName('_config'))
      const configResp = await configStub.fetch(new Request('https://do/config'))
      if (configResp.ok) {
        const data = (await configResp.json()) as { currentRoundId?: string }
        currentRoundId = data.currentRoundId || 'round-1'
      }
    } catch {
      // Use default
    }

    // Read existing sheet rows for duplicate check
    const existingRows: string[][] = []
    try {
      const token = await getAccessToken(env)
      const fetchUrl = `${SHEETS_API}/${env.GOOGLE_SHEET_ID}/values/Votes!A:G`
      const res = await fetch(fetchUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = (await res.json()) as { values?: string[][] }
        existingRows.push(...(data.values ?? []))
      }
    } catch {
      // Sheet may be empty
    }

    const existingVoteIds = new Set(
      existingRows.slice(1).map((r) => (r[6] ?? '').trim()).filter(Boolean),
    )

    const toAppend: string[][] = []
    const toSync: string[] = []

    for (const msg of messages) {
      const doName = msg.body.doName
      const msgRoundId = doName.split(':')[0]

      // Skip messages from old rounds (after clear-data)
      if (msgRoundId !== currentRoundId) {
        toSync.push(doName)
        continue
      }
      if (existingVoteIds.has(doName)) {
        toSync.push(doName)
        continue
      }
      toAppend.push([
        new Date().toISOString(),
        msg.body.googleSub,
        msg.body.email,
        msg.body.voterName,
        msg.body.voterSchool,
        msg.body.votedSchool,
        doName,
      ])
    }

    if (toAppend.length > 0) {
      try {
        await appendToSheet(env, 'Votes!A:G', toAppend)
      } catch (err) {
        console.error('Queue: sheets append failed, retrying batch', err)
        batch.retryAll()
        return
      }
    }

    // Mark DOs as synced
    for (const doName of [...new Set([...toSync, ...messages.map((m) => m.body.doName)])]) {
      try {
        const stub = env.VOTE_GUARD.get(env.VOTE_GUARD.idFromName(doName))
        await stub.fetch(new Request('https://do/synced', { method: 'POST' }))
      } catch {
        // Non-critical
      }
    }

    batch.ackAll()
  },
}
