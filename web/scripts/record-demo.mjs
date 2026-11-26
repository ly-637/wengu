// 演示录屏：驱动无头 Chrome 走一遍脚本，边操作边截帧（Page.startScreencast），
// 同时记录字幕时间轴。产物：shots/demo/frames/*.jpg + frames.json + captions.json
//
// 用法：node scripts/record-demo.mjs
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9444
const OUT = path.resolve('..', 'shots', 'demo')
const FRAMES = path.join(OUT, 'frames')
const BASE = 'http://127.0.0.1:3021'

fs.rmSync(FRAMES, { recursive: true, force: true })
fs.mkdirSync(FRAMES, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = path.join(OUT, 'profile')
fs.mkdirSync(profile, { recursive: true })

const chrome = spawn(
  CHROME,
  [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--mute-audio',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--window-size=1600,900', 'about:blank',
  ],
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

const frames = []
const captions = []
const marks = []
const t0 = Date.now()
const now = () => Date.now() - t0

const CURSOR = `
(() => {
  if (window.__demoCursor) return
  const d = document.createElement('div')
  d.id = '__demo_cursor'
  d.style.cssText = 'position:fixed;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(22,22,20,.6);border:2px solid #fff;box-shadow:0 2px 12px rgba(0,0,0,.4);z-index:2147483647;pointer-events:none;transition:transform .05s linear'
  const r = document.createElement('div')
  r.id = '__demo_ripple'
  r.style.cssText = 'position:fixed;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;border:2px solid rgba(58,86,196,.85);opacity:0;z-index:2147483646;pointer-events:none'
  document.documentElement.append(d, r)
  window.__demoCursor = d
  window.__demoRipple = r
  window.__demoMove = (x, y) => {
    d.style.transform = 'translate(' + x + 'px,' + y + 'px)'
    r.style.transform = 'translate(' + x + 'px,' + y + 'px)'
  }
  window.__demoPulse = () => {
    r.style.transition = 'none'
    r.style.opacity = '1'
    r.style.width = '18px'; r.style.height = '18px'; r.style.margin = '-9px 0 0 -9px'
    requestAnimationFrame(() => {
      r.style.transition = 'all .5s ease-out'
      r.style.width = '62px'; r.style.height = '62px'; r.style.margin = '-31px 0 0 -31px'
      r.style.opacity = '0'
    })
  }

  // screencast 只在画面变化时出帧；页面静止时字幕会被「焊死」在上一帧上导致丢句。
  // 让光标始终轻微呼吸（±1.6px），页面就一直有新帧，字幕才能逐句烧进画面。
  let lastX = 0, lastY = 0, phase = 0
  const rawMove = window.__demoMove
  window.__demoMove = (x, y) => {
    lastX = x; lastY = y
    rawMove(x + Math.sin(phase / 3) * 1.6, y + Math.cos(phase / 4) * 1.6)
  }
  setInterval(() => {
    phase += 1
    rawMove(lastX + Math.sin(phase / 3) * 1.6, lastY + Math.cos(phase / 4) * 1.6)
  }, 200)
})()
`

async function evaluate(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300))
  return r.result?.value
}

async function moveTo(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 })
  await evaluate(`window.__demoMove && window.__demoMove(${x}, ${y})`)
}

async function clickAt(x, y, pause = 120) {
  await moveTo(x, y)
  await sleep(pause)
  await evaluate('window.__demoPulse && window.__demoPulse()')
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(70)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
}

// 在页面里找一个元素，滚动到视野内并返回中心点
const RECT_JS = (body) => `(() => {
  let el
  try { el = ${body} } catch (e) { return null }
  if (!el) return null
  el.scrollIntoView({ block: 'center' })
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return null
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
})()`

// 点元素：先移光标、播一下涟漪，再走 JS 的 click()。
// 走 JS 是因为列表重渲染后坐标容易失效，真实鼠标事件偶尔会点空。
async function clickJS(expr, wait = 280) {
  const r = await evaluate(RECT_JS(expr))
  if (!r) return false
  await moveTo(r.x, r.y)
  await sleep(120)
  await evaluate('window.__demoPulse && window.__demoPulse()')
  const ok = await evaluate(`(() => { const el = ${expr}; if (!el) return false; el.click(); return true })()`)
  if (!ok) return false
  await sleep(wait)
  return true
}

