import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SAMPLE_QUIZZES,
  SAMPLE_TEXT,
  fallbackQuiz,
  makeDoc,
  splitSegments,
  docProgress,
} from './docs'

test('示例讲义切成 3 段，每段都在一屏能读完的长度内', () => {
  const segs = splitSegments(SAMPLE_TEXT)
  assert.equal(segs.length, 3)
  for (const s of segs) {
    // 第三段是「容易混」的短清单，58 字也合理；只要不是空段、不超过一屏
    assert.ok(s.text.length >= 50, `太短：${s.text.length}`)
    assert.ok(s.text.length <= 700, `太长：${s.text.length}`)
    assert.ok(s.heading.length > 0)
  }
})

test('切段不会把标题混进正文', () => {
  const segs = splitSegments(SAMPLE_TEXT)
  assert.ok(segs[0].heading.includes('新文化运动'))
  assert.ok(!segs[0].text.startsWith('#'), '正文里不该留 markdown 标题井号')
})

test('短文也能切出一段', () => {
  const segs = splitSegments('这是一段很短的话，用来测试兜底逻辑不会返回空数组。')
  assert.equal(segs.length, 1)
  assert.ok(segs[0].text.includes('兜底'))
})

test('makeDoc 生成唯一的段 id，进度从 0 开始', () => {
  const doc = makeDoc('测试', SAMPLE_TEXT, 1000)
  const ids = new Set(doc.segments.map((s) => s.id))
  assert.equal(ids.size, doc.segments.length)
  assert.equal(docProgress(doc).pct, 0)
  assert.equal(docProgress(doc).total, 3)
  assert.equal(doc.segments[0].readAt, null)
})

test('兜底题只在对应段落命中时才返回', () => {
  const withWusi = SAMPLE_QUIZZES.find((s) => s.match === '五四运动')!
  assert.equal(fallbackQuiz(withWusi.items[0].stem + '五四运动').length, 2)
  assert.equal(fallbackQuiz('一段完全无关的物理讲义').length, 0)
})
