/**
 * 证据引擎 —— 唯一能改变状态的地方。
 *
 * 规矩（DESIGN.md §2）：界面只能「记录发生了什么」，不能直接设 mastery。
 * 一次答题、一次复习、一次阅读，都写进 evidence，再由这里的纯函数推出新的 KpState。
 * 好处：时间旅行、撤销、复盘、换参数重算全都免费；坏处：每次都要走一遍这个函数。
 *
 * 公式来自 DESIGN.md，全部是纯函数，有测试兜底：
 *   next.M = M + ALPHA × W(kind) × damp(mode) × (score − M)        score < 0.4 时再 −0.10
 *   next.S = nextStability(S, score)                                首次学习则从初始稳定度起算
 */

import { clamp01, nextStability } from './color'
import type { KpState } from './color'
import type { Pace } from './plan'

export type { Pace }

export type EvidenceKind = 'quiz' | 'review' | 'read' | 'feynman'

export type Evidence = {
  id: string
  kpId: string
  at: number
  kind: EvidenceKind
  /** 0..1，这一次证据说「你有多会」 */
  score: number
  mode?: Pace
  /** 人话备注，详情面板直接显示 */
  note?: string
}

/** 不同证据的可信度：自己出题答对 > 讲给别人听 > 只是复习 > 只是看过 */
export const WEIGHTS: Record<EvidenceKind, number> = {
  quiz: 1.0,
  feynman: 0.8,
  review: 0.6,
  read: 0.3,
}

/** 单次证据能挪动多少掌握度。太大 → 一题定生死；太小 → 演示里看不出变化 */
export const ALPHA = 0.35

/** 考砸的额外惩罚：让「答错」在颜色上比「答对」更显眼 */
export const FAIL_PENALTY = 0.1

/** 从没学过的人，第一次作答后推开多少 */
export const INITIAL_STABILITY = 0.4

/**
 * 模式折价：冲刺/碎片里刷出来的成绩，对「长期掌握」的证据力要打折。
 * 这是堵「三模式互相污染」的那道墙——不折价，冲刺刷十套题会让长期模式以为你永远不会忘。
 */
export function modeDamp(mode: Pace | undefined): number {
  switch (mode) {
    case 'sprint':
      return 0.6
    case 'fragment':
      return 0.4
    default:
      return 1
  }
}

export function isNew(s: KpState): boolean {
  return s.lastReviewAt === null
}

/** 给定当前状态和一条证据，推出新状态。纯函数，不读时钟。 */
export function applyEvidence(state: KpState, e: Evidence): KpState {
  const first = isNew(state)
  const m0 = first ? 0 : state.mastery
  const w = WEIGHTS[e.kind] * modeDamp(e.mode)
  const gain = w * (clamp01(e.score) - m0)
  const penalty = e.score < 0.4 ? FAIL_PENALTY : 0
  const mastery = clamp01(m0 + ALPHA * gain - penalty)

  const stability = first
    ? Math.max(0.5, INITIAL_STABILITY * (0.6 + 1.4 * clamp01(e.score)))
    : nextStability(state.stability, clamp01(e.score), e.score < 0.4 ? 'relearn' : 'review')

  return { mastery, stability, lastReviewAt: e.at }
}

/** 一组题的对错 → 0..1 得分。空数组按 0 算（不该发生，但别让 NaN 漏进公式） */
export function scoreOfAnswers(results: Array<{ correct: boolean }>): number {
  if (results.length === 0) return 0
  return results.filter((r) => r.correct).length / results.length
}

/** 填空题判分：忽略空白与标点，允许答案里关键片段命中 */
export function judgeBlank(input: string, answer: string): boolean {
  const norm = (s: string) => s.replace(/[\s，。、；：""''《》（）,.!?;:'"()]/g, '').toLowerCase()
  const a = norm(input)
  const b = norm(answer)
  if (!a) return false
  if (a === b) return true
  // 多要点答案：按顿号/逗号切开的每段都要出现
  const parts = answer.split(/[、，,；;/]/).map(norm).filter((p) => p.length > 1)
  if (parts.length > 1) return parts.every((p) => a.includes(p))
  return b.length >= 4 && a.includes(b)
}

/** 把一批证据按时间重放，得到某个时刻的状态。时间旅行/复盘用得上。 */
export function replay(start: KpState, evidence: Evidence[], until?: number): KpState {
  return evidence
    .filter((e) => until === undefined || e.at <= until)
    .sort((x, y) => x.at - y.at)
    .reduce(applyEvidence, start)
}
