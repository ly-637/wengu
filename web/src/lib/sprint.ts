/**
 * 期末冲刺的纯计算（可在 node 里单测，不碰 DOM、不碰文件）。
 *
 * 和「扎实长期」的区别只有一句话：
 *   长期模式排的是「什么时候会忘」，冲刺排的是「考试会考什么、哪条最亏」。
 * 所以这里的核心是 examGap(kp) —— 考频权重 × 分值占比 × 掌握度缺口，
 * 而不是遗忘曲线。
 */

import { daysUntilDue, strength } from './color'
import type { Kp } from './mock'
import type { Evidence } from './engine'

export const DAY_MS = 24 * 60 * 60 * 1000

/** 默认每天能投进冲刺的时间（分钟）。演示里可以在页面上改。 */
export const DEFAULT_DAILY_MINUTES = 90

export type Bucket = 'must' | 'weak' | 'safe'

export type SprintItem = {
  kp: Kp
  bucket: Bucket
  /** 排序分，越大越靠前 */
  gap: number
  minutes: number
  reason: string
}

export type SprintDay = {
  /** 距今天几天（0 = 今天） */
  offset: number
  at: number
  items: SprintItem[]
  minutes: number
}

export type SprintPlan = {
  daysLeft: number
  days: SprintDay[]
  coverage: { learned: number; total: number }
  /** 0..100，按考频加权后的掌握度 */
  projected: number
  /** 还要多少分钟才能把「必背 + 易错」清一遍 */
  debtMinutes: number
}

/** 距考试还有几天（不足一天算 1，考完了算 0） */
export function daysLeft(examAt: number, now: number): number {
  return Math.max(0, Math.ceil((examAt - now) / DAY_MS))
}

/** 只看叶子：编和章是容器，不参与计分 */
export function leavesOf(kps: Kp[]): Kp[] {
  return kps.filter((k) => !kps.some((o) => o.parent === k.id))
}

/** 每个考点最近一次答题得分（用于「易错」桶） */
export function lastScores(evidence: Evidence[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const e of evidence) map.set(e.kpId, e.score)
  return map
}

/**
 * 冲刺优先级：考频(1..5) × 权重(占比，用 importance 归一) × 掌握度缺口。
 * 最近答错的再乘一个 1.35 的加重，避免「明明错着却排在后面」。
 */
export function examGap(kp: Kp, now: number, last?: number): number {
  const gap = 1 - strength(kp.state, now)
  const weight = kp.importance / 5
  const wrongPenalty = last !== undefined && last < 0.6 ? 1.35 : 1
  return weight * gap * wrongPenalty
}

/** 按考频加权算「现在大概能拿多少分」 */
export function projectedScore(kps: Kp[], now: number): number {
  const leaves = leavesOf(kps)
  if (leaves.length === 0) return 0
  let weighted = 0
  let total = 0
  for (const kp of leaves) {
    weighted += strength(kp.state, now) * kp.importance
    total += kp.importance
  }
  return total === 0 ? 0 : Math.round((weighted / total) * 100)
}

function bucketOf(kp: Kp, now: number, last?: number): Bucket {
  const s = strength(kp.state, now)
  if (last !== undefined && last < 0.6) return 'weak'
  if (kp.importance >= 4 && s < 0.65) return 'must'
  return 'safe'
}

function reasonOf(bucket: Bucket, kp: Kp, now: number, last?: number): string {
  const pct = Math.round(strength(kp.state, now) * 100)
  if (bucket === 'weak') return `上次只拿到 ${Math.round((last ?? 0) * 100)} 分，考到这个点最亏`
  if (bucket === 'must') return `高频考点（${kp.importance}/5），现在只有 ${pct}%，必背`
  return `已经 ${pct}%，最后快速过一遍，保住分`
}

/**
 * 把「从现在到考试」切成若干天，按优先级把考点铺进去。
 * 不模拟遗忘（演示场景够用），只保证：越靠前的天，装越亏的点。
 */
