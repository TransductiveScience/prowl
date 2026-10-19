import { App } from '@modelcontextprotocol/ext-apps'

const app = new App({ name: 'Prowl coding review', version: '0.5.0' })
const list = document.getElementById('events') as HTMLOListElement
const status = document.getElementById('state') as HTMLParagraphElement
const refresh = document.getElementById('refresh') as HTMLButtonElement

function show(payload: unknown): void {
  try {
    const result = payload as { structuredContent?: unknown; content?: Array<{ type?: string; text?: string }> }
    const plain = result.structuredContent ??
      JSON.parse(result.content?.find(c => c.type === 'text')?.text || '{}')
    const value = plain as {
      total?: number
      events?: Array<{ eventId: string; phase: string; description: string; at: string; files: string[]; exitCode?: number; receipt?: string }>
    }
    list.replaceChildren()
    if (!value.events?.length) {
      status.textContent = 'No recorded coding changes yet.'
      return
    }
    status.textContent = `${value.total ?? value.events.length} recorded coding actions`
    for (const event of value.events) {
      const li = document.createElement('li')
      const title = document.createElement('strong')
      title.textContent = event.phase.toUpperCase() + ' / ' + event.description
      li.append(title)
      const info = document.createElement('p')
      info.textContent = [event.at, event.files?.join(', '), event.exitCode === undefined ? '' : 'Exit ' + event.exitCode].filter(Boolean).join(' • ')
      li.append(info)
      if (event.receipt) {
        const receipt = document.createElement('small')
        receipt.textContent = event.receipt
        li.append(receipt)
      }
      list.append(li)
    }
  } catch (error) {
    status.textContent = 'Unable to render coding history: ' + String(error)
  }
}

app.ontoolresult = show
refresh.addEventListener('click', async () => {
  status.textContent = 'Refreshing…'
  try {
    show(await app.callServerTool({ name: 'prowl_change_history', arguments: { limit: 30 } }))
  } catch (error) { status.textContent = 'Refresh failed: ' + String(error) }
})
void app.connect().catch(error => { status.textContent = 'Connection failed: ' + String(error) })
