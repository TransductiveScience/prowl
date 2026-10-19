import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type JobState = 'running' | 'completed' | 'failed' | 'interrupted' | 'cancel_requested'
export type JobRecord = {
  id: string
  kind: 'ask' | 'investigate'
  state: JobState
  createdAt: string
  updatedAt: string
  result?: unknown
  error?: string
}
const dir = join(homedir(), '.prowl', 'mcp-jobs')
const active = new Map<string, JobRecord>()
const validId = /^[a-f0-9-]{8,64}$/

async function save(job: JobRecord): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const dest = join(dir, job.id + '.json')
  const temporary = dest + '.' + randomUUID() + '.tmp'
  await writeFile(temporary, JSON.stringify(job), { mode: 0o600 })
  await rename(temporary, dest)
}
export async function readJob(id: string): Promise<JobRecord | null> {
  if (!validId.test(id)) return null
  const live = active.get(id)
  if (live) return live
  try {
    const job = JSON.parse(await readFile(join(dir, id + '.json'), 'utf8')) as JobRecord
    if (job.state === 'running' || job.state === 'cancel_requested') {
      job.state = 'interrupted'
      job.updatedAt = new Date().toISOString()
      await save(job)
    }
    return job
  } catch { return null }
}
export async function startJob(
  kind: JobRecord['kind'],
  requestKey: string | undefined,
  work: () => Promise<unknown>,
): Promise<JobRecord> {
  const id = requestKey
    ? createHash('sha256').update(kind + ':' + requestKey).digest('hex')
    : randomUUID()
  const existing = await readJob(id)
  if (existing) return existing
  const now = new Date().toISOString()
  const job: JobRecord = { id, kind, state: 'running', createdAt: now, updatedAt: now }
  active.set(id, job)
  await save(job)
  void (async () => {
    try {
      const result = await work()
      if (job.state === 'cancel_requested') {
        job.state = 'interrupted'
      } else {
        job.result = result
        job.state = 'completed'
      }
    } catch (error) {
      job.error = error instanceof Error ? error.message : String(error)
      job.state = 'failed'
    } finally {
      job.updatedAt = new Date().toISOString()
      await save(job).catch(() => {})
      active.delete(id)
    }
  })()
  return job
}
export async function requestCancellation(id: string): Promise<JobRecord | null> {
  const job = await readJob(id)
  if (!job) return null
  if (job.state === 'running') {
    job.state = 'cancel_requested'
    job.updatedAt = new Date().toISOString()
    await save(job)
  }
  return job
}
