import assert from 'node:assert/strict'
const url = process.env.PROWL_MCP_URL || 'http://127.0.0.1:32117/mcp'
const token = process.env.PROWL_MCP_TEST_TOKEN
if (!token) throw new Error('Set PROWL_MCP_TEST_TOKEN to test the authenticated local endpoint')
let sequence = 0
async function rpc(method, params = {}, authorized = true) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(authorized ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++sequence, method, params }),
    signal: AbortSignal.timeout(15000),
  })
  const body = await response.text()
  const data = response.headers.get('content-type')?.includes('text/event-stream')
    ? body.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6))).at(-1)
    : JSON.parse(body)
  return { status: response.status, data }
}
const unauthorized = await rpc('tools/list', {}, false)
assert.equal(unauthorized.status, 401, 'HTTP endpoint must require authorization')
const initialized = await rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'prowl-smoke', version: '1.0.0' },
})
assert.equal(initialized.status, 200)
assert.equal(initialized.data.result.serverInfo.name, 'prowl')
const modern = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2026-07-28',
    'Mcp-Method': 'server/discover',
  },
  body: JSON.stringify({
    jsonrpc: '2.0', id: ++sequence, method: 'server/discover',
    params: { _meta: {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientCapabilities': {},
      'io.modelcontextprotocol/clientInfo': { name: 'prowl-smoke', version: '1.0.0' },
    } },
  }),
  signal: AbortSignal.timeout(15000),
})
assert.equal(modern.status, 200)
assert((await modern.json()).result.supportedVersions.includes('2026-07-28'))
const listing = await rpc('tools/list')
assert.equal(listing.status, 200)
const tools = listing.data.result.tools
const names = new Set(tools.map(tool => tool.name))
for (const name of ['prowl_status', 'prowl_search', 'prowl_record_change',
  'prowl_change_history', 'prowl_coding_review', 'prowl_start_investigation',
  'prowl_job_status', 'prowl_job_cancel']) {
  assert(names.has(name), 'Missing tool ' + name)
}
assert(tools.find(t => t.name === 'prowl_coding_review')._meta?.ui?.resourceUri,
  'Coding review must advertise a ui:// resource')
assert.equal(tools.find(t => t.name === 'prowl_change_history').annotations?.readOnlyHint, true)
const resources = await rpc('resources/list')
const uri = 'ui://prowl/coding-review.html'
assert(resources.data.result.resources.some(resource => resource.uri === uri))
const read = await rpc('resources/read', { uri })
assert.equal(read.status, 200)
const html = read.data.result.contents[0].text
assert(html.includes('PROWL / CHANGES') && html.includes('<script>'))
const missing = await rpc('tools/call', { name: 'prowl_job_status', arguments: { id: 'missingjob123' } })
assert.equal(missing.status, 200)
assert.equal(missing.data.result.structuredContent?.job, null)
const prompts = await rpc('prompts/list')
assert(prompts.data.result.prompts.some(p => p.name === 'prowl_dc_coding'))
const codingPrompt = await rpc('prompts/get', {
  name: 'prowl_dc_coding',
  arguments: { goal: 'Add a typed status endpoint' },
})
assert(codingPrompt.data.result.messages[0].content.text.includes('Add a typed status endpoint'))
console.log(JSON.stringify({
  passed: true,
  protocol: initialized.data.result.protocolVersion,
  count: tools.length,
  appUri: uri,
  checks: ['authentication','legacy-initialize','modern-server-discover','tools/list','annotations','resources/list','resources/read','job-status'],
}, null, 2))
