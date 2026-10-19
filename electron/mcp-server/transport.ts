/** MCP 2026-07-28 and legacy stateless 2025 on one authenticated HTTP route. */
import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { createMcpHandler, type McpServer } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'

export function authorized(header: string | undefined, token: string): boolean {
  if (!header?.startsWith('Bearer ')) return false
  const supplied = Buffer.from(header.slice(7))
  const expected = Buffer.from(token)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

export async function serveProwlMcpHttp(factory: () => McpServer): Promise<void> {
  const token = process.env.PROWL_REMOTE_TOKEN
  if (!token || token.length < 24) {
    throw new Error('PROWL_REMOTE_TOKEN must contain a random secret of at least 24 characters')
  }
  const port = Number(process.env.PROWL_MCP_PORT || '32041')
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Invalid PROWL_MCP_PORT')
  }
  const handler = toNodeHandler(createMcpHandler(factory, { legacy: 'stateless' }))
  const server = createServer(async (req, res) => {
    if (req.url?.split('?')[0] !== '/mcp') {
      res.writeHead(404).end('Not found')
      return
    }
    if (!authorized(req.headers.authorization, token)) {
      res.writeHead(401, {
        'WWW-Authenticate': 'Bearer',
        'Content-Type': 'application/json',
      }).end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' }).end('Method not allowed')
      return
    }
    try {
      await handler(req, res)
    } catch (error) {
      console.error('[prowl:mcp] HTTP request failed', error)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ error: 'Internal MCP error' }))
      } else if (!res.writableEnded) {
        res.end()
      }
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  console.error(`[prowl:mcp] dual-era HTTP ready on 127.0.0.1:${port}/mcp`)
}
