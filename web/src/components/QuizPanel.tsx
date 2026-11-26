'use client'

import { useCallback, useEffect, useState } from 'react'
import { strength } from '@/lib/color'
import type { Kp, Attempt } from '@/lib/mock'
import type { Pace } from '@/lib/plan'
import { judgeBlank, scoreOfAnswers } from '@/lib/engine'
import type { QuizItem } from '@/lib/quizbank'

type Props = {
  kp: Kp
  mode: Pace
  onGraded: (kp: Kp, attempts: Attempt[]) => void
  onClose: () => void
}

type Outcome = { score: number; before: number; after: number; correct: number }

/**
 * 「考我 3 题」——整个演示的闭环就在这一个组件里：
 * 出题 → 作答 → 交卷 → 把得分写成证据 → 颜色当场变。
 * 题目优先拿预生成缓存（零延迟、断网可演示），「再来一组」才实时调模型。
 */
export default function QuizPanel({ kp, mode, onGraded, onClose }: Props) {
  const [items, setItems] = useState<QuizItem[]>([])
  const [source, setSource] = useState<'cache' | 'ai' | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [freshKey, setFreshKey] = useState(0)
  const [fresh, setFresh] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    setItems([])
    setPicks({})
    setOutcome(null)

    const url = `/api/ai/quiz?kpId=${encodeURIComponent(kp.id)}${fresh ? '&fresh=1' : ''}`
    fetch(url)
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
  }, [kp.id, fresh, freshKey])

  const grade = useCallback(
    (item: QuizItem): boolean => {
      const pick = picks[item.id]
      if (!pick) return false
      if (item.type === 'blank') return judgeBlank(pick, item.answer)
      return pick === item.answer
    },
    [picks],
  )

  const answeredAll = items.length > 0 && items.every((it) => (picks[it.id] ?? '').length > 0)

  async function submit() {
    if (!answeredAll || submitting) return
    setSubmitting(true)
    const results = items.map((it) => ({ correct: grade(it) }))
    const score = scoreOfAnswers(results)
    const before = strength(kp.state, Date.now())

    try {
      const res = await fetch('/api/quiz/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kpId: kp.id, score, mode, note: `${results.length} 题自测，对 ${results.filter((r) => r.correct).length} 题` }),
      })
      const data = (await res.json()) as { kp?: Kp; attempts?: Attempt[]; error?: string }
      if (!res.ok || !data.kp) throw new Error(data.error || `HTTP ${res.status}`)
      const after = strength(data.kp.state, Date.now())
      setOutcome({ score, before, after, correct: results.filter((r) => r.correct).length })
      onGraded(data.kp, data.attempts ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const delta = outcome ? Math.round((outcome.after - outcome.before) * 100) : 0

  return (
    <div className="card quiz">
      <div className="quizhead">
        <h2>考我 3 题</h2>
        <button type="button" className="link" onClick={onClose}>
          收起
        </button>
      </div>
      <div className="detail-title" style={{ marginBottom: 12 }}>
        <h3>{kp.title}</h3>
        <div className="sub">
          {source === 'cache' ? '题库' : source === 'ai' ? '新出的题' : '出题中'}
          {mode !== 'full' &&
            ` · 按「${mode === 'sprint' ? '期末冲刺' : '碎片'}」记录，对长期掌握的加分打折`}
        </div>
      </div>

      {loading && <div className="empty">出题中…（直连 DeepSeek，通常 1–3 秒）</div>}

      {error && (
        <div className="quizerr">
          {error}
          <button type="button" className="link" onClick={() => setFreshKey((k) => k + 1)}>
            重试
          </button>
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
                    const chosen = pick === letter
                    const mark = outcome ? (letter === item.answer ? 'right' : chosen ? 'wrong' : undefined) : undefined
                    return (
                      <button
                        key={letter}
                        type="button"
                        className="opt"
                        data-picked={chosen}
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
        <div className="quizfoot">
          <button type="button" className="btn" disabled={!answeredAll || submitting} onClick={submit}>
            {submitting ? '判分中…' : answeredAll ? '交卷' : `还有 ${items.filter((it) => !picks[it.id]).length} 题没答`}
          </button>
        </div>
      )}

      {outcome && (
        <div className="result">
          <div className="row">
            <span>这次得分</span>
            <b>{Math.round(outcome.score * 100)}%（{outcome.correct}/{items.length}）</b>
          </div>
          <div className="row">
            <span>颜色</span>
            <b>
              {Math.round(outcome.before * 100)}% → {Math.round(outcome.after * 100)}%
              {delta !== 0 && <span className="delta" data-up={delta > 0}>{delta > 0 ? ` +${delta}` : ` ${delta}`}</span>}
            </b>
          </div>
          <div className="hint">
            答对会拉长复习间隔，答错会更早再考一次。
          </div>
          <div className="quizfoot">
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setFresh(true)
                setFreshKey((k) => k + 1)
              }}
            >
              再来一组
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
