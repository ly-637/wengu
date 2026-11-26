'use client'

import { useEffect, useState } from 'react'
import ExamPanel from '@/components/ExamPanel'
import { daysUntilDue, statusOf, strength } from '@/lib/color'
import type { Evidence } from '@/lib/engine'
import type { Kp } from '@/lib/mock'
import type { Bucket } from '@/lib/sprint'
import { bucketCounts, buildSprintPlan, examGap, leavesOf, sprintHeadline } from '@/lib/sprint'

const BUCKET_LABEL: Record<Bucket, string> = { must: '必背', weak: '易错', safe: '保底' }
const BUCKET_HINT: Record<Bucket, string> = {
  must: '考频高、现在又没掌握，背下来直接换分',
  weak: '上次做错了，考到就是白丢分',
  safe: '已经八九成，考前扫一眼保住就行',
}

const fmtMD = (ms: number) => new Date(ms).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
const fmtWeek = (ms: number) => new Date(ms).toLocaleDateString('zh-CN', { weekday: 'short' })
const toDateInput = (ms: number) => {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

type Props = {
  kps: Kp[]
  now: number
  examAt: number
  evidence: Evidence[]
  onExamAt: (ms: number) => void
  onPick: (id: string) => void
  onGraded: (kps: Kp[]) => void
}

export default function SprintBoard({ kps, now, examAt, evidence, onExamAt, onPick, onGraded }: Props) {
  const plan = buildSprintPlan(kps, now, examAt, { evidence })
  const [dayIdx, setDayIdx] = useState(0)
  const [examOpen, setExamOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const day = plan.days[Math.min(dayIdx, plan.days.length - 1)]
  const buckets: Bucket[] = ['must', 'weak', 'safe']

  // 演示/截图用：?view=sprint&exam=1 直接展开整卷
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('exam') === '1') setExamOpen(true)
  }, [])

  // 错题本：每个考点取最近一次得分，低于 60 分的排最前
  const lastByKp = new Map<string, number>()
  for (const e of evidence) lastByKp.set(e.kpId, e.score)
  const wrong = leavesOf(kps)
    .map((kp) => ({ kp, score: lastByKp.get(kp.id) }))
    .filter((x): x is { kp: Kp; score: number } => typeof x.score === 'number' && x.score < 0.6)
    .sort((a, b) => a.score - b.score)
    .slice(0, 8)

  // 「同一份数据，两种排法」——这是整个产品最值得讲的一句，做成可看的对照
  const leaves = leavesOf(kps)
  const byMemory = [...leaves]
    .filter((kp) => daysUntilDue(kp.state, now) !== null)
    .sort((a, b) => (daysUntilDue(a.state, now) ?? 0) - (daysUntilDue(b.state, now) ?? 0))
    .slice(0, 4)
  const byExam = [...leaves]
    .sort((a, b) => examGap(b, now, lastByKp.get(b.id)) - examGap(a, now, lastByKp.get(a.id)))
    .slice(0, 4)

  async function changeDate(value: string) {
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch('/api/exam-date', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date: value }),
      })
      const data = (await res.json()) as { examAt?: number; error?: string }
      if (!res.ok || typeof data.examAt !== 'number') {
        setErr(data.error ?? '改日期失败了')
        return
      }
      onExamAt(data.examAt)
      setDayIdx(0)
    } catch {
      setErr('改日期失败了，检查一下后端')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sprint">
      <section className="sprint-hero">
        <div className="countdown">
          <span className="cd-label">距离考试</span>
          <b className="cd-num">{plan.daysLeft}</b>
          <span className="cd-unit">天</span>
          <label className="cd-date">
            考试日期
            <input
              type="date"
              value={toDateInput(examAt)}
              onChange={(e) => e.target.value && changeDate(e.target.value)}
              disabled={saving}
            />
          </label>
        </div>

        <div className="sprint-say">
          <h2>{sprintHeadline(plan)}</h2>
          <p>
            按考频和上次成绩排，先补最亏的。
          </p>
        </div>

        <div className="sprint-stats">
          <div>
            <span>覆盖考点</span>
            <b>
              {plan.coverage.learned}/{plan.coverage.total}
            </b>
          </div>
          <div>
            <span>按考频预估</span>
            <b>{plan.projected} 分</b>
          </div>
          <div>
            <span>还差</span>
            <b>{plan.debtMinutes} 分钟</b>
          </div>
        </div>
      </section>

      {err && <div className="banner">{err}</div>}

      <div className="sprint-body">
        <section className="card sprint-route">
          <div className="card-head">
            <div>
              <h2>冲刺路线</h2>
              <p className="cap">每天三个桶：必背 / 易错 / 保底，点一天看当天怎么排</p>
            </div>
          </div>

          <div className="days">
            {plan.days.slice(0, 14).map((d, i) => {
              const c = bucketCounts(d)
              return (
                <button
                  key={d.offset}
                  type="button"
                  className="daycell"
                  data-on={i === dayIdx}
                  data-today={d.offset === 0}
                  onClick={() => setDayIdx(i)}
                >
                  <span className="dc-top">
                    {d.offset === 0 ? '今天' : fmtWeek(d.at)}
                    <em>{fmtMD(d.at)}</em>
                  </span>
                  <span className="dc-buckets">
                    <i data-b="must">必背 {c.must}</i>
                    <i data-b="weak">易错 {c.weak}</i>
                    <i data-b="safe">保底 {c.safe}</i>
                  </span>
                  <span className="dc-min">{d.minutes} 分钟</span>
                </button>
              )
            })}
          </div>

          {day && (
            <div className="day-detail">
              <div className="dd-head">
                <b>{day.offset === 0 ? '今天' : fmtMD(day.at)}</b>
                <span className="cap">
                  共 {day.items.length} 条 · {day.minutes} 分钟
                </span>
              </div>

              {buckets.map((b) => {
                const list = day.items.filter((it) => it.bucket === b)
                if (list.length === 0) return null
                return (
                  <div className="bucket" key={b} data-b={b}>
                    <div className="bucket-head">
                      <b>{BUCKET_LABEL[b]}</b>
                      <span className="cap">{BUCKET_HINT[b]}</span>
                    </div>
                    <ul className="queue">
                      {list.map((it) => (
                        <li key={it.kp.id}>
                          <button type="button" className="queue-row" onClick={() => onPick(it.kp.id)}>
                            <i className="dot" data-strength={Math.round((strength(it.kp.state, now) * 100) / 20)} />
                            <span className="queue-title">{it.kp.title}</span>
                            <span className="queue-why">{it.reason}</span>
                            <span className="queue-meta">{it.minutes} 分钟</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}

              {day.items.length === 0 && <p className="empty">这一天留空——考前一天不要再塞新东西。</p>}
            </div>
          )}

          <div className="compare">
            <div className="cmp-col">
              <div className="cmp-head">
                <b>长期视角</b>
                <span className="cap">按遗忘曲线该复习的</span>
              </div>
              <ul className="cmp-list">
                {byMemory.map((kp) => {
                  const d = daysUntilDue(kp.state, now) ?? 0
                  return (
                    <li key={kp.id}>
                      {kp.title}
                      <em>{d <= 0 ? `逾期 ${Math.max(1, Math.round(-d))} 天` : `${Math.max(1, Math.round(d))} 天后`}</em>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div className="cmp-col" data-tone="exam">
              <div className="cmp-head">
                <b>冲刺视角</b>
                <span className="cap">按考分缺口该背的</span>
              </div>
              <ul className="cmp-list">
                {byExam.map((kp) => (
                  <li key={kp.id}>
                    {kp.title}
                    <em>
                      考频 {kp.importance}/5 · 现在 {Math.round(strength(kp.state, now) * 100)}%
                    </em>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="cmp-note">
            同一批考点，换一个目标函数，排出来完全不同。
          </p>
        </section>

        <div className="sprint-side">
          <section className="card exam-card">
            <div className="card-head">
              <div>
                <h2>整卷模拟</h2>
                <p className="cap">10 题、跨章抽题、限时 15 分钟，交卷当场出分</p>
              </div>
            </div>
            {!examOpen ? (
              <>
                <p className="exam-blurb">
                  按考频从各章抽题，模拟一次真实的期末卷。错题会自动进右边的错题本，颜色也会立刻变。
                </p>
                <button type="button" className="btn" onClick={() => setExamOpen(true)}>
                  开始整卷 · 15 分钟
                </button>
              </>
            ) : (
              <p className="exam-blurb">卷子已经在中间展开了，答完记得交卷。</p>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2>错题本</h2>
                <p className="cap">最近一次没到 60 分的考点，考前只看这里</p>
              </div>
            </div>
            <ul className="queue">
              {wrong.map(({ kp, score }) => (
                <li key={kp.id}>
                  <button type="button" className="queue-row" onClick={() => onPick(kp.id)}>
                    <i className="dot" data-strength={Math.round((score * 100) / 20)} />
                    <span className="queue-title">{kp.title}</span>
                    <span className="queue-meta">
                      {Math.round(score * 100)} 分 · {statusOf(kp.state, now) === 'new' ? '没学过' : '待补'}
                    </span>
                  </button>
                </li>
              ))}
              {wrong.length === 0 && <li className="empty">还没有错题。做一次整卷，或者去练习里错几道。</li>}
            </ul>
          </section>
        </div>
      </div>

      {examOpen && (
        <div className="exam-modal" role="dialog" aria-modal="true" aria-label="整卷模拟">
          <div className="sheet">
            <ExamPanel kps={kps} now={now} onClose={() => setExamOpen(false)} onGraded={onGraded} />
          </div>
        </div>
      )}
    </div>
  )
}
