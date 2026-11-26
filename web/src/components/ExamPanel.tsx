'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { judgeBlank } from '@/lib/engine'
import type { Kp } from '@/lib/mock'
import type { QuizItem } from '@/lib/quizbank'

type Props = {
  kps: Kp[]
  now: number
  onClose: () => void
  onGraded: (updated: Kp[]) => void
}

const LETTERS = ['A', 'B', 'C', 'D', 'E']

function scoreItem(item: QuizItem, picked: string | undefined): number {
  if (picked === undefined || picked === '') return 0
  if (item.type === 'single') return picked.trim().toUpperCase() === item.answer.trim().toUpperCase() ? 1 : 0
  if (item.type === 'judge') {
    const norm = (s: string) => (s.includes('对') || s.includes('正确') || s === 'T' ? '对' : '错')
    return norm(picked) === norm(item.answer) ? 1 : 0
  }
  return judgeBlank(picked, item.answer) ? 1 : 0
}

const mmss = (sec: number) => {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function ExamPanel({ kps, now, onClose, onGraded }: Props) {
  const [items, setItems] = useState<QuizItem[]>([])
  const [minutes, setMinutes] = useState(15)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [left, setLeft] = useState(15 * 60)
  const [result, setResult] = useState<{ total: number } | null>(null)
  const [grading, setGrading] = useState(false)
  const submitted = useRef(false)

  const titleOf = useMemo(() => new Map(kps.map((k) => [k.id, k.title])), [kps])

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    setAnswers({})
    setResult(null)
    submitted.current = false
    try {
      const res = await fetch('/api/ai/exam?count=10')
      const data = (await res.json()) as { items?: QuizItem[]; minutes?: number; error?: string }
      if (!res.ok || !data.items || data.items.length === 0) {
        setErr(data.error ?? '抽卷失败')
        return
      }
      setItems(data.items)
      setMinutes(data.minutes ?? 15)
      setLeft((data.minutes ?? 15) * 60)
    } catch {
      setErr('抽卷失败，检查一下后端')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const submit = useCallback(async () => {
    if (submitted.current || items.length === 0) return
    submitted.current = true
    setGrading(true)
    setErr(null)
    try {
      const results = items.map((it) => ({ kpId: it.kpId, score: scoreItem(it, answers[it.id]) }))
      const res = await fetch('/api/quiz/exam', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ results }),
      })
      const data = (await res.json()) as { total?: number; updated?: Kp[]; error?: string }
      if (!res.ok || typeof data.total !== 'number') {
        setErr(data.error ?? '交卷失败')
        submitted.current = false
        return
      }
      setResult({ total: data.total })
      if (data.updated) onGraded(data.updated)
    } catch {
      setErr('交卷失败，检查一下后端')
      submitted.current = false
    } finally {
      setGrading(false)
    }
  }, [answers, items, onGraded])

  // 倒计时：到点自动交卷，演示时不会出现「时间到了还在答题」
  useEffect(() => {
    if (result || loading) return
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [result, loading])

  useEffect(() => {
    if (left === 0 && !result && items.length > 0) void submit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left])

  if (loading) return <p className="exam-note">正在抽卷…</p>

  if (err && items.length === 0) {
    return (
      <div>
        <p className="quizerr">{err}</p>
        <button type="button" className="btn ghost" onClick={onClose}>
          先不考了
        </button>
      </div>
    )
  }

  const answered = Object.keys(answers).length
  const right = items.filter((it) => scoreItem(it, answers[it.id]) === 1).length

  return (
    <div className="exam">
      <div className="exam-head">
        <span className="exam-timer" data-low={left <= 60}>
          ⏱ {mmss(left)}
        </span>
        <span className="cap">
          已答 {answered}/{items.length} · 共 {minutes} 分钟
        </span>
        <button type="button" className="link" onClick={onClose}>
          收起
        </button>
      </div>

      {err && <p className="quizerr">{err}</p>}

      <ol className="exam-list">
        {items.map((it, i) => {
          const picked = answers[it.id]
          const ok = result ? scoreItem(it, picked) === 1 : null
          return (
            <li key={it.id} className="qitem" data-state={result ? (ok ? 'right' : 'wrong') : undefined}>
              <p className="stem">
                <span className="no">{i + 1}</span>
                {it.stem}
                <em className="qfrom">{titleOf.get(it.kpId) ?? ''}</em>
              </p>

              {it.type === 'single' && it.options && (
                <div className="opts">
                  {it.options.map((opt, oi) => {
                    const letter = LETTERS[oi] ?? String(oi + 1)
                    return (
                      <button
                        key={letter}
                        type="button"
                        className="opt"
                        data-picked={picked === letter}
                        disabled={!!result}
                        onClick={() => setAnswers((a) => ({ ...a, [it.id]: letter }))}
                      >
                        <b>{letter}</b>
                        {opt}
                      </button>
                    )
                  })}
                </div>
              )}

              {it.type === 'judge' && (
                <div className="opts">
                  {['对', '错'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="opt"
                      data-picked={picked === v}
                      disabled={!!result}
                      onClick={() => setAnswers((a) => ({ ...a, [it.id]: v }))}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )}

              {it.type === 'blank' && (
                <input
                  className="blank"
                  value={picked ?? ''}
                  disabled={!!result}
                  placeholder="填关键词"
                  onChange={(e) => setAnswers((a) => ({ ...a, [it.id]: e.target.value }))}
                />
              )}

              {result && (
                <p className="explain">
                  {ok ? '✓ ' : '✗ '}
                  正确答案：{it.answer}　{it.explain}
                </p>
              )}
            </li>
          )
        })}
      </ol>

      {!result ? (
        <div className="exam-foot">
          <button type="button" className="btn" disabled={grading || answered === 0} onClick={() => void submit()}>
            {grading ? '判分中…' : `交卷（已答 ${answered}/${items.length}）`}
          </button>
          <span className="cap">没答完也能交，空的算错</span>
        </div>
      ) : (
        <div className="exam-result">
          <b>{result.total} 分</b>
          <span>
            对 {right}/{items.length} · 错题已进错题本
          </span>
          <div className="exam-actions">
            <button type="button" className="btn ghost" onClick={() => void load()}>
              再抽一卷
            </button>
            <button type="button" className="btn" onClick={onClose}>
              回去看冲刺路线
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
