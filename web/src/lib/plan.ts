/**
 * 小时级排程器 —— 把「今天有哪些点该动」排成一张带时刻的表。
 *
 * 设计约束（DESIGN.md §5）：
 *   1. 贪心 + 滚动，不做运筹优化。可解释 > 最优。
 *   2. 每个 block 必须带 reason，且 reason 必须说人话（不是「AI 认为重要」）。
 *   3. 先塞到期复习（≤40% 时间），再塞新点。
 *   4. 每 45–60 分钟插一次休息，不让一天连成一片。
 *   5. 未完成只顺延，已过去的日子冻结 —— 这条由调用方保证，本函数只管一天。
 *
 * 纯函数：同样的输入永远得到同样的表。方便测试，也方便「时间旅行」时重算。
 */

export type Pace = 'full' | 'sprint' | 'fragment'

export type PlanKind = 'review' | 'learn' | 'quiz' | 'break'

export type PlanBlock = {
  /** 从 00:00 起算的分钟数，480 = 08:00 */
  startMin: number
  endMin: number
  kind: PlanKind
  kpId: string | null
  title: string
  /** 为什么排它。必须能直接显示给用户看 */
  reason: string
}

export type SchedItem = {
  kpId: string
  title: string
  /** 是否学过 */
  learned: boolean
  /** 距离到期还有几天；未学过为 null */
  daysUntilDue: number | null
  /** 当前颜色值 0..1 */
  strength: number
  /** 重要度 1..5 */
  importance: number
  /** 预计用时（分钟） */
  estMinutes: number
  /** 前置知识点 id 列表 */
  prereqs: string[]
}

export type PaceConfig = {
  /** 单块时长（分钟） */
  blockMinutes: number
  /** 到期复习最多占用的时间比例 */
  reviewShare: number
  /** 每多少分钟插一次休息 */
  breakEvery: number
  breakMinutes: number
}

export const PACES: Record<Pace, PaceConfig> = {
  full: { blockMinutes: 45, reviewShare: 0.4, breakEvery: 50, breakMinutes: 10 },
  sprint: { blockMinutes: 30, reviewShare: 0.45, breakEvery: 35, breakMinutes: 5 },
  fragment: { blockMinutes: 10, reviewShare: 0.6, breakEvery: 45, breakMinutes: 5 },
}

export type BuildOpts = {
  pace: Pace
  /** 时间窗，从 00:00 起算的分钟 */
  startMin: number
  endMin: number
  /** 已掌握的点，用来判断前置是否满足 */
  learnedIds?: string[]
  /** 今天最多推进几个新点（防止一天塞爆） */
  maxNew?: number
}

type Scored = { item: SchedItem; score: number; kind: 'review' | 'learn'; reason: string }

const fmt = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

export function fmtRange(b: { startMin: number; endMin: number }): string {
  return `${fmt(b.startMin)}–${fmt(b.endMin)}`
}

/** 复习优先级：逾期越久越急，掌握度越低越急。 */
function reviewScore(it: SchedItem): number {
  const overdueDays = it.daysUntilDue === null ? 0 : Math.max(0, -it.daysUntilDue)
  const urgency = 1 + Math.min(overdueDays, 14) / 7
  const weakness = 1.2 - it.strength
  return urgency * weakness * (0.6 + 0.4 * (it.importance / 5))
}

/** 新点优先级：前置满足了才排，越重要越靠前，越拖越靠前（这里用重要度代替） */
function learnScore(it: SchedItem, learned: Set<string>): number {
  const unmet = it.prereqs.filter((p) => !learned.has(p)).length
  if (unmet > 0) return 0 // 前置没满足，今天不排
  return (it.importance / 5) / Math.max(5, it.estMinutes) * 100
}

