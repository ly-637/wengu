/**
 * 落盘 —— 一个 JSON 文件当数据库（服务端专用）。
 *
 * 为什么不用 SQLite：better-sqlite3 是原生模块，Windows + Node 24 装它要编译工具链，
 * 换台电脑演示就是一次赌博。演示场景里数据量是 30 个知识点、几百条证据，JSON 足够。
 * 接口留成 load/save/reset 三个函数，将来换 Drizzle 只改这一个文件。
 *
 * 写入用「临时文件 + rename」，避免演示中途断电留下半个文件。
 */

import { readJSON, writeJSON } from './kv'
import type { Evidence } from './engine'
import { applyEvidence } from './engine'
import type { Attempt, Kp } from './mock'
import { makeAttempts, makeCourse } from './mock'

export type CourseState = {
  version: 1
  seededAt: number
  /** 期末考试时间（用户自己选），冲刺板块的倒计时基准 */
  examAt: number
  kps: Kp[]
  attempts: Attempt[]
  evidence: Evidence[]
}

const KEY = 'state'

const DAY = 24 * 60 * 60 * 1000

export function seed(now: number): CourseState {
  return {
    version: 1,
    seededAt: now,
    examAt: now + 12 * DAY,
    kps: makeCourse(now),
    attempts: makeAttempts(now),
    evidence: [],
  }
}

export async function loadOrSeed(now: number): Promise<CourseState> {
  const parsed = await readJSON<CourseState>(KEY)
  if (parsed && parsed.version === 1 && Array.isArray(parsed.kps)) {
    // 老数据没有 examAt：补一个默认值（两周后），别让冲刺页炸掉
    if (typeof parsed.examAt !== 'number') parsed.examAt = now + 12 * DAY
    return parsed
  }
  const fresh = seed(now)
  await save(fresh)
  return fresh
}

export async function save(state: CourseState): Promise<void> {
  await writeJSON(KEY, state)
}

export async function reset(now: number): Promise<CourseState> {
  const fresh = seed(now)
  await save(fresh)
  return fresh
}

/**
 * 记一次答题：写 evidence → 重算该知识点 → 追加成绩记录 → 落盘。
 * 返回更新后的那一整个知识点，前端拿到就能立刻重绘颜色。
 */export async function recordAttempt(input: {
  kpId: string
  score: number
  mode: 'full' | 'sprint' | 'fragment'
  note?: string
  at?: number
}): Promise<{ state: CourseState; kp: Kp; attempt: Attempt } | null> {
  const now = input.at ?? Date.now()
  const state = await loadOrSeed(now)
  const kp = state.kps.find((k) => k.id === input.kpId)
  if (!kp) return null

  const evidence: Evidence = {
    id: `e${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    kpId: kp.id,
    at: now,
    kind: 'quiz',
    score: Math.max(0, Math.min(1, input.score)),
    mode: input.mode,
    note: input.note,
  }

  const nextState = applyEvidence(kp.state, evidence)
  const updated: Kp = { ...kp, state: nextState }
  const attempt: Attempt = {
    id: `at${now.toString(36)}`,
    at: now,
    score: evidence.score,
    kpTitle: kp.title,
    kind: 'quiz',
  }

  const next: CourseState = {
    ...state,
    kps: state.kps.map((k) => (k.id === kp.id ? updated : k)),
    evidence: [...state.evidence, evidence].slice(-2000),
    attempts: [...state.attempts, attempt].slice(-500),
  }
  await save(next)
  return { state: next, kp: updated, attempt }
}

/** 用户自己改考试日期：只动 examAt，其他原样落盘 */
export async function setExamAt(at: number): Promise<CourseState> {
  const state = await loadOrSeed(Date.now())
  const next: CourseState = { ...state, examAt: at }
  await save(next)
  return next
}
