import type { IncomingMessage, ServerResponse } from 'node:http'
import { logError } from '@/logger'

export async function handleAuthRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (req.method !== 'GET') return
    const pathname = new URL(req.url ?? '/', `http://${req.headers.host}`).pathname

    if (pathname.startsWith('/auth/')) {
      res.writeHead(404).end()
    }
  } catch (error) {
    logError('Unhandled error in auth route', error, { url: req.url })
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
    }
    res.end('Internal error')
  }
}
