/**
 * 颜色内核 —— 一个知识点在某个时刻「掌握到什么程度」。
 *
 * 设计约束（DESIGN.md §1，决策 m00182）：
 *   颜色只表达一件事 = 当前掌握程度 = mastery × R。
 *   不允许有任何偏置系数、不允许有防灰地板。
 *   如果颜色加了系数，它就既不是掌握度也不是别的什么，用户无法解释、无法校准。
 *
 * 两个分量各自负责什么：
 *   mastery    学得多扎实 —— 只有「证据」能改变它（做题得分、讲一遍、复习）
 *   R          现在还记得多少 —— 只随时间下降，复习一次回到 1
 *
 * 所以：
 *   学得浅但刚复习过 (0.3 × 1.00) = 0.30
 *   学得深但快忘了   (0.9 × 0.33) = 0.30
 * 两者颜色一样，这是**正确**的：此刻能用出来的确实一样多。
 * 区别靠点开面板把两个分量摊开（见 NodeDetail）。
 */

export type KpState = {
  /** 掌握度 0..1，学得多扎实 */
  mastery: number
  /** 稳定度（天）：R 衰减到 0.9 所需的间隔。复习后增大，考砸后减小 */
  stability: number
  /** 上次学习/复习时间戳；null = 从未学过 */
  lastReviewAt: number | null
}

export const DAY_MS = 86_400_000

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/** FSRS 封闭式遗忘曲线。S 的定义是「R 恰好等于 0.9 的那一天」，所以 R(S) === 0.9。 */
export function retrievability(s: KpState, now: number): number {
  if (s.lastReviewAt === null) return 0
  const days = Math.max(0, (now - s.lastReviewAt) / DAY_MS)
  const stability = Math.max(s.stability, 0.1) // 防除零
  return Math.pow(1 + (19 / 81) * (days / stability), -0.5)
}

/** 颜色值 0..1。从未学过 → 0（纯灰）。考砸 → mastery 掉，颜色立刻掉。 */
export function strength(s: KpState, now: number): number {
  if (s.lastReviewAt === null) return 0
  return clamp01(s.mastery * retrievability(s, now))
}

/**
 * 到期日：可回忆性降到 desiredRetention 的那一天。
 * 反解 R(d) = t  =>  d = S × (81/19) × (1/t² − 1)
 * t = 0.9 时系数恰为 1，即 dueAt = lastReviewAt + S 天。
 */
export function dueAt(s: KpState, desiredRetention = 0.9): number | null {
  if (s.lastReviewAt === null) return null
  const t = Math.min(0.99, Math.max(0.5, desiredRetention))
  const days = Math.max(s.stability, 0.1) * (81 / 19) * (1 / (t * t) - 1)
  return s.lastReviewAt + days * DAY_MS
}

/** 距离到期还有几天（负数 = 已逾期几天）。没学过返回 null。 */
export function daysUntilDue(s: KpState, now: number, desiredRetention = 0.9): number | null {
  const due = dueAt(s, desiredRetention)
  if (due === null) return null
  return (due - now) / DAY_MS
}

export type KpStatus = 'new' | 'due' | 'ok'

export function statusOf(s: KpState, now: number, desiredRetention = 0.9): KpStatus {
  if (s.lastReviewAt === null) return 'new'
  const d = daysUntilDue(s, now, desiredRetention)
  return d !== null && d <= 0 ? 'due' : 'ok'
}

/** 下一次复习该隔多久（天）。答对/讲清楚 → 间隔变长；答错 → 变短。这是 FSRS 的核心收益。 */
export function nextStability(current: number, score: number, phase: 'review' | 'relearn' = 'review'): number {
  const s = Math.max(current, 0.1)
  if (score < 0.4) {
    // 忘了/答错：回到接近初始稳定度，但保留一点历史
    return Math.max(0.5, s * 0.35)
  }
  // 记住：间隔按得分放大，phase=relearn 时涨幅小一些
  const gain = 1.4 + 2.6 * clamp01(score)
  return s * (phase === 'relearn' ? gain * 0.7 : gain)
}

/** 0..1 → CSS 颜色。OKLab 里在灰和绿之间插值，暗色模式自动跟随。 */
export function colorOf(v: number): string {
  const pct = Math.round(clamp01(v) * 100)
  return `color-mix(in oklab, var(--kp-void), var(--kp-full) ${pct}%)`
}

/** 给人看的档位名，用于图例和悬浮提示 */
export function bandOf(v: number): string {
  if (v <= 0.001) return '未学'
  if (v < 0.25) return '几乎忘了'
  if (v < 0.45) return '浅'
  if (v < 0.7) return '中等'
  if (v < 0.88) return '熟'
  return '很熟'
}
