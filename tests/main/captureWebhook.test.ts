import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  startCaptureWebhook,
  stopCaptureWebhook,
  setCaptureHandler,
  normalizePayload
} from '../../src/main/captureWebhook'
import type { CaptureWebhookPayload } from '../../src/shared/types'

const TEST_PORT = 0 // OS-assigned

async function freePort(): Promise<number> {
  // Use port 0 trick: start, get port, stop
  const { createServer } = await import('http')
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port
      s.close(() => resolve(port))
    })
    s.on('error', reject)
  })
}

let baseUrl = ''
let received: CaptureWebhookPayload[] = []

async function startServer(): Promise<number> {
  const port = await freePort()
  setCaptureHandler((payload) => { received.push(payload) })
  await startCaptureWebhook(port)
  baseUrl = `http://127.0.0.1:${port}`
  return port
}

beforeEach(() => {
  received = []
})

afterEach(async () => {
  await stopCaptureWebhook()
})

describe('captureWebhook normalizePayload', () => {
  it('extracts content from {title, transcript} JSON shape', () => {
    const result = normalizePayload(
      { title: 'Standup', transcript: 'Alice: hi\nBob: hi' },
      'application/json',
      '',
      new URLSearchParams()
    )
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.content.startsWith('# Standup')).toBe(true)
    expect(result.content).toContain('Alice: hi')
    expect(result.sourceHint).toBe('meeting') // transcript field implies meeting
    expect(result.title).toBe('Standup')
  })

  it('honors content alias preferences', () => {
    for (const key of ['content', 'text', 'body', 'message', 'markdown']) {
      const result = normalizePayload(
        { [key]: 'hello' },
        'application/json',
        '',
        new URLSearchParams()
      )
      expect('error' in result).toBe(false)
      if ('error' in result) continue
      expect(result.content).toBe('hello')
    }
  })

  it('validates sourceHint and ignores unknown values', () => {
    const result = normalizePayload(
      { content: 'hi', source: 'bogus' },
      'application/json',
      '',
      new URLSearchParams()
    )
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.sourceHint).toBe('')
  })

  it('accepts well-known sourceHint values', () => {
    for (const v of ['slack', 'github', 'email', 'meeting', 'feedback', 'other']) {
      const result = normalizePayload(
        { content: 'hi', sourceHint: v },
        'application/json',
        '',
        new URLSearchParams()
      )
      expect('error' in result).toBe(false)
      if ('error' in result) continue
      expect(result.sourceHint).toBe(v)
    }
  })

  it('treats text/plain body as content with query source', () => {
    const result = normalizePayload(
      undefined,
      'text/plain',
      'just a note',
      new URLSearchParams('source=slack')
    )
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.content).toBe('just a note')
    expect(result.sourceHint).toBe('slack')
  })

  it('rejects empty content', () => {
    const result = normalizePayload({}, 'application/json', '', new URLSearchParams())
    expect('error' in result).toBe(true)
  })

  it('rejects non-object JSON', () => {
    const result = normalizePayload('hi', 'application/json', '', new URLSearchParams())
    expect('error' in result).toBe(true)
  })

  it('extracts speakers array', () => {
    const result = normalizePayload(
      { content: 'note', speakers: ['Alice', 'Bob', '', 123] },
      'application/json',
      '',
      new URLSearchParams()
    )
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.speakers).toEqual(['Alice', 'Bob'])
  })

  it('does not double-prepend title when already present', () => {
    const result = normalizePayload(
      { title: 'Standup', content: '# Standup\n\nbody' },
      'application/json',
      '',
      new URLSearchParams()
    )
    if ('error' in result) throw new Error('unexpected error')
    expect(result.content.match(/# Standup/g)?.length).toBe(1)
  })
})

describe('captureWebhook HTTP server', () => {
  it('POST /capture with {title,transcript} returns 202 and forwards normalized payload', async () => {
    await startServer()
    const res = await fetch(`${baseUrl}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Standup', transcript: 'hello world' })
    })
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(typeof body.id).toBe('string')
    expect(received.length).toBe(1)
    expect(received[0].sourceHint).toBe('meeting')
    expect(received[0].content).toContain('# Standup')
    expect(received[0].content).toContain('hello world')
  })

  it('GET /health returns 200', async () => {
    await startServer()
    const res = await fetch(`${baseUrl}/health`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('OPTIONS /capture returns 204 with CORS headers', async () => {
    await startServer()
    const res = await fetch(`${baseUrl}/capture`, { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-methods')).toContain('POST')
  })

  it('GET /capture returns 405', async () => {
    await startServer()
    const res = await fetch(`${baseUrl}/capture`)
    expect(res.status).toBe(405)
  })

  it('unknown path returns 404', async () => {
    await startServer()
    const res = await fetch(`${baseUrl}/nope`)
    expect(res.status).toBe(404)
  })

  it('rejects invalid JSON with 400', async () => {
    await startServer()
    const res = await fetch(`${baseUrl}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid'
    })
    expect(res.status).toBe(400)
  })

  it('rejects empty content with 400', async () => {
    await startServer()
    const res = await fetch(`${baseUrl}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    })
    expect(res.status).toBe(400)
  })

  it('accepts text/plain body with ?source query', async () => {
    await startServer()
    const res = await fetch(`${baseUrl}/capture?source=slack`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'a quick note'
    })
    expect(res.status).toBe(202)
    expect(received[0].content).toBe('a quick note')
    expect(received[0].sourceHint).toBe('slack')
  })

  it('rejects request with mismatched Host header (DNS rebinding defense)', async () => {
    const port = await startServer()
    // Manually open a TCP socket so we can lie about the Host header
    const net = await import('net')
    const data = await new Promise<string>((resolve, reject) => {
      const sock = net.createConnection({ host: '127.0.0.1', port })
      let buf = ''
      sock.on('data', (d) => { buf += d.toString() })
      sock.on('end', () => resolve(buf))
      sock.on('error', reject)
      sock.write(
        'POST /capture HTTP/1.1\r\n' +
        'Host: evil.example.com\r\n' +
        'Content-Type: application/json\r\n' +
        'Content-Length: 16\r\n' +
        'Connection: close\r\n' +
        '\r\n' +
        '{"content":"hi"}'
      )
    })
    expect(data).toContain('403')
    expect(received.length).toBe(0)
  })

  it('returns 413 for bodies larger than 5MB', async () => {
    await startServer()
    const big = 'x'.repeat(5 * 1024 * 1024 + 10)
    const res = await fetch(`${baseUrl}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: big
    })
    expect(res.status).toBe(413)
  })

  it('start/stop lifecycle', async () => {
    const port = await startServer()
    const r1 = await fetch(`${baseUrl}/health`)
    expect(r1.status).toBe(200)
    await stopCaptureWebhook()
    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow()
  })

  it('handler exception surfaces 500 to caller', async () => {
    const port = await freePort()
    setCaptureHandler(() => { throw new Error('boom') })
    await startCaptureWebhook(port)
    const res = await fetch(`http://127.0.0.1:${port}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hi' })
    })
    expect(res.status).toBe(500)
  })
})
