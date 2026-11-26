import { NextResponse } from 'next/server'
import { setExamAt } from '@/lib/store'

export const dynamic = 'force-dynamic'

const DAY = 24 * 60 * 60 * 1000

/** 用户自己选考试日期：前端传 yyyy-mm-dd，这里落到当天 09:00 的本地时间 */
export async function POST(req: Request) {
  let body: { date?: string }
  try {
    body = (await req.json()) as { date?: string }
  } catch {
    return NextResponse.json({ error: '请求体不是 JSON' }, { status: 400 })
  }

  const raw = body.date?.trim()
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return NextResponse.json({ error: '日期格式要 yyyy-mm-dd' }, { status: 400 })
  }

  const parsed = new Date(`${raw}T09:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return NextResponse.json({ error: '这个日期不存在' }, { status: 400 })
  }

  // 太远的日期没有意义（演示用），限制在半年内
  const now = Date.now()
  const at = parsed.getTime()
  if (at < now - DAY || at > now + 200 * DAY) {
    return NextResponse.json({ error: '考试日期要在未来半年内' }, { status: 400 })
  }

  const state = await setExamAt(at)
  return NextResponse.json({ examAt: state.examAt })
}
