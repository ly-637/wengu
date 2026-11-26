import { NextResponse } from 'next/server'
import { getDoc, patchSegment } from '@/lib/docstore'
import { chatJSON } from '@/lib/llm'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Judgement = {
  score?: number
  missing?: string[]
  followUp?: string
}

const SYSTEM = [
  '你是文科家教，学生刚读完一段讲义，合上书用自己的话讲了一遍，你来判「讲清楚没」。',
  '判断标准只有三条：① 有没有说清本段的核心结论；② 有没有把关键因果讲出来；③ 有没有混淆易混概念。',
  '语气像老师当面点评：先给结论，再点一个具体缺口，最后追问一句。',
  '不要夸「很好」「很棒」这种空话，也不要复述学生的原话。',
].join('\n')

export async function POST(req: Request) {
  let body: { docId?: string; segmentId?: string; answer?: string }
  try {
    body = (await req.json()) as { docId?: string; segmentId?: string; answer?: string }
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }
  const answer = (body.answer ?? '').trim()
  if (answer.length < 20) {
    return NextResponse.json({ error: '至少写 20 个字，一句「就是那个意思」判不出来' }, { status: 400 })
  }

  const doc = body.docId ? await getDoc(body.docId) : null
  const seg = doc?.segments.find((s) => s.id === body.segmentId)
  if (!doc || !seg) return NextResponse.json({ error: '找不到这一段' }, { status: 404 })

  let judged: Judgement
  try {
    judged = await chatJSON<Judgement>({
      system: SYSTEM,
      user: [
        `本段标题：${seg.heading}`,
        '本段原文：',
        seg.text,
        '',
        '学生的复述：',
        answer,
        '',
        '输出 JSON：{"score":0.0-1.0,"missing":["没讲到的要点，最多 3 条"],"followUp":"一句追问，20–40 字"}',
        'score 的刻度：0.9 以上=基本讲全；0.6–0.8=主干对但漏了因果；0.3–0.5=只复述了名词；0.3 以下=讲偏了。',
      ].join('\n'),
      maxTokens: 800,
      timeoutMs: 30000,
    })
  } catch (err) {
    return NextResponse.json(
      { error: `判分失败：${(err as Error).message}`, retryable: true },
      { status: 502 },
    )
  }

  const score = Math.max(0, Math.min(1, Number(judged.score ?? 0)))
  const missing = (Array.isArray(judged.missing) ? judged.missing : [])
    .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
    .slice(0, 3)
  const followUp = (judged.followUp ?? '').trim()

  const next = await patchSegment(doc.id, seg.id, {
    feynmanAt: Date.now(),
    feynmanScore: score,
    readAt: seg.readAt ?? Date.now(),
  })

  return NextResponse.json({ doc: next, score, missing, followUp })
}
