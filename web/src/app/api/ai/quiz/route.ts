import { NextResponse } from 'next/server'
import { chatJSON } from '@/lib/llm'
import { COURSE_TITLE } from '@/lib/mock'
import { readCache, writeCache } from '@/lib/quizcache'
import { quizPrompt, validateItems } from '@/lib/quizbank'
import { loadOrSeed } from '@/lib/store'

export const maxDuration = 60

export const dynamic = 'force-dynamic'

/**
 * 给一个知识点出 3 道题。
 *   GET /api/ai/quiz?kpId=wusi          先查缓存（演示走这条，秒回）
 *   GET /api/ai/quiz?kpId=wusi&fresh=1  强制重新生成（「再来一组」走这条）
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const kpId = url.searchParams.get('kpId')?.trim()
  const fresh = url.searchParams.get('fresh') === '1'
  if (!kpId) return NextResponse.json({ error: '缺少 kpId' }, { status: 400 })

  const state = await loadOrSeed(Date.now())
  const kp = state.kps.find((k) => k.id === kpId)
  if (!kp) return NextResponse.json({ error: `没有这个知识点：${kpId}` }, { status: 404 })

  if (!fresh) {
    const cached = (await readCache())[kpId]
    if (cached?.length) return NextResponse.json({ items: cached, source: 'cache' })
  }

  try {
    const { system, user } = quizPrompt(kp, COURSE_TITLE.replace('学习地图 · ', ''))
    const raw = await chatJSON<unknown>({ system, user, maxTokens: 1800 })
    const items = validateItems(raw, kp)
    if (items.length === 0) {
      return NextResponse.json({ error: '模型这次出的题不合格（结构不对），再来一次' }, { status: 502 })
    }
    await writeCache(kpId, items)
    return NextResponse.json({ items, source: 'ai' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const cached = (await readCache())[kpId]
    if (cached?.length) return NextResponse.json({ items: cached, source: 'cache', warning: message })
    return NextResponse.json({ error: `出题失败：${message}` }, { status: 502 })
  }
}
