// 快速 DOM 探针：确认录制脚本里用到的选择器真的存在
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9455
const BASE = 'http://127.0.0.1:3021'
const profile = path.resolve('..', 'shots', 'demo', 'probe-profile')
fs.mkdirSync(profile, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const chrome = spawn(
  CHROME,
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1600,900', 'about:blank'],
  { stdio: 'ignore' },
)

let ws
const pending = new Map()
let idc = 0
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++idc
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })

async function main() {
  let wsUrl = null
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl
    } catch {}
    if (!wsUrl) await sleep(250)
  }
  ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => ((ws.onopen = res), (ws.onerror = rej)))
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? reject(new Error(m.error.message)) : resolve(m.result)
    }
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1.2, mobile: false })

  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400))
    return r.result?.value
  }

  const dump = `(() => {
    const q = (s) => document.querySelectorAll(s).length
    const cls = (s) => [...document.querySelectorAll(s)].slice(0,3).map(e => e.className)
    return {
      url: location.href,
      range: q('.travel input[type=range]') + '/' + q('input[type=range]'),
      modeLine: q('.mode-line') + ' ' + JSON.stringify(cls('.mode-line')),
      heroBtn: JSON.stringify([...document.querySelectorAll('button')].slice(0,12).map(b => b.textContent.trim().slice(0,14))),
      qcard: q('.qcard') + ' opts:' + q('.qcard .opt'),
      textareas: q('textarea') + ' ' + JSON.stringify(cls('textarea')),
      buttonsWithJiaojuan: JSON.stringify([...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(t=>t.includes('交卷')).slice(0,3)),
    }
  })()`

  await send('Page.navigate', { url: `${BASE}/?view=home` })
  await sleep(3000)
  console.log('HOME', JSON.stringify(await ev(dump), null, 1))

  await send('Page.navigate', { url: `${BASE}/?view=study` })
  await sleep(2500)
  console.log('STUDY', JSON.stringify(await ev(dump), null, 1))

  await send('Page.navigate', { url: `${BASE}/?view=fragment` })
  await sleep(2500)
  console.log('READER', JSON.stringify(await ev(dump), null, 1))
  console.log('READER nodes', JSON.stringify(await ev(`[...document.querySelectorAll('button')].map(b=>b.textContent.trim().slice(0,12)).slice(0,20)`)))

  chrome.kill()
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  chrome.kill()
  process.exit(1)
})
