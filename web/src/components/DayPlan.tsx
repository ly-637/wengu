'use client'

import { useMemo } from 'react'
import { daysUntilDue, strength } from '@/lib/color'
import { buildDay, fmtRange, summarize, type Pace, type SchedItem } from '@/lib/plan'
import type { Kp } from '@/lib/mock'

/** 今晚能拿出多少时间 —— 阶段 2 这会被用户设置替代 */
const WINDOWS: Record<Pace, [number, number]> = {
  full: [19 * 60, 22 * 60],
  sprint: [19 * 60, 21 * 60],
  fragment: [19 * 60, 20 * 60],
}

const MAX_NEW: Record<Pace, number> = { full: 3, sprint: 4, fragment: 2 }

const PACE_LABEL: Record<Pace, string> = {
  full: '扎实长期',
  sprint: '期末冲刺',
  fragment: '碎片探索',
}

const KIND_TAG: Record<string, { text: string; cls: string }> = {
  review: { text: '复习', cls: 'review' },
  learn: { text: '学新', cls: 'learn' },
  break: { text: '休息', cls: '' },
}

export default function DayPlan({ kps, now, pace }: { kps: Kp[]; now: number; pace: Pace }) {
  // plan.ts 的 reason 里用的是知识点 id，展示前换成标题，现场才不会看到 [chizhan] 这种东西
  const titleOf = useMemo(() => new Map(kps.map((k) => [k.id, k.title])), [kps])
  const idFix = useMemo(
    () => (text: string) =>
      text.replace(/[\[「]([^\]」]+)[\]」]/g, (_m, inner: string) =>
        `「${inner
          .split(/[,，、]\s*/)
          .map((id) => titleOf.get(id) ?? id)
          .join('、')}」`,
      ),
    [titleOf],
  )

  const { blocks, summary } = useMemo(() => {
    const items: SchedItem[] = kps.map((k) => ({
      kpId: k.id,
      title: k.title,
      learned: k.state.lastReviewAt !== null,
      daysUntilDue: daysUntilDue(k.state, now),
      strength: strength(k.state, now),
      importance: k.importance,
      estMinutes: k.estMinutes,
      prereqs: k.prereqs,
    }))
    const [startMin, endMin] = WINDOWS[pace]
    const bs = buildDay(items, { pace, startMin, endMin, maxNew: MAX_NEW[pace] })
    return { blocks: bs, summary: summarize(bs) }
  }, [kps, now, pace])

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>今晚的计划</h2>
          <p className="lead">{PACE_LABEL[pace].split(' · ')[0]}</p>
        </div>
        <p className="cap" style={{ alignSelf: 'flex-end' }}>
          {summary.totalMin > 0
            ? `共 ${summary.totalMin} 分钟 · 复习 ${summary.reviewMin} · 新学 ${summary.learnMin}${
                summary.breakMin > 0 ? ` · 休息 ${summary.breakMin}` : ''
              }`
            : '今晚没有安排'}
        </p>
      </div>

      {summary.totalMin === 0 ? (
        <div className="empty">所有点都不在期，也没有可以推进的新点。</div>
      ) : (
        <ol className="plan">
          {blocks.map((b, i) => {
            const tag = KIND_TAG[b.kind] ?? KIND_TAG.learn
            return (
              <li className="slot" data-kind={b.kind} key={`${b.startMin}-${b.kind}-${i}`}>
                <div className="time">{fmtRange(b)}</div>
                <div className="body">
                  <div className="title">
                    <span>{b.title}</span>
                    {b.kind !== 'break' && <span className={`tag ${tag.cls}`}>{tag.text}</span>}
                  </div>
                  <div className="why">{idFix(b.reason)}</div>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <div className="hint">
        时间从 19:00 起算，拖动顶部时间旅行可以看别的日子。
      </div>
    </section>
  )
}
