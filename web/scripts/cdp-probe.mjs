/**
 * 用 CDP 驱动无头 Chrome 点一遍页面（截图看不出「点了没反应」这类问题）。
 *
 * 用法：
 *   node scripts/cdp-probe.mjs "http://127.0.0.1:3021/?view=sprint" "开始整卷"
 * 第二个参数是按钮文字（包含匹配），会给它 click()，然后把页面文字和报错打出来。
 */

import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9333
const url = process.argv[2] ?? 'http://127.0.0.1:3021/?view=sprint'
const clickText = process.argv[3] ?? ''
const waitMs = Number(process.argv[4] ?? 3000)

const proc = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=' + process.cwd() + '/.cdp-profile',
    '--window-size=1440,1100',
    'about:blank',
  ],
  { stdio: 'ignore', detached: false },
)

const fail = (msg) => {
  console.error('PROBE FAIL:', msg)
  try {
    proc.kill()
  } catch {}
  process.exit(1)
}

// 等 devtools 起来
let targets = null
for (let i = 0; i < 40; i += 1) {
  await sleep(250)
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
    const list = await res.json()
    const page = list.find((t) => t.type === 'page')
    if (page) {
      targets = page
      break
    }
  } catch {}
}
if (!targets) fail('devtools 没起来')

const ws = new WebSocket(targets.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const logs = []

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const msgId = ++id
    pending.set(msgId, { resolve, reject })
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(JSON.stringify(msg.error)))
    else resolve(msg.result)
    return
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    logs.push('console.error: ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('EXCEPTION: ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text))
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    logs.push(`log: ${msg.params.entry.text} ${msg.params.entry.url ?? ''}`)
  }
})

await new Promise((resolve) => ws.addEventListener('open', resolve))

await send('Runtime.enable')
await send('Log.enable')
await send('Page.enable')
await send('Page.navigate', { url })
await sleep(waitMs)

const evaluate = async (expression) => {
  const out = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (out.exceptionDetails) throw new Error(out.exceptionDetails.exception?.description ?? out.exceptionDetails.text)
  return out.result.value
}

if (clickText) {
  const clicked = await evaluate(`(() => {
    const el = [...document.querySelectorAll('button,a')].find((n) => (n.textContent || '').includes(${JSON.stringify(clickText)}))
    if (!el) return 'NOT_FOUND'
    el.click()
    return 'CLICKED: ' + (el.textContent || '').trim().slice(0, 40)
  })()`)
  console.log(clicked)
  await sleep(waitMs)
}

const text = await evaluate('document.body.innerText.replace(/\\n{2,}/g, "\\n").slice(0, 1200)')
const diag = await evaluate(`JSON.stringify({
  modal: !!document.querySelector('.exam-modal'),
  items: document.querySelectorAll('.exam-modal .qitem').length,
  opts: document.querySelectorAll('.exam-modal .opt').length,
  submit: (() => { const b=[...document.querySelectorAll('.exam-modal button')].find(n=>(n.textContent||'').includes('交卷')); return b ? b.textContent.trim() : null })(),
  err: document.querySelector('.quizerr') ? document.querySelector('.quizerr').textContent : null,
})`)
console.log('--- 结构 ---')
console.log(diag)
if (process.env.PROBE_EXPR) {
  const extra = await evaluate(process.env.PROBE_EXPR)
  console.log('--- eval ---')
  console.log(typeof extra === 'string' ? extra : JSON.stringify(extra, null, 2))
}
// 复杂脚本（含中文/多行）走文件，避免 PowerShell 吃掉引号
if (process.env.PROBE_FILE) {
  const { readFile } = await import('node:fs/promises')
  const code = await readFile(process.env.PROBE_FILE, 'utf8')
  const extra = await evaluate(code)
  console.log('--- file eval ---')
  console.log(typeof extra === 'string' ? extra : JSON.stringify(extra, null, 2))
}
console.log('--- 页面文字 ---')
console.log(text)
console.log('--- 报错 ---')
console.log(logs.length ? logs.join('\n') : '(无)')

// SHOT=路径 时顺便截一张图（比 --screenshot 灵活：可以在点击之后的任何状态截）
if (process.env.SHOT) {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  const { writeFile } = await import('node:fs/promises')
  await writeFile(process.env.SHOT, Buffer.from(shot.data, 'base64'))
  console.log('shot ->', process.env.SHOT)
}

try {
  proc.kill()
} catch {}
process.exit(logs.length ? 2 : 0)
