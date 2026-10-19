import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { readJob, requestCancellation, startJob } from './tasks.js'

type Api = (name: string, params: unknown) => Promise<unknown>
const uri = 'ui://prowl/coding-review.html'
function respond(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
    structuredContent: data && typeof data === 'object' && !Array.isArray(data)
      ? data as Record<string, unknown> : { value: data },
  }
}

export function registerCodingTools(server: McpServer, api: Api): void {
  server.registerTool('prowl_record_change', {
    title: 'Record coding action',
    description: 'Record an observed edit or test performed through DC-i9ES. This logs evidence and highlights graph nodes; it does not write code. Reuse eventId on retry.',
    inputSchema: {
      eventId: z.string().min(8).max(128),
      phase: z.enum(['planned', 'modified', 'tested', 'verified', 'failed']),
      files: z.array(z.string().min(1).max(500)).max(100),
      description: z.string().min(1).max(600),
      command: z.string().max(500).optional(),
      exitCode: z.number().int().optional(),
      receipt: z.string().max(1000).optional(),
    },
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  }, async (params) => respond(await api('change-event', params)))

  server.registerTool('prowl_change_history', {
    title: 'Coding change history',
    description: 'Read recent coding actions, modified files, and observed test results.',
    inputSchema: { limit: z.number().int().min(1).max(100).optional() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (params) => respond(await api('change-history', params)))

  server.registerTool('prowl_coding_review', {
    title: 'Interactive coding review',
    description: 'Open interactive Prowl change history with file lists, stages, and test receipts.',
    inputSchema: { limit: z.number().int().min(1).max(100).optional() },
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: uri } },
  }, async (params) => respond(await api('change-history', params)))

  server.registerResource('Prowl coding review', uri, {
    mimeType: 'text/html;profile=mcp-app',
    description: 'Review coding changes; refresh with the MCP Apps bridge.',
  }, async () => {
    const file = join(dirname(fileURLToPath(import.meta.url)), 'review-widget.js')
    const source = (await readFile(file, 'utf8')).replaceAll('</script', '<\\/script')
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prowl / Coding review</title><style>
:root{color-scheme:light dark;font:14px system-ui,sans-serif}
body{margin:0;padding:16px;background:Canvas;color:CanvasText}
header{display:flex;justify-content:space-between;gap:16px;align-items:center}
button{color:inherit;background:transparent;border:1px solid #888;border-radius:2px;padding:8px 12px;cursor:pointer}
button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
ol{padding:0;list-style:none}li{border-top:1px solid #8886;padding:10px 0}
small{opacity:.72}code{font:12px ui-monospace,monospace;overflow-wrap:anywhere}
</style></head><body><header><strong>PROWL / CHANGES</strong>
<button type="button" id="refresh">Refresh</button></header>
<p id="state" role="status">Connecting to Prowl…</p>
<ol id="events" aria-label="Recent coding changes"></ol>
<script>${source}</script></body></html>`
    return { contents: [{ uri, mimeType: 'text/html;profile=mcp-app', text: html }] }
  })

  server.registerTool('prowl_start_investigation', {
    title: 'Start code investigation',
    description: 'Start a code investigation and return a stable job ID immediately. Poll prowl_job_status.',
    inputSchema: {
      task: z.string().min(1),
      depth: z.number().int().min(1).max(15).optional(),
      requestKey: z.string().min(4).max(128).optional(),
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ task, depth, requestKey }) =>
    respond(await startJob('investigate', requestKey, () => api('investigate', { task, depth }))))

  server.registerTool('prowl_job_status', {
    title: 'Investigation job status',
    description: 'Retrieve a durable code investigation result by ID.',
    inputSchema: { id: z.string() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ id }) => respond({ job: await readJob(id) }))

  server.registerTool('prowl_job_cancel', {
    title: 'Request investigation cancellation',
    description: 'Request cancellation without pretending the renderer computation stopped.',
    inputSchema: { id: z.string() },
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ id }) => respond({ job: await requestCancellation(id) }))
}
