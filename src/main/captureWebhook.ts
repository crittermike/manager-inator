import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { AddressInfo } from 'net'
import { randomUUID } from 'crypto'
import type { CaptureWebhookPayload, CaptureWebhookSourceHint, CaptureWebhookStatus } from '../shared/types'

const MAX_BODY_BYTES = 5 * 1024 * 1024 // 5MB
const VALID_SOURCE_HINTS: ReadonlySet<CaptureWebhookSourceHint> = new Set([
  'slack',
  'github',
  'email',
  'meeting',
  'feedback',
  'other',
  ''
])
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

let server: Server | null = null
let currentPort = 0
let lastError: string | undefined
let captureHandler: ((payload: CaptureWebhookPayload, requestId: string) => void) | null = null

export function setCaptureHandler(handler: (payload: CaptureWebhookPayload, requestId: string) => void): void {
  captureHandler = handler
}

export function getCaptureWebhookStatus(port: number, enabled: boolean): CaptureWebhookStatus {
  const running = !!server
  return {
    enabled,
    running,
    port: running ? currentPort : port,
    url: `http://127.0.0.1:${running ? currentPort : port}/capture`,
    error: lastError
  }
}

export function isWebhookRunning(): boolean {
  return !!server
}

export async function startCaptureWebhook(port: number): Promise<void> {
  if (server) {
    if (currentPort === port) return
    await stopCaptureWebhook()
  }
  lastError = undefined
  return new Promise<void>((resolve, reject) => {
    const s = createServer(handleRequest)
    s.on('error', (err: NodeJS.ErrnoException) => {
      lastError = err.code === 'EADDRINUSE'
        ? `Port ${port} is already in use.`
        : `Webhook server error: ${err.message}`
      console.error('[CaptureWebhook]', lastError)
      try { s.close() } catch { /* noop */ }
      server = null
      reject(err)
    })
    s.listen(port, '127.0.0.1', () => {
      const addr = s.address() as AddressInfo
      currentPort = addr.port
      server = s
      console.log(`[CaptureWebhook] Listening on http://127.0.0.1:${currentPort}`)
      resolve()
    })
  })
}

export function stopCaptureWebhook(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) return resolve()
    const s = server
    server = null
    currentPort = 0
    s.close(() => resolve())
  })
}

function isLoopbackRemote(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress || ''
  // ::ffff:127.0.0.1 (IPv4-mapped IPv6) is also loopback
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

function isHostAllowed(req: IncomingMessage): boolean {
  const host = (req.headers.host || '').toLowerCase()
  if (!host) return false
  // strip port
  const bare = host.replace(/:\d+$/, '')
  return ALLOWED_HOSTS.has(bare) || bare === '[::1]'
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Max-Age', '600')
}

function send(res: ServerResponse, status: number, body: unknown): void {
  setCorsHeaders(res)
  if (body === undefined || body === null) {
    res.statusCode = status
    res.end()
    return
  }
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  res.statusCode = status
  res.setHeader('Content-Type', typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8')
  res.end(payload)
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let total = 0
    let tooBig = false
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > MAX_BODY_BYTES) {
        if (!tooBig) {
          tooBig = true
          // Stop accumulating but keep draining so we can respond cleanly.
          chunks.length = 0
        }
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooBig) {
        reject(Object.assign(new Error('payload too large'), { code: 'PAYLOAD_TOO_LARGE' }))
        return
      }
      resolve(Buffer.concat(chunks).toString('utf-8'))
    })
    req.on('error', reject)
  })
}

const CONTENT_ALIASES = ['content', 'transcript', 'text', 'body', 'message', 'markdown'] as const

function pickFirstString(obj: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim().length > 0) return v
  }
  return undefined
}

function normalizeSourceHint(raw: unknown, hadTranscriptField: boolean): CaptureWebhookSourceHint {
  if (typeof raw === 'string') {
    const lower = raw.trim().toLowerCase()
    if (VALID_SOURCE_HINTS.has(lower as CaptureWebhookSourceHint)) {
      return lower as CaptureWebhookSourceHint
    }
  }
  if (hadTranscriptField) return 'meeting'
  return ''
}

