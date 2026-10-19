import assert from 'node:assert/strict'
const url = process.env.PROWL_MCP_URL || 'http://127.0.0.1:32117/mcp'
const token = process.env.PROWL_MCP_TEST_TOKEN
if (!token) throw new Error('Set PROWL_MCP_TEST_TOKEN to test the authenticated local endpoint')
const modernVersion = '2026-07-28'
const modernMeta = {
  'io.modelcontextprotocol/protocolVersion': modernVersion,
  'io.modelcontextprotocol/clientCapabilities': {},
  'io.modelcontextprotocol/clientInfo': { name: 'prowl-smoke', version: '1.0.0' },
}
const modernRequests = []
let sequence = 0
async function rpc(method, params = {}, authorized = true, modern = false) {
  const id = ++sequence
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(modern ? {
        'MCP-Protocol-Version': modernVersion,
        'Mcp-Method': method,
        ...(method === 'tools/call' ? { 'Mcp-Name': params.name } : {}),
      } : {}),
      ...(authorized ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method,
      params: modern ? { ...params, _meta: { ...params._meta, ...modernMeta } } : params }),
    signal: AbortSignal.timeout(15000),
  })
  const body = await response.text()
  const data = response.headers.get('content-type')?.includes('text/event-stream')
    ? body.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6))).at(-1)
    : JSON.parse(body)
  if (authorized) {
    assert.equal(data.jsonrpc, '2.0', method + ': JSON-RPC version')
    assert.equal(data.id, id, method + ': response ID')
    assert.equal(data.error, undefined, method + ': RPC error ' + JSON.stringify(data.error))
  }
  if (modern) modernRequests.push({
    method, name: params.name, protocolVersion: modernVersion,
    metadataKeys: Object.keys(modernMeta), status: response.status, responseId: data.id,
  })
  return { status: response.status, data }
}
const unauthorized = await rpc('tools/list', {}, false)
assert.equal(unauthorized.status, 401, 'HTTP endpoint must require authorization')
// Run modern requests before initialize: no legacy handshake can mask a fallback.
const modernRpc = (method, params = {}) => rpc(method, params, true, true)
const modern = await modernRpc('server/discover')
assert.equal(modern.status, 200)
assert(modern.data.result.supportedVersions.includes(modernVersion))
const modernListing = await modernRpc('tools/list')
assert.equal(modernListing.status, 200)
const modernTools = modernListing.data.result.tools
assert(modernTools.some(tool => tool.name === 'prowl_job_status'),
  'Modern discovery must advertise the tool invoked below')
const jobParams = { name: 'prowl_job_status', arguments: { id: 'missingjob123' } }
const modernCall = await modernRpc('tools/call', jobParams)
assert.equal(modernCall.status, 200)
assert.notEqual(modernCall.data.result.isError, true, 'Modern tool execution must succeed')
assert.deepEqual(modernCall.data.result.structuredContent, { job: null })
const initialized = await rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'prowl-smoke', version: '1.0.0' },
})
assert.equal(initialized.status, 200)
assert.equal(initialized.data.result.protocolVersion, '2025-06-18')
assert.equal(initialized.data.result.serverInfo.name, 'prowl')
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
const missing = await rpc('tools/call', jobParams)
assert.equal(missing.status, 200)
assert.notEqual(missing.data.result.isError, true, 'Legacy tool execution must succeed')
assert.deepEqual(missing.data.result.structuredContent, modernCall.data.result.structuredContent)
assert.deepEqual([...names].sort(), modernTools.map(tool => tool.name).sort(),
  'Modern and legacy clients must discover the same tools')
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
  modern: { protocol: modernVersion, count: modernTools.length, requests: modernRequests,
    tool: jobParams.name, result: modernCall.data.result.structuredContent },
  acceptance: { localProtocol: 'passed', httpsIngress: 'unverified',
    productionOAuth: 'unverified', chatgptHost: 'unverified' },
  appUri: uri,
  checks: ['authentication','legacy-initialize','modern-server-discover','modern-tools/list','modern-tools/call','legacy-tools/list','legacy-tools/call','annotations','resources/list','resources/read','job-status'],
}, null, 2))
