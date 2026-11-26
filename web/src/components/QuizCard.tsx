'use client'

import { useCallback, useEffect, useState } from 'react'
import { strength } from '@/lib/color'
import { judgeBlank, scoreOfAnswers } from '@/lib/engine'
import type { Attempt, Kp } from '@/lib/mock'
import type { Pace } from '@/lib/plan'
import type { QuizItem } from '@/lib/quizbank'

type Props = {
  kp: Kp
  mode: Pace
  fresh?: boolean
  onGraded: (kp: Kp, attempts: Attempt[]) => void
  onAsk?: (text: string) => void
}

type Outcome = { score: number; before: number; after: number; correct: number }

/** 对话里的一张题卡：出题 → 作答 → 交卷 → 颜色当场变。沿用 /api/ai/quiz 的缓存优先策略。 */
export default function QuizCard({ kp, mode, fresh, onGraded, onAsk }: Props) {
  const [items, setItems] = useState<QuizItem[]>([])
  const [source, setSource] = useState<'cache' | 'ai' | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/ai/quiz?kpId=${encodeURIComponent(kp.id)}${fresh ? '&fresh=1' : ''}`)
      .then(async (res) => {
        const data = (await res.json()) as { items?: QuizItem[]; source?: 'cache' | 'ai'; error?: string }
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        return data
      })
      .then((data) => {
        if (!alive) return
        setItems(data.items ?? [])
        setSource(data.source ?? null)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [kp.id, fresh])

  const grade = useCallback(
    (item: QuizItem): boolean => {
      const pick = picks[item.id]
      if (!pick) return false
      if (item.type === 'blank') return judgeBlank(pick, item.answer)
      return pick === item.answer
    },
    [picks],
  )

  const answered = items.filter((it) => (picks[it.id] ?? '').length > 0).length

  async function submit() {
    if (answered < items.length || submitting) return
    setSubmitting(true)
    const results = items.map((it) => ({ correct: grade(it) }))
    const score = scoreOfAnswers(results)
    const before = strength(kp.state, Date.now())
    try {
      const res = await fetch('/api/quiz/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kpId: kp.id,
          score,
          mode,
          note: `${items.length} 题自测，对 ${results.filter((r) => r.correct).length} 题`,
        }),
      })
      const data = (await res.json()) as { kp?: Kp; attempts?: Attempt[]; error?: string }
      if (!res.ok || !data.kp) throw new Error(data.error || `HTTP ${res.status}`)
      setOutcome({
        score,
        before,
        after: strength(data.kp.state, Date.now()),
        correct: results.filter((r) => r.correct).length,
      })
      onGraded(data.kp, data.attempts ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const delta = outcome ? Math.round((outcome.after - outcome.before) * 100) : 0
  const misses = outcome ? items.filter((it) => !grade(it)) : []

  return (
    <div className="qcard">
      <div className="qcard-head">
        <span className="qbadge">{source === 'cache' ? '题库' : '现出'}</span>
        <b>{items.length || 3} 题 · {kp.title}</b>
        {mode !== 'full' && <span className="qmode">{mode === 'sprint' ? '冲刺记录' : '碎片记录'}</span>}
      </div>

      {loading && <div className="qloading">出题中…通常 1–3 秒</div>}
      {error && (
        <div className="quizerr">
          {error}
          {onAsk && (
            <button type="button" className="link" onClick={() => onAsk('这题我答不上来，直接讲一下这个考点')}>
              让助教直接讲
            </button>
          )}
        </div>
      )}

      {!loading &&
        items.map((item, i) => {
          const pick = picks[item.id]
          const right = grade(item)
          return (
            <div className="qitem" key={item.id}>
              <div className="stem">
                <span className="no">{i + 1}</span>
                {item.stem}
              </div>

              {item.type === 'single' && item.options && (
                <div className="opts">
                  {item.options.map((opt, oi) => {
                    const letter = String.fromCharCode(65 + oi)
                    const mark = outcome ? (letter === item.answer ? 'right' : pick === letter ? 'wrong' : undefined) : undefined
                    return (
                      <button
                        key={letter}
                        type="button"
                        className="opt"
                        data-picked={pick === letter}
                        data-state={mark}
                        disabled={!!outcome}
                        onClick={() => setPicks((p) => ({ ...p, [item.id]: letter }))}
                      >
                        <b>{letter}</b>
                        {opt}
                      </button>
                    )
                  })}
                </div>
              )}

              {item.type === 'judge' && (
                <div className="opts">
                  {['对', '错'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="opt"
                      data-picked={pick === v}
                      data-state={outcome ? (v === item.answer ? 'right' : pick === v ? 'wrong' : undefined) : undefined}
                      disabled={!!outcome}
                      onClick={() => setPicks((p) => ({ ...p, [item.id]: v }))}
                    >
                      <b>{v}</b>
                    </button>
                  ))}
                </div>
              )}

              {item.type === 'blank' && (
                <input
                  className="blank"
                  value={pick ?? ''}
                  disabled={!!outcome}
                  onChange={(e) => setPicks((p) => ({ ...p, [item.id]: e.target.value }))}
                  placeholder="填空，关键词对就行"
                />
              )}

              {outcome && (
                <div className="explain" data-right={right}>
                  {right ? '✓ 对了' : `✗ 不对，正确答案：${item.answer}`}
                  {item.explain && ` · ${item.explain}`}
                </div>
              )}
            </div>
          )
        })}

      {!loading && items.length > 0 && !outcome && (
        <div className="qcard-foot">
          <span className="qhint">{answered}/{items.length} 已答</span>
          <button type="button" className="btn sm" disabled={answered < items.length || submitting} onClick={submit}>
            {submitting ? '判分中…' : '交卷'}
          </button>
        </div>
      )}

      {outcome && (
        <div className="qcard-foot">
          <span className="qdelta" data-up={delta > 0}>
            {Math.round(outcome.score * 100)}%（{outcome.correct}/{items.length}） · 颜色{' '}
            {Math.round(outcome.before * 100)}% → {Math.round(outcome.after * 100)}%
            {delta !== 0 && ` (${delta > 0 ? '+' : ''}${delta})`}
          </span>
          {misses.length > 0 && onAsk && (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => onAsk(`我第 ${items.findIndex((it) => it.id === misses[0].id) + 1} 题答错了，为什么不是那样`)}
            >
              问助教为什么
            </button>
          )}
        </div>
      )}
    </div>
  )
}
