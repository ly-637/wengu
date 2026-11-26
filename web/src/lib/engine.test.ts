import assert from 'node:assert/strict'
import test from 'node:test'
import { ALPHA, FAIL_PENALTY, applyEvidence, judgeBlank, modeDamp, replay, scoreOfAnswers } from './engine'
import type { Evidence } from './engine'
import { DAY_MS, strength } from './color'

const NOW = 1_800_000_000_000

const learnt = (mastery: number, stability = 5) => ({
  mastery,
  stability,
  lastReviewAt: NOW - DAY_MS,
})

const ev = (score: number, at = NOW, mode?: Evidence['mode']): Evidence => ({
  id: 'e1',
  kpId: 'k1',
  at,
  kind: 'quiz',
  score,
  mode,
})

test('答对：mastery 朝 1 走一步，不超过 1', () => {
  const next = applyEvidence(learnt(0.5), ev(1))
  assert.ok(Math.abs(next.mastery - (0.5 + ALPHA * (1 - 0.5))) < 1e-9)
  assert.ok(next.mastery <= 1)
})

test('答错：mastery 掉，且额外扣惩罚分', () => {
  const zero = applyEvidence(learnt(0.6), ev(0))
  assert.ok(Math.abs(zero.mastery - Math.max(0, 0.6 + ALPHA * (0 - 0.6) - FAIL_PENALTY)) < 1e-9)
})

test('答错会让稳定度变短（更容易到期），答对会变长', () => {
  const bad = applyEvidence(learnt(0.6, 10), ev(0.2))
  const good = applyEvidence(learnt(0.6, 10), ev(0.9))
  assert.ok(bad.stability < 10, '答错后稳定度应下降')
  assert.ok(good.stability > 10, '答对后稳定度应上升')
})

test('从没学过的人第一次答题：不会被当成「已经很熟」，但也不是 0', () => {
  const fresh = { mastery: 0, stability: 1, lastReviewAt: null }
  const next = applyEvidence(fresh, ev(1))
  assert.ok(next.mastery > 0 && next.mastery < 0.5)
  assert.notEqual(next.lastReviewAt, null)
})

test('冲刺模式的证据对长期掌握打折（堵模式污染）', () => {
  assert.ok(modeDamp('sprint') < modeDamp('full'))
  assert.ok(modeDamp('fragment') < modeDamp('sprint'))
  const full = applyEvidence(learnt(0.3), ev(1, NOW, 'full'))
  const sprint = applyEvidence(learnt(0.3), ev(1, NOW, 'sprint'))
  assert.ok(sprint.mastery < full.mastery, '同样答对，冲刺涨得少')
})

test('时间旅行：同一份状态，越往后颜色越淡', () => {
  const s = applyEvidence(learnt(0.8, 5), ev(0.9))
  const now = strength(s, NOW)
  const later = strength(s, NOW + 20 * DAY_MS)
  assert.ok(now > later)
})

test('重放是纯函数：顺序与输入无关，结果一致', () => {
  const base = learnt(0.4)
  const list: Evidence[] = [ev(0.9, NOW - 2 * DAY_MS), ev(0.3, NOW - DAY_MS), ev(1, NOW)]
  const a = replay(base, list)
  const b = replay(base, [...list].reverse())
  assert.ok(Math.abs(a.mastery - b.mastery) < 1e-9)
  assert.ok(Math.abs(a.stability - b.stability) < 1e-9)
})

test('填空题判分：忽略标点空格，支持多要点', () => {
  assert.equal(judgeBlank('南京条约', '南京条约'), true)
  assert.equal(judgeBlank('《南京条约》', '南京条约'), true)
  assert.equal(judgeBlank('  广州、厦门、福州、宁波、上海 ', '广州、厦门、福州、宁波、上海'), true)
  assert.equal(judgeBlank('广州 厦门 福州 宁波 上海', '广州、厦门、福州、宁波、上海'), true)
  assert.equal(judgeBlank('天津', '广州、厦门、福州、宁波、上海'), false)
  assert.equal(judgeBlank('', '南京条约'), false)
})

test('得分 = 对题数 / 总题数，空数组不产生 NaN', () => {
  assert.equal(scoreOfAnswers([{ correct: true }, { correct: false }]), 0.5)
  assert.equal(scoreOfAnswers([]), 0)
})
