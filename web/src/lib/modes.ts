/**
 * 一份数据，三种排法 —— 三个模式共用的「今天该碰哪几个」。
 *
 * 首页的 hero 和三种排法的对照卡都从这里取，保证「点进去的那条」和
 * 「卡片上写着的那条」永远是同一个，不会各排各的。
 */

import { daysUntilDue, statusOf, strength } from '@/lib/color'
import type { Kp } from '@/lib/mock'
import { buildDay, fmtRange, type Pace, type SchedItem } from '@/lib/plan'
import { buildSprintPlan } from '@/lib/sprint'

export type ModeRow = {
  kpId: string
  title: string
  /** 右侧元信息，如「19:00–19:20 · 复习」「必背 · 20 分钟」 */
  meta: string
  /** 为什么排它，直接显示给用户看 */
  reason: string
}

export const PACE_LABEL: Record<Pace, string> = {
  full: '扎实长期',
  sprint: '期末冲刺',
  fragment: '碎片探索',
}

export const PACE_TARGET: Record<Pace, string> = {
  full: '按遗忘曲线，先救快忘的',
  sprint: '按考分缺口，先补最亏的',
  fragment: '一次十分钟，随便点一个',
}

const WINDOWS: Record<Pace, [number, number]> = {
  full: [19 * 60, 22 * 60],
  sprint: [19 * 60, 21 * 60],
  fragment: [19 * 60, 20 * 60],
}

const MAX_NEW: Record<Pace, number> = { full: 3, sprint: 4, fragment: 2 }

const BUCKET_LABEL: Record<'must' | 'weak' | 'safe', string> = {
  must: '必背',
  weak: '易错',
  safe: '保底',
}

export function schedItems(kps: Kp[], now: number): SchedItem[] {
  return kps.map((k) => ({
    kpId: k.id,
    title: k.title,
    learned: k.state.lastReviewAt !== null,
    daysUntilDue: daysUntilDue(k.state, now),
    strength: strength(k.state, now),
    importance: k.importance,
    estMinutes: k.estMinutes,
    prereqs: k.prereqs,
  }))
}

export function modeRows(
  kps: Kp[],
  now: number,
  pace: Pace,
  examAt: number,
  limit = 3,
): ModeRow[] {
  const leaves = kps.filter((k) => !kps.some((o) => o.parent === k.id))
  const titleOf = new Map(kps.map((k) => [k.id, k.title]))

  if (pace === 'sprint') {
    const plan = buildSprintPlan(kps, now, examAt, { evidence: [] })
    return (plan.days[0]?.items ?? []).slice(0, limit).map((it) => {
      const pct = Math.round(strength(it.kp.state, now) * 100)
      return {
        kpId: it.kp.id,
        title: it.kp.title,
        meta: `${BUCKET_LABEL[it.bucket]} · ${it.minutes} 分钟`,
        reason:
          it.bucket === 'weak'
            ? `上次考砸了，现在只有 ${pct}%，冲刺不补它最亏`
            : `考频 ${it.kp.importance}/5、现在 ${pct}%，按考分缺口排在最前`,
      }
    })
  }

  if (pace === 'fragment') {
    return [...leaves]
      .sort((a, b) => {
        const an = statusOf(a.state, now) === 'new' ? 0 : 1
        const bn = statusOf(b.state, now) === 'new' ? 0 : 1
        if (an !== bn) return an - bn
        if (a.estMinutes !== b.estMinutes) return a.estMinutes - b.estMinutes
        return strength(a.state, now) - strength(b.state, now)
      })
      .slice(0, limit)
      .map((k) => {
        const isNew = statusOf(k.state, now) === 'new'
        return {
          kpId: k.id,
          title: k.title,
          meta: `${Math.min(k.estMinutes, 10)} 分钟 · ${isNew ? '没学过' : '顺手过一遍'}`,
          reason: isNew ? '十分钟能吃完，还没学过，先开个头' : '十分钟能吃完，顺手过一遍不掉色',
        }
      })
  }

  const [startMin, endMin] = WINDOWS.full
  return buildDay(schedItems(kps, now), {
    pace: 'full',
    startMin,
    endMin,
    maxNew: MAX_NEW.full,
  })
    .filter((b) => b.kind !== 'break' && b.kpId !== null)
    .slice(0, limit)
    .map((b) => {
      const kpId = b.kpId as string
      return {
        kpId,
        title: titleOf.get(kpId) ?? b.title,
        meta: `${fmtRange(b)} · ${b.kind === 'review' ? '复习' : b.kind === 'learn' ? '学新' : '做题'}`,
        reason: b.reason,
      }
    })
}
