import { NextResponse } from 'next/server'
import { createDoc, listDocs } from '@/lib/docstore'
import { docProgress, SAMPLE_TEXT, SAMPLE_TITLE } from '@/lib/docs'

export const dynamic = 'force-dynamic'

export async function GET() {
  const docs = await listDocs()
  return NextResponse.json({
    docs: docs.map((d) => ({
      id: d.id,
      title: d.title,
      createdAt: d.createdAt,
      progress: docProgress(d),
      segments: d.segments.map((s) => ({
        id: s.id,
        heading: s.heading,
        chars: s.text.length,
        read: s.readAt !== null,
        feynman: s.feynmanScore,
        quiz: s.quizScore,
      })),
    })),
  })
}

export async function POST(req: Request) {
  let body: { title?: string; text?: string; sample?: boolean }
  try {
    body = (await req.json()) as { title?: string; text?: string; sample?: boolean }
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }

  const useSample = body.sample === true
  const text = useSample ? SAMPLE_TEXT : (body.text ?? '').trim()
  if (text.length < 200) {
    return NextResponse.json(
      { error: '太短了：至少粘贴 200 字，否则切不出能讲一遍的段落' },
      { status: 400 },
    )
  }
  if (text.length > 60000) {
    return NextResponse.json({ error: '这一篇太长了（6 万字上限），先拆成两篇' }, { status: 400 })
  }

  const doc = await createDoc(useSample ? SAMPLE_TITLE : (body.title ?? '未命名讲义'), text)
  return NextResponse.json({ doc })
}