export function buildDay(items: SchedItem[], opts: BuildOpts): PlanBlock[] {
  const cfg = PACES[opts.pace]
  const learned = new Set(opts.learnedIds ?? items.filter((i) => i.learned).map((i) => i.kpId))
  const windowMin = Math.max(0, opts.endMin - opts.startMin)
  const reviewCap = Math.floor(windowMin * cfg.reviewShare)

  // ---- 候选池 ----
  const due: Scored[] = items
    .filter((i) => i.learned && i.daysUntilDue !== null && i.daysUntilDue <= 0)
    .map((i) => {
      const overdue = Math.max(0, -(i.daysUntilDue as number))
      const reason =
        overdue >= 1
          ? `逾期 ${Math.round(overdue)} 天 · 现在 ${Math.round(i.strength * 100)}%`
          : `今天到期 · 现在 ${Math.round(i.strength * 100)}%`
      return { item: i, score: reviewScore(i), kind: 'review' as const, reason }
    })

  const fresh: Scored[] = items
    .filter((i) => !i.learned)
    .map((i) => ({
      item: i,
      score: learnScore(i, learned),
      kind: 'learn' as const,
      reason:
        i.prereqs.length === 0
          ? `重要度 ${i.importance}/5 · 没有前置`
          : `前置「${i.prereqs.join('、')}」已掌握`,
    }))
    .filter((x) => x.score > 0)

  const byScore = (a: Scored, b: Scored) => b.score - a.score || a.item.kpId.localeCompare(b.item.kpId)
  due.sort(byScore)
  fresh.sort(byScore)

  // ---- 贪心装箱 ----
  const blocks: PlanBlock[] = []
  let cursor = opts.startMin
  let sinceBreak = 0
  let reviewUsed = 0
  let newCount = 0
  const maxNew = opts.maxNew ?? 99

  const push = (b: PlanBlock) => {
    blocks.push(b)
    cursor = b.endMin
    sinceBreak += b.endMin - b.startMin
    if (sinceBreak >= cfg.breakEvery && cursor + cfg.breakMinutes <= opts.endMin) {
      const brk: PlanBlock = {
        startMin: cursor,
        endMin: cursor + cfg.breakMinutes,
        kind: 'break',
        kpId: null,
        title: '休息',
        reason: '休息一下，站起来走两步',
      }
      blocks.push(brk)
      cursor = brk.endMin
      sinceBreak = 0
    }
  }

  // 1) 到期复习，占 ≤ reviewShare
  for (const c of due) {
    const len = Math.min(c.item.estMinutes, cfg.blockMinutes)
    if (cursor + len > opts.endMin) break
    if (reviewUsed + len > reviewCap && blocks.some((b) => b.kind === 'review')) break
    push({
      startMin: cursor,
      endMin: cursor + len,
      kind: 'review',
      kpId: c.item.kpId,
      title: `复习 ${c.item.title}`,
      reason: c.reason,
    })
    reviewUsed += len
  }

  // 2) 新点
  for (const c of fresh) {
    if (newCount >= maxNew) break
    const len = Math.min(c.item.estMinutes, cfg.blockMinutes)
    if (cursor + len > opts.endMin) break
    push({
      startMin: cursor,
      endMin: cursor + len,
      kind: 'learn',
      kpId: c.item.kpId,
      title: `学习 ${c.item.title}`,
      reason: c.reason,
    })
    newCount += 1
    learned.add(c.item.kpId)
  }

  return blocks
}

/** 一天排完后的统计，给首页那行摘要用 */
export function summarize(blocks: PlanBlock[]): { totalMin: number; reviewMin: number; learnMin: number; breakMin: number } {
  let reviewMin = 0
  let learnMin = 0
  let breakMin = 0
  for (const b of blocks) {
    const len = b.endMin - b.startMin
    if (b.kind === 'review' || b.kind === 'quiz') reviewMin += len
    else if (b.kind === 'learn') learnMin += len
    else breakMin += len
  }
  return { totalMin: reviewMin + learnMin, reviewMin, learnMin, breakMin }
}
