import { NextResponse } from 'next/server'
import { loadOrSeed } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const state = await loadOrSeed(Date.now())
  return NextResponse.json({
    kps: state.kps,
    attempts: state.attempts,
    seededAt: state.seededAt,
    examAt: state.examAt,
    // 只给最近的证据，够算「上次错了没」，别把两万条全塞给浏览器
    evidence: state.evidence.slice(-400),
  })
}
