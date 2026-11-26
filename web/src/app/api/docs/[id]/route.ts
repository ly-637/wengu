import { NextResponse } from 'next/server'
import { getDoc, patchSegment, removeDoc } from '@/lib/docstore'
import type { SegmentPatch } from '@/lib/docstore'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const doc = await getDoc(id)
  if (!doc) return NextResponse.json({ error: '这篇读本不存在（可能被删了）' }, { status: 404 })
  return NextResponse.json({ doc })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  let body: { segmentId?: string; patch?: SegmentPatch }
  try {
    body = (await req.json()) as { segmentId?: string; patch?: SegmentPatch }
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }
  if (!body.segmentId || !body.patch) {
    return NextResponse.json({ error: '缺少 segmentId 或 patch' }, { status: 400 })
  }
  const doc = await patchSegment(id, body.segmentId, body.patch)
  if (!doc) return NextResponse.json({ error: '找不到这一篇或这一段' }, { status: 404 })
  return NextResponse.json({ doc })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  await removeDoc(id)
  return NextResponse.json({ ok: true })
}
