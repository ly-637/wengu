/**
 * 预生成题库 —— 演示前跑一遍，把 30 个知识点的题全部灌进 .data/quiz-cache.json。
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/gen-questions.mjs
 *   node --import ./scripts/ts-resolve.mjs scripts/gen-questions.mjs --only=wusi,jiawu --force
 *
 * 为什么要预生成：现场断网/429 时，页面必须还能出题。缓存命中就是零延迟。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

// 手动读 .env.local：脚本不经过 Next，process.env 里没有这三个值
for (const line of readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const { makeCourse, COURSE_TITLE } = await import('../src/lib/mock.ts')
const { chatJSON } = await import('../src/lib/llm.ts')
const { quizPrompt, validateItems } = await import('../src/lib/quizbank.ts')

const args = process.argv.slice(2)
const onlyArg = args.find((a) => a.startsWith('--only='))
const only = onlyArg ? onlyArg.slice(7).split(',').map((s) => s.trim()) : null
const force = args.includes('--force')

const CACHE = join(root, '.data', 'quiz-cache.json')
mkdirSync(dirname(CACHE), { recursive: true })
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {}

const course = COURSE_TITLE.replace('学习地图 · ', '')
const kps = makeCourse(Date.now()).filter((k) => !only || only.includes(k.id))
const todo = kps.filter((k) => force || !cache[k.id]?.length)

console.log(`共 ${kps.length} 个知识点，需要生成 ${todo.length} 个，已有 ${kps.length - todo.length} 个`)

let done = 0
let failed = 0

async function one(kp) {
  try {
    const { system, user } = quizPrompt(kp, course)
    const raw = await chatJSON({ system, user, maxTokens: 1800 })
    const items = validateItems(raw, kp)
    if (items.length < 3) throw new Error(`只出了 ${items.length} 道合格题`)
    cache[kp.id] = items
    done += 1
    console.log(`✓ ${kp.id} ${kp.title}  ${items.length} 题  [${done}/${todo.length}]`)
  } catch (err) {
    failed += 1
    console.log(`✗ ${kp.id} ${kp.title}  ${err instanceof Error ? err.message : err}`)
  }
  writeFileSync(CACHE, JSON.stringify(cache, null, 2), 'utf8')
}

// 并发 3：再高容易撞限流，再低就慢
const queue = [...todo]
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const kp = queue.shift()
      if (kp) await one(kp)
    }
  }),
)

console.log(`\n完成：成功 ${done}，失败 ${failed}，缓存共 ${Object.keys(cache).length} 个知识点`)
