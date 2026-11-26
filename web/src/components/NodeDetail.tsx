'use client'

import { bandOf, colorOf, daysUntilDue, dueAt, retrievability, strength } from '@/lib/color'
import type { Kp } from '@/lib/mock'

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })

const R = 33
const C = 2 * Math.PI * R

/** 掌握度圆环：一圈 = 这个点此刻「能用出来多少」 */
function Gauge({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div className="gauge" aria-hidden="true">
      <svg width="78" height="78" viewBox="0 0 78 78">
        <circle cx="39" cy="39" r={R} fill="none" stroke="var(--line-2)" strokeWidth="7" />
        <circle
          cx="39"
          cy="39"
          r={R}
          fill="none"
          stroke={colorOf(value)}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(C * pct) / 100} ${C}`}
          style={{ transition: 'stroke-dasharray .45s cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <span className="gv">
        {pct}
        <small>%</small>
      </span>
    </div>
  )
}

/** 一个 0..1 的横条 */
function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="track">
      <i style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, background: color }} />
    </div>
  )
}

function Metric({ name, value, label, color }: { name: string; value: number; label: string; color: string }) {
  return (
    <div className="metric">
      <div className="row">
        <span>{name}</span>
        <b>{label}</b>
      </div>
      <Bar value={value} color={color} />
    </div>
  )
}

type Props = {
  kp: Kp | null
  now: number
  offsetDays: number
  onQuiz?: () => void
  quizOpen?: boolean
}

export default function NodeDetail({ kp, now, offsetDays, onQuiz, quizOpen }: Props) {
  if (!kp) {
    return (
      <div className="card detail">
        <h2>知识点</h2>
        <div className="empty">点左边任意一个方块，看它为什么是这个颜色。</div>
      </div>
    )
  }

  const v = strength(kp.state, now)
  const r = retrievability(kp.state, now)
  const m = kp.state.lastReviewAt === null ? 0 : kp.state.mastery
  const d = daysUntilDue(kp.state, now)
  const due = dueAt(kp.state)
  const overdue = d !== null && d <= 0

  return (
    <div className="card detail">
      <h2>知识点</h2>

      <div className="detail-top">
        <Gauge value={v} />
        <div className="detail-title">
          <h3>{kp.title}</h3>
          <div className="sub">
            {kp.state.lastReviewAt === null
              ? '还没有任何学习记录'
              : `${bandOf(v)} · 重要度 ${kp.importance}/5 · 预计 ${kp.estMinutes} 分钟`}
          </div>
        </div>
      </div>

      <Metric
        name="① 学得多扎实"
        value={m}
        label={`${Math.round(m * 100)}%`}
        color="var(--accent)"
      />
      <Metric
        name="② 现在还记得多少"
        value={r}
        label={`${Math.round(r * 100)}%`}
        color="var(--due)"
      />

      {kp.state.lastReviewAt !== null && (
        <div className="due-line" data-over={overdue}>
          <span>下次该复习</span>
          <b>
            {due ? fmtDate(due) : '—'}
            {d !== null && d <= 0 && ` · 已逾期 ${Math.abs(Math.round(d))} 天`}
            {d !== null && d > 0 && ` · 还有 ${Math.round(d)} 天`}
          </b>
        </div>
      )}

      {onQuiz && (
        <div className="detail-actions">
          <button type="button" className="btn" disabled={quizOpen} onClick={onQuiz}>
            {quizOpen ? '题目在下面 ↓' : '考我 3 题 →'}
          </button>
        </div>
      )}

      {kp.note && <div className="hint">{kp.note}</div>}

      <div className="hint">
        {kp.state.lastReviewAt === null
          ? '虚线框表示「还没开始」，不是「忘了」。学它一次就会亮起来。'
          : v < 0.35 && m < 0.5
            ? '颜色浅是因为底子薄（① 低），光复习没用，得做题或者讲一遍。'
            : v < 0.45 && m >= 0.5
              ? '颜色浅是因为快忘了（② 低），复习一次就能回到浓绿。'
              : `此刻颜色 ${Math.round(v * 100)}%，${offsetDays === 0 ? '就是今天的样子' : offsetDays > 0 ? `是 ${offsetDays} 天后的预测` : `是 ${-offsetDays} 天前的样子`}。`}
      </div>
    </div>
  )
}