async function clickElement(expr, wait = 280) {
  const rect = () => evaluate(RECT_JS(expr))
  let r = await rect()
  if (!r) return false
  await sleep(160)
  r = (await rect()) || r
  await clickAt(r.x, r.y)
  await sleep(wait)
  return true
}

async function clickText(text, wait = 280) {
  for (let i = 0; i < 20; i++) {
    const ok = await clickElement(
      `[...document.querySelectorAll('button, a, [role="button"], .mode-line')].find((e) => (e.textContent || '').replace(/\\s+/g, ' ').includes(${JSON.stringify(text)}))`,
      wait,
    )
    if (ok) return true
    await sleep(250)
  }
  console.warn('  !! clickText 失败:', text)
  return false
}

async function clickSel(sel, index = 0, wait = 280) {
  const ok = await clickElement(`document.querySelectorAll(${JSON.stringify(sel)})[${index}]`, wait)
  if (!ok) console.warn('  !! clickSel 失败:', sel, index)
  return ok
}

async function typeInto(sel, text) {
  const r = await evaluate(RECT_JS(`document.querySelector(${JSON.stringify(sel)})`))
  if (!r) {
    console.warn('  !! 找不到输入框', sel)
    return false
  }
  await clickAt(r.x, r.y)
  await sleep(150)
  await evaluate(`document.querySelector(${JSON.stringify(sel)}).focus()`)
  await send('Input.insertText', { text })
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)})
    const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set
    setter.call(el, ${JSON.stringify(text)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await sleep(200)
  return true
}

async function caption(text, holdAfter = 0) {
  const t = now() / 1000
  captions.push({ t, text })
  marks.push({ t, text })
  if (holdAfter) await sleep(holdAfter)
}

async function waitText(text, timeout = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const ok = await evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`)
    if (ok) return true
    await sleep(150)
  }
  console.warn('  !! 等文字超时:', text)
  return false
}

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(250)
  }
  throw new Error('chrome 没起来')
}

async function main() {
  const wsUrl = await connect()
  ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => ((ws.onopen = res), (ws.onerror = rej)))
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
      return
    }
    if (msg.method === 'Page.screencastFrame') {
      const d = msg.params
      const file = `f${String(frames.length + 1).padStart(5, '0')}.jpg`
      fs.writeFileSync(path.join(FRAMES, file), Buffer.from(d.data, 'base64'))
      frames.push({ file, t: now() / 1000 })
      send('Page.screencastFrameAck', { sessionId: d.sessionId }).catch(() => {})
    }
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1.2, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: CURSOR })

  // 干净起点：重置学习数据、清空读本
  await fetch(`${BASE}/api/state/reset`, { method: 'POST' })
  const docs = await (await fetch(`${BASE}/api/docs`)).json()
  for (const d of docs.docs ?? []) await fetch(`${BASE}/api/docs/${d.id}`, { method: 'DELETE' })

  await send('Page.navigate', { url: `${BASE}/?view=home` })
  await sleep(2800)
  await moveTo(1180, 520)

  // 用 screencast 截帧（它只在画面变化时出帧，所以在注入脚本里让光标始终轻微呼吸，
  // 保证页面静止时也有帧，否则那几秒的字幕会被焊死在上一帧上）
  await send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })
  await sleep(600)

  // 1 首页
  await caption('学习地图：一个会算「什么时候会忘」的学习网站。', 2600)
  await caption('它每天只回答一个问题：今晚先做什么。', 3200)
  await caption('首页给出一件事、一个时长，和三个数字：记得多少、下次复习、要花多久。', 3400)
  await caption('推荐不是写死的，是算出来的：逾期的、考频高的、掌握度低的，排在前面。', 3400)

  // 2 进入考点
  await caption('点「开始」，进到这一个考点的单间。', 1400)
  await clickText('开始 · ')
  await sleep(1500)
  await caption('左侧仍是地图，中间是助教。圆环里的数字 = 学得多扎实 × 现在还记得多少。', 3000)
  await caption('先让它讲一遍。', 700)
  await clickText('讲一遍', 600)
  await caption('讲的时候先给结论，再拆三点，最后反问一句——逼你自己回忆。', 3600)
  await sleep(1800)
  await caption('讲完不算数，得考。', 800)
  await clickText('考我 3 题', 900)
  await caption('题目只考这一个考点，四选一，一次三题。', 2600)
  await caption('故意全答错，看它怎么变。', 900)

  // 先按题库里的正确答案算出「三题全错」，保证这段一定有可见的颜色下跌
  let answers = ['A', 'A', 'A']
  try {
    const st = await (await fetch(`${BASE}/api/state`)).json()
    const title = await evaluate(`document.querySelector('.study h2, .study-head h2, h2')?.textContent?.trim() || ''`)
    const kp = st.kps.find((k) => k.title === title) || st.kps.find((k) => title && title.includes(k.title))
    if (kp) {
      const q = await (await fetch(`${BASE}/api/ai/quiz?kpId=${kp.id}`)).json()
      if (Array.isArray(q.items) && q.items.length >= 3) {
        answers = q.items.slice(0, 3).map((it) => String(it.answer || 'A').trim().charAt(0).toUpperCase())
      }
    }
  } catch (e) {
    console.warn('  !! 取答案失败，默认全选 A', e.message)
  }
  const letters = ['A', 'B', 'C', 'D']
  for (let i = 0; i < 3; i++) {
    // 全都挑一个跟正确答案不一样的选项
    const pick = letters.find((l) => l !== answers[i]) ?? 'B'
    const idx = Math.max(0, letters.indexOf(pick))
    await clickJS(`document.querySelectorAll('.qcard .qitem')[${i}]?.querySelectorAll('.opt')[${idx}]`, 460)
  }
  await sleep(500)
  await clickJS(`[...document.querySelectorAll('.qcard button')].find((b) => b.textContent.includes('交卷'))`, 1400)
  await evaluate(`(() => { const el = document.querySelector('.qdelta') || document.querySelector('.qcard-foot'); if (el) el.scrollIntoView({ block: 'center' }) })()`)
  await sleep(600)
  await caption('交卷后颜色当场变，新的掌握度直接写回知识树。', 4200)
  await caption('答错会缩短复习间隔：明天它就会再出现，而不是五天后。', 3600)

  // 3 地图 + 时间旅行
  await caption('回到地图：28 个考点，颜色深浅就是记忆强度。', 800)
  await clickText('地图', 1400)
  await caption('虚线是还没学，红环是已经到期，百分比是现在的强度。', 3000)
  await caption('强度会随时间衰减。把时钟往后拨 30 天看看。', 1200)

  const slider = await evaluate(RECT_JS(`document.querySelector('input[type=range]')`))
  if (slider) {
    await moveTo(slider.x, slider.y)
    await sleep(200)
    // 真的拖动不好控，改成把滑块一步一步推过去（视觉上就是手指在拖）
    for (let v = 0; v <= 30; v += 3) {
      await evaluate(`(() => {
        const el = document.querySelector('input[type=range]')
        const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set
        setter.call(el, String(${v}))
        el.dispatchEvent(new Event('input', { bubbles: true }))
        window.__demoMove && window.__demoMove(${slider.x - 75 + Math.round((150 * (v + 30)) / 60)}, ${slider.y})
      })()`)
      await sleep(110)
    }
  }
  await sleep(1400)
  await caption('30 天后：颜色整体变浅，到期的越来越多。', 3000)
  await caption('注意，数据一条都没改——时间旅行只是把所有计算换了个「现在」。', 3600)
  await clickText('回今天', 1400)
  await caption('回到今天。同一份数据，换个目标函数，第一件事就变了。', 2600)

  // 4 冲刺
  await clickText('今天', 1500)
  await clickSel('.mode-line', 1, 1600)
  await caption('切到期末冲刺：它不问「什么时候会忘」，而问「考什么最亏」。', 3200)
  await clickText('冲刺', 1600)
  await caption('它先算离考试还有几天，再把考点按「考频 × 掌握度缺口」排进每一天。', 3600)
  await caption('每天三个桶：必背、易错、保底。', 2600)
  await caption('右边可以模拟一次真实期末卷。', 1000)
  await clickText('开始整卷', 1800)
  await caption('10 题、跨章抽题、限时 15 分钟。', 2600)

  // 每题都选第一个选项：分数不重要，重要的是演示「交卷→错题进错题本→颜色回灌」
  for (let i = 0; i < 10; i++) {
    await clickJS(`document.querySelectorAll('.exam-modal .qitem')[${i}]?.querySelectorAll('.opt')[0]`, 240)
  }
  await sleep(400)
  await clickJS(`[...document.querySelectorAll('.exam-modal button')].find((b) => b.textContent.includes('交卷'))`, 1800)
  await evaluate(`(() => { const el = document.querySelector('.exam-result'); if (el) el.scrollIntoView({ block: 'center' }) })()`)
  await sleep(800)
  await caption('交卷出分，错题直接进错题本，得分回灌到对应考点的颜色。', 5000)
  await clickText('收起', 1000)

  // 5 碎片阅读
  await caption('第三种模式：碎片阅读。手头只有一段讲义也能用。', 1000)
  await clickText('阅读', 1500)
  await clickText('新的一篇', 900)
  await caption('粘一段讲义，或直接上传 txt / md。', 900)
  await clickText('载入示例讲义', 0)
  await waitText('共 3 段', 20000)
  await sleep(1200)
  await caption('它会自动切成 300–500 字的小段，一段刚好一次注意力。', 2800)
  await caption('点一下，让它给这一段自动批注。', 600)
  await clickJS(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('AI 批注这一段'))`, 0)
  await waitText('易考', 45000)
  await sleep(700)
  await caption('旁注只标三件事：容易考的、容易混的、必须记住的术语；每条都要逐字引用原文。', 3800)

  await caption('合上讲一遍，用自己的话复述。', 600)
  await typeInto('textarea.speech', '新文化运动是一九一五年陈独秀办《青年杂志》开始的，提倡民主和科学，反对旧道德旧文学。')
  await sleep(500)
  await clickJS(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('判我讲清楚没'))`, 0)
  await waitText('没讲到', 45000)
  await sleep(600)
  await evaluate(`(() => { const el = document.querySelector('.judge'); if (el) el.scrollIntoView({ block: 'center' }) })()`)
  await sleep(900)
  await caption('判分同时指出漏掉的因果，并追问一句，把理解往下推一层。', 4200)

  // 6 收尾
  await caption('回到今天：三种模式共用同一份数据。', 900)
  await clickText('今天', 1600)
  // 结尾三句是静止画面，screencast 没新帧就不出帧，最后两句会被截掉；
  // 这里用光标轻微游走把画面「顶住」，保证整段结尾都有帧
  const holdWithCursor = async (ms) => {
    const step = 240
    const n = Math.ceil(ms / step)
    for (let i = 0; i < n; i++) {
      const x = 1080 + Math.cos(i / 2.6) * 36
      const y = 760 + Math.sin(i / 2.6) * 22
      await send('Runtime.evaluate', { expression: `window.__demoMove(${x.toFixed(1)}, ${y.toFixed(1)})`, awaitPromise: false }).catch(() => {})
      await sleep(step)
    }
  }

  await caption('长期看遗忘曲线，冲刺看考分缺口，碎片看十分钟能读多少。', 0)
  await holdWithCursor(3400)
  await caption('排程、评分、时间旅行都是纯函数，47 个单元测试守着它们。', 0)
  await holdWithCursor(3400)
  await caption('学习地图：把「记住」变成一件看得见的事。', 0)
  await holdWithCursor(3600)

  fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify(frames))
  fs.writeFileSync(path.join(OUT, 'captions.json'), JSON.stringify(captions, null, 1))
  console.log('frames', frames.length, 'duration', (now() / 1000).toFixed(1) + 's', 'captions', captions.length)
  await sleep(400)
  await send('Page.stopScreencast').catch(() => {})
  chrome.kill()
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  try {
    chrome.kill()
  } catch {}
  process.exit(1)
})
