'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { strength, statusOf } from '@/lib/color'
import type { Attempt, Kp } from '@/lib/mock'
import type { Pace } from '@/lib/plan'
import QuizCard from './QuizCard'

type Props = {
  kp: Kp
  now: number
  mode: Pace
  /** 上一级（章）的标题，用于面包屑 */
  parentTitle?: string
  onGraded: (kp: Kp, attempts: Attempt[]) => void
  onOpenPractice: () => void
}

type Msg =
  | { id: string; role: 'tutor' | 'me'; text: string }
  | { id: string; role: 'quiz'; fresh: boolean }

let seq = 0
const uid = () => `m${++seq}`

const OPENERS = (kp: Kp, pct: number): Msg[] => [
  {
    id: uid(),
    role: 'tutor',
    text: `「${kp.title}」现在 ${pct}%。要我讲一遍，还是先考三题？`,
  },
]

/** 掌握路径的学习界面：左边是这一轮的目标，中间是对话，出题是对话里的一张卡片。 */
export default function ChatPanel({ kp, now, mode, parentTitle, onGraded, onOpenPractice }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const scroller = useRef<HTMLDivElement | null>(null)

  const pct = Math.round(strength(kp.state, now) * 100)
  const st = statusOf(kp.state, now)

  // 换考点或拨时间才重开对话；得分变化不能清空，否则刚交完卷的结果会被抹掉
  useEffect(() => {
    setMsgs(OPENERS(kp, Math.round(strength(kp.state, now) * 100)))
    setDraft('')
  }, [kp.id, now])

  // 掌握度变了，但对话还停在开场白时，顺手把这句里的百分比刷新一下
  useEffect(() => {
    setMsgs((cur) => (cur.length <= 1 ? OPENERS(kp, pct) : cur))
  }, [pct])

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs, busy])

  const ask = useCallback(
    async (text: string, history?: Msg[]) => {
      const question = text.trim()
      if (!question || busy) return
      const base = history ?? msgs
      const mine: Msg = { id: uid(), role: 'me', text: question }
      const next = [...base, mine]
      setMsgs(next)
      setDraft('')
      setBusy(true)

      const turns = next
        .filter((m): m is Extract<Msg, { role: 'tutor' | 'me' }> => m.role !== 'quiz')
        .map((m) => ({ role: m.role, text: m.text }))

      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kpId: kp.id, turns }),
        })
        const data = (await res.json()) as { reply?: string; error?: string }
        if (!res.ok || !data.reply) throw new Error(data.error || `HTTP ${res.status}`)
        setMsgs((prev) => [...prev, { id: uid(), role: 'tutor', text: data.reply as string }])
      } catch (err) {
        setMsgs((prev) => [
          ...prev,
          {
            id: uid(),
            role: 'tutor',
            text: `（没连上模型：${err instanceof Error ? err.message : String(err)}）\n检查 web/.env.local 里的 AI_API_KEY，或者先直接做题。`,
          },
        ])
      } finally {
        setBusy(false)
      }
    },
    [busy, kp.id, msgs],
  )

  const askQuiz = useCallback(() => {
    setMsgs((prev) => [...prev, { id: uid(), role: 'quiz', fresh: false }])
  }, [])

  return (
    <section className="study">
      <header className="study-head">
        <div>
          <div className="crumb">
            <span>{parentTitle ?? '考点'}</span>
            <span className="sep">/</span>
            <span>{kp.title}</span>
          </div>
          <h2>{kp.title}</h2>
          {kp.note && <p className="study-note">{kp.note}</p>}
        </div>
        <div className="study-meta">
          <div className="ring sm" data-band={pct >= 80 ? 'solid' : pct >= 50 ? 'half' : pct > 0 ? 'low' : 'void'}>
            <b>{st === 'new' ? '—' : `${pct}%`}</b>
          </div>
          <span className="meta-line">{st === 'new' ? '没学过' : st === 'due' ? '该复习' : '还记得'}</span>
        </div>
      </header>

      <div className="transcript" ref={scroller}>
        {msgs.map((m) =>
          m.role === 'quiz' ? (
            <div className="turn tutor" key={m.id}>
              <QuizCard kp={kp} mode={mode} fresh={m.fresh} onGraded={onGraded} onAsk={(t) => ask(t)} />
            </div>
          ) : (
            <div className={`turn ${m.role}`} key={m.id}>
              <div className="bubble">
                {m.text
                  .split('\n')
                  .filter((line) => line.trim() !== '')
                  .map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
              </div>
            </div>
          ),
        )}
        {msgs.length === 1 && !busy && (
          <div className="starters">
            {['最容易考什么？', '它和前后什么关系？', '给个能记住的类比'].map((q) => (
              <button key={q} type="button" className="starter" onClick={() => void ask(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
        {busy && (
          <div className="turn tutor">
            <div className="bubble typing">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
      </div>

      <div className="composer">
        <div className="composer-box">
          <textarea
            value={draft}
            rows={1}
            placeholder={`问点具体的，比如「${kp.title}为什么重要」`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void ask(draft)
              }
            }}
          />
          <div className="composer-tools">
            <button type="button" className="chipbtn" onClick={() => ask('先把这条讲一遍，讲人话，别背课文')} disabled={busy}>
              讲一遍
            </button>
            <button type="button" className="chipbtn" onClick={askQuiz} disabled={busy}>
              考我 3 题
            </button>
            <button type="button" className="chipbtn" onClick={onOpenPractice} disabled={busy}>
              整套练习
            </button>
            <button type="button" className="send" onClick={() => void ask(draft)} disabled={busy || !draft.trim()}>
              ↑
            </button>
          </div>
        </div>
        <p className="composer-hint">Enter 发送 · Shift+Enter 换行 · 生成内容可能有误，以课本为准</p>
      </div>
    </section>
  )
}
