import assert from 'node:assert/strict'
import test from 'node:test'
import { DAY_MS, strength } from './color'
import type { Evidence } from './engine'
import type { Kp } from './mock'
import {
  bucketCounts,
  buildSprintPlan,
  daysLeft,
  examGap,
  pickPaperKps,
  projectedScore,
  sprintHeadline,
} from './sprint'

const NOW = 1_800_000_000_000

/** 造一个叶子考点；parent 用来验证抽卷跨章 */
const kp = (
  id: string,
  mastery: number,
  opts: { importance?: 1 | 2 | 3 | 4 | 5; parent?: string; ageDays?: number; stability?: number } = {},
): Kp => ({
  id,
  title: `考点 ${id}`,
  parent: opts.parent ?? 'ch1',
  depth: 2,
  prereqs: [],
  importance: opts.importance ?? 3,
  estMinutes: 15,
  note: '',
  state: {
    mastery,
    stability: opts.stability ?? 5,
    lastReviewAt: NOW - (opts.ageDays ?? 1) * DAY_MS,
  },
})

test('daysLeft：不足一天算一天，考完了算 0', () => {
  assert.equal(daysLeft(NOW + 3 * DAY_MS, NOW), 3)
  assert.equal(daysLeft(NOW + DAY_MS / 3, NOW), 1)
  assert.equal(daysLeft(NOW - 5 * DAY_MS, NOW), 0)
})

test('examGap：考频高的、掌握低的更该先动', () => {
  const high = kp('a', 0.2, { importance: 5 })
  const low = kp('b', 0.2, { importance: 2 })
  assert.ok(examGap(high, NOW) > examGap(low, NOW))

  const solid = kp('c', 0.95, { importance: 5 })
  assert.ok(examGap(high, NOW) > examGap(solid, NOW))
})

test('examGap：上次答错的会被加重', () => {
  const a = kp('a', 0.5, { importance: 4 })
  assert.ok(examGap(a, NOW, 0.2) > examGap(a, NOW, 0.9))
})

test('projectedScore：按考频加权，不是简单平均', () => {
  const course = [
    kp('a', 1, { importance: 5 }),
    kp('b', 0, { importance: 1 }),
  ]
  // (1×5 + 0×1) / 6 ≈ 83，而不是 50
  const score = projectedScore(course, NOW)
  assert.ok(score > 80 && score <= 100, `加权后应该偏高，实际 ${score}`)
})

test('buildSprintPlan：每天都有东西，且总数不丢', () => {
  const course = Array.from({ length: 28 }, (_, i) =>
    kp(`k${i}`, (i % 10) / 12, { importance: (((i % 5) + 1) as 1 | 2 | 3 | 4 | 5) }),
  )
  const plan = buildSprintPlan(course, NOW, NOW + 12 * DAY_MS)

  assert.equal(plan.days.length, 12)
  const total = plan.days.reduce((sum, d) => sum + d.items.length, 0)
  assert.equal(total, 28, '不能有考点被丢掉')
  assert.ok(plan.days.every((d) => d.items.length > 0), '不能出现空的一天')
  assert.ok(plan.days.some((d) => d.items.some((it) => it.bucket === 'must')))
})

test('buildSprintPlan：缺口大的排在前面', () => {
  const course = [kp('bad', 0.05, { importance: 5 }), kp('ok', 0.95, { importance: 5 })]
  const plan = buildSprintPlan(course, NOW, NOW + 2 * DAY_MS)
  const order = plan.days.flatMap((d) => d.items.map((it) => it.kp.id))
  assert.equal(order[0], 'bad')
})

test('buildSprintPlan：最近答错的进「易错」桶', () => {
  const evidence: Evidence[] = [{ id: 'e', kpId: 'a', at: NOW, kind: 'quiz', score: 0.2 }]
  const plan = buildSprintPlan([kp('a', 0.9)], NOW, NOW + 5 * DAY_MS, { evidence })
  assert.equal(plan.days[0].items[0].bucket, 'weak')
})

test('bucketCounts：三个桶加起来等于当天条数', () => {
  const plan = buildSprintPlan(
    [kp('a', 0.1, { importance: 5 }), kp('b', 0.9)],
    NOW,
    NOW + 2 * DAY_MS,
    { evidence: [{ id: 'e', kpId: 'b', at: NOW, kind: 'quiz', score: 0.3 }] },
  )
  const counts = bucketCounts(plan.days[0])
  const total = counts.must + counts.weak + counts.safe
  assert.equal(total, plan.days[0].items.length)
})

test('pickPaperKps：抽 10 条、不重复、尽量跨章', () => {
  const course = [
    ...Array.from({ length: 8 }, (_, i) => kp(`a${i}`, 0.5, { parent: 'ch1' })),
    ...Array.from({ length: 8 }, (_, i) => kp(`b${i}`, 0.5, { parent: 'ch2' })),
    ...Array.from({ length: 8 }, (_, i) => kp(`c${i}`, 0.5, { parent: 'ch3' })),
  ]
  const picked = pickPaperKps(course, 10)
  assert.equal(picked.length, 10)
  assert.equal(new Set(picked.map((k) => k.id)).size, 10, '不能同一道题出现两次')
  const chapters = new Set(picked.map((k) => k.parent))
  assert.equal(chapters.size, 3, '三个章都应该有题')
})

test('sprintHeadline：临考的说法会变', () => {
  const near = buildSprintPlan([kp('a', 0.5)], NOW, NOW + DAY_MS)
  const far = buildSprintPlan([kp('a', 0.5)], NOW, NOW + 20 * DAY_MS)
  assert.notEqual(sprintHeadline(near), sprintHeadline(far))
  assert.ok(sprintHeadline(near).includes('明天'))
})

test('冲刺排序不含 NaN：掌握度是 0 的点也不会算出 NaN', () => {
  const plan = buildSprintPlan([kp('a', 0)], NOW, NOW + 3 * DAY_MS)
  for (const d of plan.days) for (const it of d.items) assert.ok(Number.isFinite(it.gap))
  assert.ok(Number.isFinite(projectedScore([kp('a', 0)], NOW)))
  assert.ok(strength(kp('a', 0).state, NOW) >= 0)
})
