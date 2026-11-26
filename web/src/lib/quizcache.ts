/**
 * 题库缓存（服务端专用）。
 *
 * 为什么要缓存：演示现场不能等模型。断网、429、平台抖动，任何一样都能让「点节点→考我3题」
 * 变成尴尬的转圈。所以先由脚本把 30 个知识点的题全部预生成好存起来，
 * 页面上永远先拿缓存；「再来一组」才走实时生成。
 *
 * 存储走 kv.ts：本地是 `.data/quiz-cache.json`，云端自动换成 Redis。
 */

import { readJSON, writeJSON } from './kv'
import type { QuizItem } from './quizbank'
import seedCache from './seed/quiz-cache.json'

const KEY = 'quiz-cache'

type Cache = Record<string, QuizItem[]>

/**
 * 预生成题库：仓库里带了一份（`src/lib/seed/quiz-cache.json`，114 道），
 * 线上第一次没有远端数据时直接用这份，保证「点考点 → 考我 3 题」永远是秒开。
 */
const SEED = seedCache as Cache

export async function readCache(): Promise<Cache> {
  const parsed = await readJSON<Cache>(KEY)
  if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) return parsed
  return SEED
}

export async function writeCache(kpId: string, items: QuizItem[]): Promise<void> {
  const cache = await readCache()
  cache[kpId] = items
  await writeJSON(KEY, cache)
}
