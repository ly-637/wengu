/**
 * AI 自检脚本 —— 演示前先在命令行跑一遍，确认 key / 模型 / JSON 模式都通。
 *
 *   node scripts/ai-probe.mjs
 *
 * 它做三件事：
 *   1. 普通对话：延迟 + 首句输出
 *   2. json_object 模式：确认模型支持结构化输出（出题靠它）
 *   3. 故意用错模型名：确认错误信息是给人看的，而不是一坨 HTML
 * 任何一步失败都直接打印原始错误，不做包装——现场排障靠的是原文。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = join(here, '..', '.env.local')

function loadEnv(path) {
  const out = {}
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    console.error(`读不到 ${path}，先把 AI_BASE_URL / AI_MODEL / AI_API_KEY 填进去`)
    process.exit(1)
  }
  return out
}

const env = loadEnv(envPath)
const BASE = (env.AI_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')
const MODEL = env.AI_MODEL || 'deepseek-flash'
const KEY = env.AI_API_KEY

if (!KEY) {
  console.error('.env.local 里没有 AI_API_KEY')
  process.exit(1)
}

async function call(body, label) {
  const t0 = performance.now()
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  const ms = Math.round(performance.now() - t0)
  const text = await res.text()
  if (!res.ok) {
    console.log(`${label}: HTTP ${res.status} (${ms}ms)`)
    console.log(`  ${text.slice(0, 400)}`)
    return null
  }
  let json
  try {
    json = JSON.parse(text)
  } catch {
    console.log(`${label}: 返回的不是 JSON (${ms}ms)`)
    console.log(`  ${text.slice(0, 200)}`)
    return null
  }
  console.log(`${label}: OK ${res.status} (${ms}ms)  in=${json.usage?.prompt_tokens} out=${json.usage?.completion_tokens}`)
  return json
}

console.log(`base=${BASE}  model=${MODEL}  key=${KEY.slice(0, 6)}…${KEY.slice(-4)}`)

// 1. 普通对话
const chat = await call(
  {
    model: MODEL,
    messages: [{ role: 'user', content: '用一句话说明《南京条约》的历史影响，不超过40字。' }],
    max_tokens: 120,
  },
  '① 对话',
)
if (chat) console.log(`  → ${chat.choices?.[0]?.message?.content?.trim().replace(/\s+/g, ' ').slice(0, 120)}`)

// 2. JSON 模式（出题用）
const js = await call(
  {
    model: MODEL,
    messages: [
      { role: 'system', content: '你是出题助手，只输出 JSON。' },
      {
        role: 'user',
        content:
          '为「鸦片战争与《南京条约》」出一题单选，JSON 形如 {"stem":"题干","options":["A","B","C","D"],"answer":"A","explain":"解析"}',
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 400,
  },
  '② JSON 模式',
)
if (js) {
  const raw = js.choices?.[0]?.message?.content ?? ''
  try {
    const obj = JSON.parse(raw)
    console.log(`  → 解析成功，字段：${Object.keys(obj).join(', ')}`)
  } catch {
    console.log(`  → 不是合法 JSON：${raw.slice(0, 160)}`)
  }
}

// 3. 错误消息可读性
await call({ model: 'definitely-not-a-model', messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }, '③ 错误信息')
