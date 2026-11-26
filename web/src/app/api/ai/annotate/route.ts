import { NextResponse } from 'next/server'
import { getDoc, patchSegment } from '@/lib/docstore'
import { chatJSON } from '@/lib/llm'
import { fallbackAnnotations, type Annotation } from '@/lib/docs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Raw = { annotations?: Array<{ quote?: string; kind?: string; note?: string }> }

const SYSTEM = [
  '你是一位文科应试家教，正在给学生的讲义做旁注。',
  '只做三件事：标出容易考的、容易混的、必须记住的术语。',
  '每条旁注必须引用原文里真实出现的片段（10–24 字，逐字复制，不能改写）。',
  '旁注本身 20–45 字，直接给判断，不要说「建议你」。',
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

  let items: Annotation[] = []
  let warning: string | undefined

  try {
    const raw = await chatJSON<Raw>({
      system: SYSTEM,
      user: [
        `讲义标题：${doc.title}`,
        `本段标题：${seg.heading}`,
        '本段原文：',
        seg.text,
        '',
        '输出 JSON：{"annotations":[{"quote":"原文片段","kind":"exam|confuse|term","note":"旁注"}]}',
        '给 3–5 条。quote 必须能在原文里逐字找到。',
      ].join('\n'),
      maxTokens: 1200,
      timeoutMs: 30000,
    })
    const list = Array.isArray(raw.annotations) ? raw.annotations : []
    items = list
      .filter(
        (a): a is { quote: string; kind: string; note: string } =>
          typeof a?.quote === 'string' &&
          typeof a?.note === 'string' &&
          a.note.trim().length >= 6 &&
          seg.text.includes(a.quote.trim()),
      )
      .slice(0, 5)
      .map((a, i) => ({
        id: `ai${Date.now().toString(36)}${i}`,
        quote: a.quote.trim(),
        kind: a.kind === 'confuse' || a.kind === 'term' ? a.kind : 'exam',
        note: a.note.trim(),
        at: Date.now(),
      }))
    if (items.length === 0) throw new Error('模型给的旁注都对不上原文')
  } catch (err) {
    items = fallbackAnnotations(seg.text)
    warning =
      items.length > 0
        ? `模型这次没给出可用的旁注（${(err as Error).message}），先用内置批注顶上。`
        : `模型没给出可用的旁注：${(err as Error).message}`
  }

  // 保留用户自己划的线，只替换 AI 批注
  const mine = seg.annotations.filter((a) => a.kind === 'mine')
  const next = await patchSegment(doc.id, seg.id, {
    annotations: [...items, ...mine].sort((a, b) => a.at - b.at),
  })

  return NextResponse.json({ doc: next, annotations: items, warning })
}
