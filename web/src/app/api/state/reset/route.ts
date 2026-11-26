import { NextResponse } from 'next/server'
import { reset } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** 一键重置：演示前/演示翻车时点一下，回到「昨晚刚复习过」的初始盘子。 */
export async function POST() {
  const state = await reset(Date.now())
  return NextResponse.json({ ok: true, kps: state.kps, attempts: state.attempts, examAt: state.examAt })
}
