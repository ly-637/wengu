import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PACES, buildDay, fmtRange, summarize, type SchedItem } from './plan.ts'

const item = (over: Partial<SchedItem> & { kpId: string }): SchedItem => ({
  title: over.kpId,
  learned: true,
  daysUntilDue: 0,
  strength: 0.5,
  importance: 3,
  estMinutes: 30,
  prereqs: [],
  ...over,
})

test('每个非休息块都必须带一句能直接给用户看的 reason', () => {
  const items = [
    item({ kpId: 'a', daysUntilDue: -3 }),
    item({ kpId: 'b', learned: false, daysUntilDue: null }),
  ]
  const blocks = buildDay(items, { pace: 'full', startMin: 540, endMin: 660 })
  for (const b of blocks) {
    assert.ok(b.reason.length > 4, `${b.kind} 的 reason 太短: ${b.reason}`)
    assert.ok(!/AI|模型|算法/i.test(b.reason), `reason 不该出现技术黑话: ${b.reason}`)
  }
})

test('到期复习排在新点前面', () => {
  const items = [
    item({ kpId: 'fresh1', learned: false, daysUntilDue: null, title: '新知识' }),
    item({ kpId: 'due1', daysUntilDue: -2, title: '该复习了' }),
  ]
  const blocks = buildDay(items, { pace: 'full', startMin: 540, endMin: 660 })
  const kinds = blocks.filter((b) => b.kind !== 'break').map((b) => b.kind)
  assert.deepEqual(kinds, ['review', 'learn'])
})

test('不超出时间窗', () => {
  const items = Array.from({ length: 20 }, (_, i) =>
    item({ kpId: `k${i}`, daysUntilDue: -1, estMinutes: 30 }),
  )
  const blocks = buildDay(items, { pace: 'full', startMin: 540, endMin: 600 })
  for (const b of blocks) {
    assert.ok(b.startMin >= 540 && b.endMin <= 600, `${fmtRange(b)} 越界`)
  }
})

test('块与块之间不重叠、时间连续', () => {
  const items = [
    item({ kpId: 'a', daysUntilDue: -1, estMinutes: 45 }),
    item({ kpId: 'b', daysUntilDue: -1, estMinutes: 45 }),
    item({ kpId: 'c', daysUntilDue: -1, estMinutes: 45 }),
    item({ kpId: 'd', daysUntilDue: -1, estMinutes: 45 }),
  ]
  const blocks = buildDay(items, { pace: 'full', startMin: 540, endMin: 780 })
  for (let i = 1; i < blocks.length; i++) {
    assert.equal(blocks[i].startMin, blocks[i - 1].endMin, `第 ${i} 块与上一块不连续`)
  }
})

test('前置没满足的新点不排（否则等于让你看不动的书）', () => {
  const items = [
    item({ kpId: 'adv', learned: false, daysUntilDue: null, prereqs: ['base'] }),
    item({ kpId: 'base', learned: false, daysUntilDue: null, prereqs: [] }),
  ]
  const blocks = buildDay(items, { pace: 'full', startMin: 540, endMin: 600, maxNew: 1 })
  const ids = blocks.map((b) => b.kpId)
  assert.ok(ids.includes('base'), '应该先排没有前置的 base')
  assert.ok(!ids.includes('adv'), '前置未满足的 adv 不该排')
})

test('长期连续学习会插休息', () => {
  const items = Array.from({ length: 6 }, (_, i) =>
    item({ kpId: `k${i}`, daysUntilDue: -1, estMinutes: 45 }),
  )
  const blocks = buildDay(items, { pace: 'full', startMin: 540, endMin: 900 })
  assert.ok(blocks.some((b) => b.kind === 'break'), '4 小时窗口里应该有休息')
  for (const b of blocks.filter((x) => x.kind === 'break')) {
    assert.equal(b.endMin - b.startMin, PACES.full.breakMinutes)
  }
})

test('确定性：同样输入两次结果一样', () => {
  const mk = () => [
    item({ kpId: 'a', daysUntilDue: -1, estMinutes: 30 }),
    item({ kpId: 'b', daysUntilDue: -5, estMinutes: 30 }),
  ]
  const opts = { pace: 'full' as const, startMin: 540, endMin: 660 }
  assert.deepEqual(buildDay(mk(), opts), buildDay(mk(), opts))
})

test('逾期越久越靠前', () => {
  const items = [
    item({ kpId: 'mild', daysUntilDue: -1, strength: 0.5 }),
    item({ kpId: 'bad', daysUntilDue: -12, strength: 0.5 }),
  ]
  const blocks = buildDay(items, { pace: 'full', startMin: 540, endMin: 660, maxNew: 1 })
  assert.equal(blocks[0].kpId, 'bad')
})

test('三种节奏只改参数，不改代码路径', () => {
  const items = Array.from({ length: 6 }, (_, i) =>
    item({ kpId: `k${i}`, daysUntilDue: -1, estMinutes: 20 }),
  )
  const full = buildDay(items, { pace: 'full', startMin: 540, endMin: 660 })
  const frag = buildDay(items, { pace: 'fragment', startMin: 540, endMin: 660 })
  assert.ok(full.length > 0 && frag.length > 0)
  // 碎片模式下单块更短，同样窗口能装更多块
  const maxLen = (bs: typeof full) => Math.max(...bs.filter((b) => b.kind !== 'break').map((b) => b.endMin - b.startMin))
  assert.ok(maxLen(frag) <= maxLen(full))
})

test('summarize 各项加起来等于总窗口内的学习时间', () => {
  const items = [item({ kpId: 'a', daysUntilDue: -1, estMinutes: 45 })]
  const blocks = buildDay(items, { pace: 'full', startMin: 540, endMin: 600 })
  const s = summarize(blocks)
  assert.equal(s.totalMin, s.reviewMin + s.learnMin)
  assert.equal(s.reviewMin, 45)
})

test('空候选池 → 空表，不报错', () => {
  assert.deepEqual(buildDay([], { pace: 'full', startMin: 540, endMin: 660 }), [])
})
