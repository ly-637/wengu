import { NextResponse } from 'next/server'
import { readCache } from '@/lib/quizcache'
import { pickPaperKps } from '@/lib/sprint'
import { loadOrSeed } from '@/lib/store'
import type { QuizItem } from '@/lib/quizbank'

export const maxDuration = 60

export const dynamic = 'force-dynamic'

/**
 * 抽一份模考卷：按考频加权、跨章分散，题一律来自预生成缓存。
 * 现场的硬要求是「点了立刻有卷子」——所以这里绝不调模型。
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const count = Math.max(5, Math.min(20, Number(url.searchParams.get('count') ?? 10)))

  const state = await loadOrSeed(Date.now())
  const cache = await readCache()
  const picked = pickPaperKps(state.kps, count)

  const items: QuizItem[] = []
  const missing: string[] = []

  for (const kp of picked) {
    const list = cache[kp.id]
    if (!list || list.length === 0) {
      missing.push(kp.title)
      continue
    }
    // 每次从缓存里轮着取一道，避免同一份卷子永远是同一题
    const seed = Date.now() % list.length
    items.push({ ...list[seed], id: `${kp.id}-exam` })
  }

  if (items.length === 0) {
    return NextResponse.json({ error: '题库缓存是空的，先跑 npm run gen:quiz' }, { status: 503 })
  }

  return NextResponse.json({
    items,
    minutes: Math.round(items.length * 1.5),
    missing,
  })
}
