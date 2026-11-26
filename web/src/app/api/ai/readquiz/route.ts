import { NextResponse } from 'next/server'
import { getDoc } from '@/lib/docstore'
import { chatJSON } from '@/lib/llm'
import { fallbackQuiz, type ReadQuestion } from '@/lib/docs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Raw = {
  items?: Array<{ type?: string; stem?: string; options?: unknown; answer?: string; explain?: string }>
}

const SYSTEM = [
  '你是文科出题老师，只根据给定的一段讲义出 2 道单选题。',
  '要求：① 只考这一段里出现过的内容，不许引入外部知识；② 四个选项字数接近、干扰项是学生真会混的说法；',
  '③ 答案只能是一个大写字母 A–D；④ 解析 30–60 字，指出为什么对、为什么错。',
].join('\n')

export async function POST(req: Request) {
  let body: { docId?: string; segmentId?: string }
  try {
    body = (await req.json()) as { docId?: string; segmentId?: string }
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }
  const doc = body.docId ? await getDoc(body.docId) : null
  const seg = doc?.segments.find((s) => s.id === body.segmentId)
  if (!doc || !seg) return NextResponse.json({ error: '找不到这一段' }, { status: 404 })

  let items: ReadQuestion[] = []
  let warning: string | undefined

  try {
    const raw = await chatJSON<Raw>({
      system: SYSTEM,
      user: [
        `本段标题：${seg.heading}`,
        '本段原文：',
        seg.text,
        '',
        '输出 JSON：{"items":[{"type":"single","stem":"题干","options":["A 的内容","B 的内容","C 的内容","D 的内容"],"answer":"B","explain":"解析"}]}',
        '正好 2 道，options 不要带 A/B/C/D 前缀。',
      ].join('\n'),
      maxTokens: 1400,
      timeoutMs: 30000,
    })
    const list = Array.isArray(raw.items) ? raw.items : []
    items = list
      .filter(
        (it): it is { stem: string; options: string[]; answer: string; explain?: string } =>
          typeof it?.stem === 'string' &&
          it.stem.trim().length >= 6 &&
          Array.isArray(it?.options) &&
          it.options.length === 4 &&
          it.options.every((o) => typeof o === 'string' && o.trim().length > 0) &&
          typeof it?.answer === 'string' &&
          /^[A-D]$/.test(it.answer.trim().toUpperCase()),
      )
      .slice(0, 2)
      .map((it) => ({
        type: 'single' as const,
        stem: it.stem.trim(),
        options: it.options.map((o: string) => o.trim()),
        answer: it.answer.trim().toUpperCase(),
        explain: (it.explain ?? '').trim(),
      }))
    if (items.length === 0) throw new Error('模型给的题结构不对')
  } catch (err) {
    items = fallbackQuiz(seg.text)
    warning =
      items.length > 0
        ? `实时出题失败（${(err as Error).message}），先用这一段的预置题顶上。`
        : `实时出题失败：${(err as Error).message}`
  }

  if (items.length === 0) {
    return NextResponse.json({ error: warning ?? '这次没出成题，再点一次' }, { status: 502 })
  }
  return NextResponse.json({ items, warning })
}
