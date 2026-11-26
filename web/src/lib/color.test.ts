import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DAY_MS,
  bandOf,
  clamp01,
  colorOf,
  daysUntilDue,
  dueAt,
  nextStability,
  retrievability,
  statusOf,
  strength,
  type KpState,
} from './color.ts'

const T0 = Date.UTC(2026, 10, 21, 0, 0, 0) // 2026-11-21
const learned = (mastery: number, stability: number, daysAgo = 0): KpState => ({
  mastery,
  stability,
  lastReviewAt: T0 - daysAgo * DAY_MS,
})

test('从未学过 → 颜色为 0（纯灰）', () => {
  const s: KpState = { mastery: 0, stability: 1, lastReviewAt: null }
  assert.equal(strength(s, T0), 0)
  assert.equal(retrievability(s, T0), 0)
  assert.equal(dueAt(s), null)
  assert.equal(statusOf(s, T0), 'new')
})

test('S 的定义自洽：R(day=S) === 0.9', () => {
  const s = learned(0.8, 5, 5) // 5 天前学过，稳定度 5 天
  assert.ok(Math.abs(retrievability(s, T0) - 0.9) < 1e-9, `得到 ${retrievability(s, T0)}`)
})

test('遗忘是先慢后快：第 7 天仍 ~0.80，第 30 天 ~0.55（S=3）', () => {
  const s = learned(0.9, 3, 7)
  const d7 = retrievability(s, T0)
  const s30 = learned(0.9, 3, 30)
  const d30 = retrievability(s30, T0)
  assert.ok(d7 > 0.78 && d7 < 0.82, `7 天 ${d7}`)
  assert.ok(d30 > 0.53 && d30 < 0.57, `30 天 ${d30}`)
  assert.ok(d7 > d30)
})

test('颜色不会超过掌握度（没有偏置把颜色抬上去）', () => {
  for (const m of [0.15, 0.4, 0.7, 1]) {
    for (const d of [0, 1, 5, 30, 365]) {
      const v = strength(learned(m, 3, d), T0)
      assert.ok(v <= m + 1e-12, `m=${m} d=${d} -> ${v}`)
    }
  }
})

test('时间越久颜色越淡，且始终 >= 0', () => {
  let prev = 2
  for (const d of [0, 1, 3, 7, 30, 90, 365]) {
    const v = strength(learned(0.9, 4, d), T0)
    assert.ok(v < prev, `第 ${d} 天没有变淡：${v} vs ${prev}`)
    assert.ok(v >= 0)
    prev = v
  }
})

test('考砸立刻变浅：mastery 掉，颜色同步掉', () => {
  const before = strength(learned(0.9, 10, 1), T0)
  const after = strength(learned(0.5, 3, 1), T0)
  assert.ok(after < before, `${after} 应小于 ${before}`)
})

test('dueAt 反解出的那一天 R 恰好等于目标保留率', () => {
  const s = learned(0.8, 6, 0)
  for (const t of [0.8, 0.85, 0.9, 0.92]) {
    const due = dueAt(s, t)!
    const r = retrievability({ ...s, lastReviewAt: s.lastReviewAt }, due)
    assert.ok(Math.abs(r - t) < 1e-6, `t=${t} 得到 ${r}`)
  }
})

test('默认保留率 0.9 时，到期日就是 lastReviewAt + S 天', () => {
  const s = learned(0.8, 5, 0)
  assert.ok(Math.abs(dueAt(s)! - (T0 + 5 * DAY_MS)) < 1e-6)
})

test('daysUntilDue / statusOf', () => {
  const fresh = learned(0.8, 5, 1)
  assert.ok((daysUntilDue(fresh, T0) as number) > 3)
  assert.equal(statusOf(fresh, T0), 'ok')

  const overdue = learned(0.8, 3, 10)
  assert.ok((daysUntilDue(overdue, T0) as number) < 0)
  assert.equal(statusOf(overdue, T0), 'due')
})

test('复习拉长间隔，考砸缩短间隔', () => {
  const good = nextStability(5, 0.9)
  const bad = nextStability(5, 0.2)
  assert.ok(good > 5, `好成绩应拉长：${good}`)
  assert.ok(bad < 5, `坏成绩应缩短：${bad}`)
  assert.ok(nextStability(5, 0.9, 'relearn') < good)
})

test('clamp01 / bandOf / colorOf', () => {
  assert.equal(clamp01(-1), 0)
  assert.equal(clamp01(2), 1)
  assert.equal(bandOf(0), '未学')
  assert.equal(bandOf(1), '很熟')
  assert.match(colorOf(0.5), /color-mix\(in oklab, var\(--kp-void\), var\(--kp-full\) 50%\)/)
})
