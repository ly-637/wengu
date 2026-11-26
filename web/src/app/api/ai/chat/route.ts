import { NextResponse } from 'next/server'
import { DAY_MS, strength } from '@/lib/color'
import { chat, LlmError } from '@/lib/llm'
import { COURSE_TITLE } from '@/lib/mock'
import { loadOrSeed } from '@/lib/store'

export const maxDuration = 60

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Turn = { role: 'tutor' | 'me'; text: string }

const SYSTEM = `你是中国近现代史纲要课的私人助教，学生是文科生，目的是应付考试也要真懂。

回答方式（严格遵守）：
1. 第一句话直接给结论，不要「好的」「让我们」这类开场。
2. 然后 2–4 个要点，每点单独一行，用「· 」开头，每点不超过 40 字。
3. 如果学生说记混了、答错了，先点出他混淆的那一对概念的区别，再给记忆钩子。
4. 最后一行可以给一句追问，帮学生自己复述。
5. 全中文，口语，不用 markdown 标题、不用表格、不用 emoji，总长不超过 220 字。`

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { kpId?: string; turns?: Turn[] }
    const kpId = body.kpId
    const turns = Array.isArray(body.turns) ? body.turns.slice(-8) : []
    if (!kpId) return NextResponse.json({ error: '缺少 kpId' }, { status: 400 })
    if (turns.length === 0) return NextResponse.json({ error: '缺少对话内容' }, { status: 400 })

    const state = await loadOrSeed(Date.now())
    const kp = state.kps.find((k) => k.id === kpId)
    if (!kp) return NextResponse.json({ error: `没有这个知识点：${kpId}` }, { status: 404 })

    const now = Date.now()
    const pct = Math.round(strength(kp.state, now) * 100)
    const days = kp.state.lastReviewAt === null ? null : Math.round((now - kp.state.lastReviewAt) / DAY_MS)

    const context = `当前考点：《${kp.title}》
课程：${COURSE_TITLE}
学生在这个点上的状态：掌握度 ${pct}%，${
      days === null ? '从没测过' : `上次学习 ${days} 天前，稳定度 ${kp.state.stability.toFixed(1)} 天`
    }。
${kp.note ? `课本一句话要点：${clip(kp.note, 200)}` : ''}`

    const transcript = turns
      .map((t) => `${t.role === 'me' ? '学生' : '助教'}：${clip(t.text, 600)}`)
      .join('\n')

    const reply = await chat({
      system: SYSTEM,
      user: `${context}\n\n以下是到目前为止的对话：\n${transcript}\n\n请以助教身份回答学生的最后一句。`,
      maxTokens: 700,
      timeoutMs: 20_000,
    })

    return NextResponse.json({ reply: reply.trim() })
  } catch (err) {
    const status = err instanceof LlmError ? err.status ?? 502 : 500
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status })
  }
}
