# 把本地 `.data/quiz-cache.json` 里的题库推到 Upstash Redis。
#
# 用法：
#   cd web
#   $env:UPSTASH_REDIS_REST_URL="https://xxx.upstash.io"
#   $env:UPSTASH_REDIS_REST_TOKEN="xxx"
#   node scripts/seed-redis.mjs
#
# 作用：线上第一次点「考我 3 题」就不会去调模型，直接从 Redis 拿现成题（演示秒开）。

import fs from 'node:fs'
import path from 'node:path'

const base = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

if (!base || !token) {
  console.error('缺少 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN')
  process.exit(1)
}

const file = path.join(process.cwd(), '.data', 'quiz-cache.json')
if (!fs.existsSync(file)) {
  console.error('本地没有 .data/quiz-cache.json，先在本地跑 npm run gen:quiz')
  process.exit(1)
}

const cache = JSON.parse(fs.readFileSync(file, 'utf8'))
const count = Object.keys(cache).length
const items = Object.values(cache).reduce((n, list) => n + (list?.length ?? 0), 0)

const res = await fetch(`${base}/set/quiz-cache`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain' },
  body: JSON.stringify(cache),
})

if (!res.ok) {
  console.error('写入失败', res.status, await res.text())
  process.exit(1)
}

const back = await fetch(`${base}/get/quiz-cache`, {
  headers: { authorization: `Bearer ${token}` },
}).then((r) => r.json())

const okSize = typeof back.result === 'string' ? back.result.length : 0
console.log(`ok  ${count} 个知识点 / ${items} 道题 → Redis（读回 ${okSize} 字节）`)
