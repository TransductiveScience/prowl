import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const temp = await mkdtemp(join(tmpdir(), 'prowl-ledger-'))
process.env.HOME = temp
try {
  const { CodingLedger } = await import('../electron/mcp-change-ledger.ts')
  const ledger = new CodingLedger()
  const event = {
    eventId: 'test-event-concurrent-0001',
    phase: 'tested',
    files: ['src/main.ts'],
    description: 'Smoke test recorded from remote Desktop Commander',
    command: 'npm test',
    exitCode: 0,
  }
  const [one, two] = await Promise.all([ledger.record(event, null), ledger.record(event, null)])
  assert.equal(one.accepted && two.accepted, true)
  const { events } = await ledger.history()
  assert.equal(events.length, 1, 'Duplicate concurrent events must write exactly once')
  const file = await readFile(join(temp, '.prowl', 'coding-events.jsonl'), 'utf8')
  assert.equal(file.trim().split('\n').length, 1)
  const another = new CodingLedger()
  assert.equal((await another.history()).total, 1, 'History survives process-level reinitialization')
  await assert.rejects(() => another.record({ ...event, description: 'Changed payload' }, null),
    /eventId conflict/)
  console.log(JSON.stringify({ passed: true, checks: [
    'concurrent-idempotence', 'single-durable-write',
    'restart-recovery', 'idempotency-conflict',
  ] }))
} finally {
  await rm(temp, { recursive: true, force: true })
}
