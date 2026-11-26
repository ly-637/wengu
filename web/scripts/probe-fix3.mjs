import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9488
const BASE = 'http://127.0.0.1:3021'
const profile = path.resolve('..', 'shots', 'demo', 'probe4-profile')
fs.mkdirSync(profile, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' })

let ws
const pending = new Map()
let idc = 0
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })) })

async function main() {
  let url = null
  for (let i = 0; i < 80 && !url; i++) {
    try { url = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl } catch {}
    if (!url) await sleep(250)
  }
  ws = new WebSocket(url)
  await new Promise((res, rej) => ((ws.onopen = res), (ws.onerror = rej)))
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result) } }
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description || '').slice(0, 120); return r.result?.value }

  await send('Page.navigate', { url: `${BASE}/?view=outline` })
  await sleep(2800)
  console.log('bg before:', await ev(`(() => { const n = document.querySelector('.lane-points .node'); return n ? getComputedStyle(n).backgroundColor : 'none' })()`))
  await ev(`(() => { const el = document.querySelector('input[type=range]'); const s = Object.getOwnPropertyDescriptor(el.constructor.prototype,'value').set; s.call(el, el.max); el.dispatchEvent(new Event('input',{bubbles:true})) })()`)
  await sleep(1000)
  console.log('when-mini:', await ev(`document.querySelector('.when-mini')?.textContent.trim()`))
  console.log('bg after:', await ev(`(() => { const n = document.querySelector('.lane-points .node'); return n ? getComputedStyle(n).backgroundColor : 'none' })()`))

  await send('Page.navigate', { url: `${BASE}/?view=fragment&new=1` })
  await sleep(2600)
  console.log('upload html:', (await ev(`document.querySelector('.upload')?.outerHTML`)) || 'none')
  console.log('click sample:', await ev(`(() => { const e = [...document.querySelectorAll('button')].find(b=>b.textContent.includes('载入示例')); if(!e) return 'no'; e.click(); return 'ok' })()`))
  await sleep(900)
  console.log('btns after sample:', await ev(`JSON.stringify([...document.querySelectorAll('.upload button')].map(b=>({t:b.textContent.trim().slice(0,16), d:b.disabled})))`))
  console.log('textarea:', await ev(`(() => { const t = document.querySelector('.upload textarea'); return t ? t.value.slice(0,40) : 'none' })()`))

  chrome.kill(); process.exit(0)
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1) })