export function normalizePayload(
  parsed: unknown,
  contentType: string,
  rawBody: string,
  query: URLSearchParams
): CaptureWebhookPayload | { error: string } {
  let content: string | undefined
  let title: string | undefined
  let fileName: string | undefined
  let speakers: string[] | undefined
  let sourceHintRaw: unknown
  let hadTranscript = false

  const isJson = contentType.includes('application/json')

  if (isJson) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'JSON body must be an object' }
    }
    const obj = parsed as Record<string, unknown>
    hadTranscript = typeof obj['transcript'] === 'string' && (obj['transcript'] as string).trim().length > 0
    content = pickFirstString(obj, CONTENT_ALIASES)
    if (typeof obj['title'] === 'string' && obj['title'].trim()) title = obj['title'].trim()
    if (typeof obj['fileName'] === 'string') fileName = obj['fileName']
    else if (typeof obj['filename'] === 'string') fileName = obj['filename']
    sourceHintRaw = obj['sourceHint'] ?? obj['source'] ?? obj['type']
    if (Array.isArray(obj['speakers'])) {
      speakers = (obj['speakers'] as unknown[])
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .map((s) => s.trim())
      if (speakers.length === 0) speakers = undefined
    }
  } else {
    // text/plain or unspecified — treat raw body as content
    content = rawBody.trim().length > 0 ? rawBody : undefined
    sourceHintRaw = query.get('source') ?? query.get('sourceHint')
    const fn = query.get('fileName') ?? query.get('filename')
    if (fn) fileName = fn
    const t = query.get('title')
    if (t) title = t
  }

  if (!content || content.trim().length === 0) {
    return { error: 'Missing content. Provide one of: content, transcript, text, body, message, markdown.' }
  }

  const sourceHint = normalizeSourceHint(sourceHintRaw, hadTranscript)

  // Prepend title as a heading if present (and not already there)
  let finalContent = content
  if (title) {
    const stripped = content.trimStart()
    if (!stripped.startsWith(`# ${title}`)) {
      finalContent = `# ${title}\n\n${content}`.trim()
    }
  }

  return { content: finalContent, sourceHint, fileName, title, speakers }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Defense-in-depth: reject non-loopback even though we bind to 127.0.0.1
  if (!isLoopbackRemote(req)) {
    send(res, 403, { error: 'forbidden: non-loopback' })
    return
  }
  if (!isHostAllowed(req)) {
    // Block DNS rebinding attempts
    send(res, 403, { error: 'forbidden: host not allowed' })
    return
  }

  const method = (req.method || 'GET').toUpperCase()

  if (method === 'OPTIONS') {
    setCorsHeaders(res)
    res.statusCode = 204
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  if (path === '/health') {
    if (method !== 'GET') {
      send(res, 405, { error: 'method not allowed' })
      return
    }
    send(res, 200, { ok: true })
    return
  }

  if (path === '/capture') {
    if (method !== 'POST') {
      send(res, 405, { error: 'method not allowed; use POST' })
      return
    }
    let raw: string
    try {
      raw = await readBody(req)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'PAYLOAD_TOO_LARGE') {
        send(res, 413, { error: 'payload too large (5MB max)' })
        return
      }
      send(res, 400, { error: 'failed to read body' })
      return
    }

    const contentType = (req.headers['content-type'] || '').toLowerCase()
    let parsed: unknown = undefined
    if (contentType.includes('application/json')) {
      if (raw.trim().length === 0) {
        send(res, 400, { error: 'empty JSON body' })
        return
      }
      try {
        parsed = JSON.parse(raw)
      } catch {
        send(res, 400, { error: 'invalid JSON' })
        return
      }
    }

    const result = normalizePayload(parsed, contentType, raw, url.searchParams)
    if ('error' in result) {
      send(res, 400, result)
      return
    }

    const id = randomUUID()
    try {
      captureHandler?.(result, id)
    } catch (err) {
      console.error('[CaptureWebhook] handler threw:', err)
      send(res, 500, { error: 'internal error' })
      return
    }
    send(res, 202, { ok: true, id })
    return
  }

  send(res, 404, { error: 'not found' })
}
