import { NextResponse } from 'next/server'
import { recordAttempt } from '@/lib/store'
import type { Pace } from '@/lib/engine'

export const dynamic = 'force-dynamic'

type Body = {
  kpId?: string
  score?: number
  mode?: Pace
  note?: string
}

/** 交卷：把得分写进证据，重算该知识点，返回新的颜色依据。 */
export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: '请求体不是 JSON' }, { status: 400 })
  }

  const kpId = body.kpId?.trim()
  if (!kpId) return NextResponse.json({ error: '缺少 kpId' }, { status: 400 })

  const score = typeof body.score === 'number' ? body.score : NaN
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    return NextResponse.json({ error: 'score 必须是 0..1' }, { status: 400 })
  }

  const mode: Pace = body.mode === 'sprint' || body.mode === 'fragment' ? body.mode : 'full'
  const result = await recordAttempt({ kpId, score, mode, note: body.note })
  if (!result) return NextResponse.json({ error: `没有这个知识点：${kpId}` }, { status: 404 })

  return NextResponse.json({
    kp: result.kp,
    attempt: result.attempt,
    attempts: result.state.attempts,
  })
}
