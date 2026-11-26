// 针对性探针：时间滑块、回到今天、模式行、阅读上传卡
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9466
const BASE = 'http://127.0.0.1:3021'
const profile = path.resolve('..', 'shots', 'demo', 'probe2-profile')
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
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result) }
  }
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300))
    return r.result?.value
  }
  const clickText = async (t) => ev(`(() => {
    const el = [...document.querySelectorAll('button,a,[role=button]')].find(e => e.textContent.includes(${JSON.stringify(t)}))
    if (!el) return 'no-el'
    el.scrollIntoView({block:'center'})
    const r = el.getBoundingClientRect()
    el.click()
    return JSON.stringify({tag: el.tagName, cls: el.className, w: Math.round(r.width), h: Math.round(r.height), disabled: el.disabled})
  })()`)

  await send('Page.navigate', { url: `${BASE}/?view=home` })
  await sleep(3000)
  console.log('RANGE:', await ev(`(() => { const el = document.querySelector('input[type=range]'); if (!el) return 'none'; const r = el.getBoundingClientRect(); return JSON.stringify({cls: el.className, parent: el.parentElement.className, v: el.value, min: el.min, max: el.max, step: el.step, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top)}) })()`))
  console.log('BTN 今天:', await ev(`JSON.stringify([...document.querySelectorAll('button')].map(b=>b.textContent.trim().slice(0,12)).filter(t=>t.includes('今天')))`))
  console.log('MODE rows:', await ev(`JSON.stringify([...document.querySelectorAll('.mode-line')].map(e=>({tag:e.tagName, cls:e.className, txt:e.textContent.trim().slice(0,16)})))`))
  // 试着点第二行模式
  console.log('click mode2:', await ev(`(() => { const e = document.querySelectorAll('.mode-line')[1]; if (!e) return 'none'; e.click(); return 'ok' })()`))
  await sleep(600)
  console.log('hero tag:', await ev(`document.querySelector('.hero-tag')?.textContent.trim()`))

  // 滑块：设值 + 触发 input
  console.log('set range:', await ev(`(() => {
    const el = document.querySelector('input[type=range]')
    const proto = el.constructor.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(el, el.max)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return el.value + ' / max ' + el.max
  })()`))
  await sleep(800)
  console.log('when:', await ev(`document.querySelector('.when')?.textContent.trim()`))

  // 阅读
  await send('Page.navigate', { url: `${BASE}/?view=fragment` })
  await sleep(2500)
  console.log('reader btn 新的一篇:', await clickText('新的一篇'))
  await sleep(800)
  console.log('upload card?', await ev(`JSON.stringify({upload: !!document.querySelector('.upload'), txt: document.body.innerText.slice(0, 120).replace(/\\n/g,'|')})`))
  console.log('btn 载入示例:', await clickText('载入示例讲义'))
  await sleep(700)
  console.log('title input value:', await ev(`document.querySelector('.upload input')?.value`))
  console.log('btn 切成小段:', await clickText('切成小段'))
  await sleep(1500)
  console.log('after slice:', await ev(`JSON.stringify({segs: document.querySelectorAll('.seg').length, txt: document.body.innerText.slice(0,80).replace(/\\n/g,'|')})`))

  chrome.kill(); process.exit(0)
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1) })
