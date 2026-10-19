import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

export async function callProwl(name: string, params: unknown): Promise<unknown> {
  const directory = join(homedir(), '.prowl')
  const port = Number((await readFile(join(directory, 'mcp-port'), 'utf8')).trim())
  const token = (await readFile(join(directory, 'mcp-auth'), 'utf8')).trim()
  if (!Number.isInteger(port) || port < 1 || port > 65535 || token.length < 16) {
    throw new Error('Prowl Electron is not running or its connection information is invalid')
  }
  const timeout = name === 'ask' || name === 'investigate' ? 120_000 : 35_000
  const response = await fetch(`http://127.0.0.1:${port}/api/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params ?? {}),
    signal: AbortSignal.timeout(timeout),
  })
  const data = await response.json() as { success?: boolean; data?: unknown; error?: string }
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Prowl internal API responded with HTTP ${response.status}`)
  }
  return data.data
}
