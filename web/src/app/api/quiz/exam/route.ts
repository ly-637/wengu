import { NextResponse } from 'next/server'
import { recordAttempt } from '@/lib/store'
import type { Kp } from '@/lib/mock'

export const dynamic = 'force-dynamic'

type Result = { kpId?: string; score?: number }

/**
 * 交整张卷子：每道题对应一个考点，逐个写 evidence（mode=sprint），
 * 所以交完卷颜色会立刻变、错题也会进错题本。
 */
export async function POST(req: Request) {
  let body: { results?: Result[] }
  try {
    body = (await req.json()) as { results?: Result[] }
  } catch {
    return NextResponse.json({ error: '请求体不是 JSON' }, { status: 400 })
  }

  const results = (body.results ?? []).filter(
    (r): r is { kpId: string; score: number } =>
      typeof r.kpId === 'string' &&
      typeof r.score === 'number' &&
      Number.isFinite(r.score) &&
      r.score >= 0 &&
      r.score <= 1,
  )

  if (results.length === 0) {
    return NextResponse.json({ error: '没有可判分的题目' }, { status: 400 })
  }

  const updated: Kp[] = []
  let sum = 0
  for (const r of results) {
    const out = await recordAttempt({ kpId: r.kpId, score: r.score, mode: 'sprint', note: '模考' })
    if (out) updated.push(out.kp)
    sum += r.score
  }

  const total = Math.round((sum / results.length) * 100)
  return NextResponse.json({ total, updated })
}
