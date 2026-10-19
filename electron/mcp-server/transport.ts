/** Remote MCP endpoint: stateless requests, localhost-only; external HTTPS/auth gateway required. */
import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function authorized(header: string | undefined, token: string): boolean {
  if (!header?.startsWith('Bearer ')) return false
  const supplied = Buffer.from(header.slice(7))
  const expected = Buffer.from(token)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

export async function serveProwlMcpHttp(factory: () => McpServer): Promise<void> {
  const token = process.env.PROWL_REMOTE_TOKEN
  if (!token || token.length < 24) throw new Error('PROWL_REMOTE_TOKEN must be set to a random 24+ character secret')
  const port = Number(process.env.PROWL_MCP_PORT || '32041')
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid PROWL_MCP_PORT')
  const server = createServer(async (req, res) => {
    if (req.url?.split('?')[0] !== '/mcp') {
      res.writeHead(404).end('Not found')
      return
    }
    if (!authorized(req.headers.authorization, token)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Bearer', 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' }).end('Method not allowed')
      return
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    const mcp = factory()
    try {
      await mcp.connect(transport)
      await transport.handleRequest(req, res)
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ error: 'MCP request failed' }))
      }
      console.error('[prowl:mcp] request failure:', err)
    } finally {
      await transport.close().catch(() => {})
      await mcp.close().catch(() => {})
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  console.error(`[prowl:mcp] HTTP ready on 127.0.0.1:${port}/mcp (authenticated)`)
}