export function buildSprintPlan(
  kps: Kp[],
  now: number,
  examAt: number,
  opts: { dailyMinutes?: number; evidence?: Evidence[] } = {},
): SprintPlan {
  const dailyMinutes = opts.dailyMinutes ?? DEFAULT_DAILY_MINUTES
  const left = Math.max(1, daysLeft(examAt, now))
  const recent = lastScores(opts.evidence ?? [])
  const leaves = leavesOf(kps)

  const ranked: SprintItem[] = leaves
    .map((kp) => {
      const last = recent.get(kp.id)
      const bucket = bucketOf(kp, now, last)
      return {
        kp,
        bucket,
        gap: examGap(kp, now, last),
        minutes: Math.max(8, Math.min(kp.estMinutes, 20)),
        reason: reasonOf(bucket, kp, now, last),
      }
    })
    .sort((a, b) => b.gap - a.gap)

  const days: SprintDay[] = []
  // 按比例切，而不是固定条数：这样 28 条铺 12 天不会出现「最后三天全空」，
  // 也不会出现前三天塞满、后面没东西。日容量只用来给单条估时兜底。
  const cap = Math.max(1, Math.floor(dailyMinutes / 10))
  let taken = 0
  for (let offset = 0; offset < left; offset += 1) {
    const upTo = offset === left - 1 ? ranked.length : Math.ceil(((offset + 1) * ranked.length) / left)
    let slice = ranked.slice(taken, Math.max(upTo, taken))
    if (slice.length > cap) slice = slice.slice(0, cap)
    taken += slice.length
    const minutes = slice.reduce((sum, it) => sum + it.minutes, 0)
    days.push({ offset, at: now + offset * DAY_MS, items: slice, minutes })
  }

  // 因为日容量截断而没排上的，全部压到考前一天（临考只堆最亏的）
  if (taken < ranked.length) {
    const tail = ranked.slice(taken)
    const lastDay = days[days.length - 1]
    lastDay.items = [...lastDay.items, ...tail]
    lastDay.minutes += tail.reduce((sum, it) => sum + it.minutes, 0)
  }

  const learned = leaves.filter((k) => k.state.lastReviewAt !== null).length
  const debtMinutes = ranked
    .filter((it) => it.bucket !== 'safe')
    .reduce((sum, it) => sum + it.minutes, 0)

  return {
    daysLeft: left,
    days,
    coverage: { learned, total: leaves.length },
    projected: projectedScore(kps, now),
    debtMinutes,
  }
}

/** 某一天三个桶各多少条，用于路线格子上的小字 */
export function bucketCounts(day: SprintDay): Record<Bucket, number> {
  const out: Record<Bucket, number> = { must: 0, weak: 0, safe: 0 }
  for (const it of day.items) out[it.bucket] += 1
  return out
}

/**
 * 抽一份模考卷：按考频加权、跨章分散。
 * 返回被选中的考点（题从缓存里取，保证现场零等待）。
 */
export function pickPaperKps(kps: Kp[], count: number, seed = 7): Kp[] {
  const leaves = leavesOf(kps)
  const byChapter = new Map<string, Kp[]>()
  for (const kp of leaves) {
    const key = kp.parent ?? 'root'
    const list = byChapter.get(key) ?? []
    list.push(kp)
    byChapter.set(key, list)
  }

  // 每个章先按考频+缺口排，再按轮转取，保证卷子覆盖各章
  const queues = [...byChapter.values()].map((list) =>
    [...list].sort((a, b) => b.importance - a.importance),
  )

  const picked: Kp[] = []
  let round = 0
  let rnd = seed
  while (picked.length < count && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      if (picked.length >= count) break
      if (q.length === 0) continue
      // 简单的伪随机：同一章内部也稍微打散，避免每次都是同一条
      rnd = (rnd * 1103515245 + 12345) % 2147483648
      const idx = Math.min(q.length - 1, Math.floor((rnd / 2147483648) * Math.min(q.length, 2)))
      const [kp] = q.splice(idx, 1)
      picked.push(kp)
    }
    round += 1
    if (round > 50) break
  }
  return picked.slice(0, count)
}

/** 临考提示：给冲刺页顶部一句话 */
export function sprintHeadline(plan: SprintPlan): string {
  if (plan.daysLeft <= 0) return '已经考完了，回看这一轮数据吧'
  if (plan.daysLeft === 1) return '明天就考，今天只做错题和高频必背'
  if (plan.daysLeft <= 3) return `还剩 ${plan.daysLeft} 天，别开新点，只补最亏的`
  if (plan.daysLeft <= 7) return `还剩 ${plan.daysLeft} 天，该背的还差 ${plan.debtMinutes} 分钟`
  return `还有 ${plan.daysLeft} 天，先把高频考点的缺口填上`
}

/** 未来几天里最该动手的一条（首页也用它） */
export function firstSprintItem(plan: SprintPlan): SprintItem | null {
  for (const day of plan.days) {
    const hit = day.items.find((it) => it.bucket !== 'safe') ?? day.items[0]
    if (hit) return hit
  }
  return null
}

/** 到期但还没被冲刺排进去的点 —— 用来解释「为什么先背而不是先复习」 */
export function overdueCount(kps: Kp[], now: number): number {
  return leavesOf(kps).filter((k) => {
    const d = daysUntilDue(k.state, now)
    return d !== null && d <= 0
  }).length
}
