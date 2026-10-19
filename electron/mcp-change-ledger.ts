/** Durable observed coding events, independent from renderer request timeouts. */
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { BrowserWindow } from 'electron'

export type ChangePhase = 'planned' | 'modified' | 'tested' | 'verified' | 'failed'
export type CodingEvent = {
  eventId: string
  phase: ChangePhase
  files: string[]
  description: string
  command?: string
  exitCode?: number
  receipt?: string
  at: string
}
const store = join(homedir(), '.prowl', 'coding-events.jsonl')
const phases: ChangePhase[] = ['planned', 'modified', 'tested', 'verified', 'failed']

function validate(value: unknown): Omit<CodingEvent, 'at'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid coding event')
  const v = value as Record<string, unknown>
  if (typeof v.eventId !== 'string' || !/^[a-zA-Z0-9_.:-]{8,128}$/.test(v.eventId)) throw Error('Invalid eventId')
  if (!phases.includes(v.phase as ChangePhase)) throw Error('Invalid phase')
  if (!Array.isArray(v.files) || v.files.length > 100 ||
    !v.files.every(f => typeof f === 'string' && f.length > 0 && f.length <= 500)) throw Error('Invalid file paths')
  if (typeof v.description !== 'string' || v.description.length < 1 || v.description.length > 600) throw Error('Invalid description')
  if (v.command !== undefined && (typeof v.command !== 'string' || v.command.length > 500)) throw Error('Invalid command')
  if (v.receipt !== undefined && (typeof v.receipt !== 'string' || v.receipt.length > 1000)) throw Error('Invalid receipt')
  if (v.exitCode !== undefined && (!Number.isInteger(v.exitCode))) throw Error('Invalid exit code')
  if (['tested','verified','failed'].includes(v.phase as string) &&
    v.receipt === undefined && v.exitCode === undefined) throw Error('Test/verification events need evidence')
  return {
    eventId: v.eventId as string,
    phase: v.phase as ChangePhase,
    files: v.files as string[],
    description: v.description as string,
    ...(v.command !== undefined ? { command: v.command as string } : {}),
    ...(v.exitCode !== undefined ? { exitCode: v.exitCode as number } : {}),
    ...(v.receipt !== undefined ? { receipt: v.receipt as string } : {}),
  }
}

export class CodingLedger {
  private events: CodingEvent[] = []
  private ids = new Map<string, CodingEvent>()
  private ready: Promise<void> | null = null
  private writeQueue: Promise<void> = Promise.resolve()

  private initialize(): Promise<void> {
    if (!this.ready) this.ready = (async () => {
      try {
        const text = await readFile(store, 'utf8')
        for (const line of text.split('\n').filter(Boolean)) {
          try {
            const ev = JSON.parse(line) as CodingEvent
            if (ev.eventId && !this.ids.has(ev.eventId)) {
              this.ids.set(ev.eventId, ev)
              this.events.push(ev)
            }
          } catch { /* ignore damaged trailing line; preserve source log */ }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    })()
    return this.ready
  }

  record(value: unknown, window: BrowserWindow | null): Promise<{ accepted: boolean; duplicate: boolean; event: CodingEvent; deliveredToRenderer: boolean }> {
    const pending = this.writeQueue.then(() => this.recordExclusive(value, window))
    this.writeQueue = pending.then(() => undefined, () => undefined)
    return pending
  }

  private async recordExclusive(value: unknown, window: BrowserWindow | null): Promise<{ accepted: boolean; duplicate: boolean; event: CodingEvent; deliveredToRenderer: boolean }> {
    await this.initialize()
    const input = validate(value)
    const previous = this.ids.get(input.eventId)
    if (previous) {
      const { at: _timestamp, ...before } = previous
      if (JSON.stringify(before) !== JSON.stringify(input)) throw Error('eventId conflict: different payload')
      return { accepted: true, duplicate: true, event: previous, deliveredToRenderer: false }
    }
    const event: CodingEvent = { ...input, at: new Date().toISOString() }
    await mkdir(dirname(store), { recursive: true, mode: 0o700 })
    await appendFile(store, JSON.stringify(event) + '\n', { mode: 0o600 })
    this.ids.set(event.eventId, event)
    this.events.push(event)
    const canDeliver = !!window && !window.isDestroyed()
    if (canDeliver) window!.webContents.send('mcp:coding-event', event)
    return { accepted: true, duplicate: false, event, deliveredToRenderer: canDeliver }
  }

  async history(limit = 30): Promise<{ events: CodingEvent[]; total: number }> {
    await this.initialize()
    const n = Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : 30
    return { events: this.events.slice(-n).reverse(), total: this.events.length }
  }
}
