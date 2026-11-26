'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import ChatPanel from '@/components/ChatPanel'
import DayPlan from '@/components/DayPlan'
import KnowledgeMap from '@/components/KnowledgeMap'
import QuizPanel from '@/components/QuizPanel'
import ScoreChart from '@/components/ScoreChart'
import Sidebar from '@/components/Sidebar'
import SprintBoard from '@/components/SprintBoard'
import Reader from '@/components/Reader'
import ModeCompare from '@/components/ModeCompare'
import type { View } from '@/components/Sidebar'
import { DAY_MS, daysUntilDue, statusOf, strength } from '@/lib/color'
import type { Evidence } from '@/lib/engine'
import { COURSE_TITLE, makeAttempts, makeCourse } from '@/lib/mock'
import type { Attempt, Kp } from '@/lib/mock'
import type { Pace } from '@/lib/plan'
import { buildDay, type SchedItem } from '@/lib/plan'
import { PACE_LABEL, modeRows } from '@/lib/modes'


const VIEW_TITLE: Record<View, { title: string; hint?: string }> = {
  home: { title: '今天' },
  study: { title: '学习' },
  outline: { title: '地图' },
  practice: { title: '练习' },
  sprint: { title: '冲刺' },
  fragment: { title: '阅读' },
  calendar: { title: '日历' },
}

const fmtDay = (ms: number) =>
  new Date(ms).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })


/** 到期文案：逾期 / 今天 / 还有几天，三处列表与 hero 共用，避免出现「逾期 0 天」。 */
function dueText(state: Kp['state'], now: number): string {
  const d = daysUntilDue(state, now)
  if (d === null) return '还没学'
  const days = Math.round(d)
  if (days < 0) return `逾期 ${Math.max(1, -days)} 天`
  if (days === 0) return '今天到期'
  return `${days} 天后`
}

/** 排「今晚先做什么」用的分值：逾期越久越急，没学过的其次，再按考频加权。 */
const nextUpScore = (k: Kp, now: number) => {
  const st = statusOf(k.state, now)
  const overdue = Math.max(0, -(daysUntilDue(k.state, now) ?? 0))
  const base = st === 'due' ? 100 + overdue * 4 : st === 'new' ? 60 : 10 - strength(k.state, now) * 10
  return base + k.importance * 6
}

export default function Page() {
  const [base, setBase] = useState<number | null>(null)
  const [offset, setOffset] = useState(0)
  const [pace, setPace] = useState<Pace>('full')
  const [view, setView] = useState<View>('home')
  const [selected, setSelected] = useState<string | null>('wusi')

  const [remote, setRemote] = useState<{ kps: Kp[]; attempts: Attempt[] } | null>(null)
  const [examAt, setExamAt] = useState<number | null>(null)
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => setBase(Date.now()), [])

  // 支持 ?view=study 这种深链：演示时可以直接打开某一屏，也方便截图核对
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('view')
    if (
      v === 'home' ||
      v === 'study' ||
      v === 'outline' ||
      v === 'practice' ||
      v === 'sprint' ||
      v === 'fragment' ||
      v === 'calendar'
    )
      setView(v)
    // ?pace=sprint 同理：截三种排法时不用手点下拉框
    const p = new URLSearchParams(window.location.search).get('pace')
    if (p === 'full' || p === 'sprint' || p === 'fragment') setPace(p)
  }, [])

  useEffect(() => {
    let alive = true
    fetch('/api/state')
      .then((r) => r.json())
      .then((d: { kps?: Kp[]; attempts?: Attempt[]; examAt?: number; evidence?: Evidence[] }) => {
        if (!alive || !Array.isArray(d.kps) || d.kps.length === 0) return
        setRemote({ kps: d.kps, attempts: d.attempts ?? [] })
        if (typeof d.examAt === 'number') setExamAt(d.examAt)
        if (Array.isArray(d.evidence)) setEvidence(d.evidence)
      })
      .catch(() => {
        if (alive) setNote('后端没响应，先用内置样例演示（改动不会落盘）')
      })
    return () => {
      alive = false
    }
  }, [])

  const fallbackKps = useMemo(() => (base === null ? [] : makeCourse(base)), [base])
  const fallbackAttempts = useMemo(() => (base === null ? [] : makeAttempts(base)), [base])
  const kps = remote?.kps ?? fallbackKps
  const attempts = remote?.attempts ?? fallbackAttempts

  const onGraded = useCallback((kp: Kp, nextAttempts: Attempt[]) => {
    setRemote((prev) =>
      prev ? { kps: prev.kps.map((k) => (k.id === kp.id ? kp : k)), attempts: nextAttempts } : prev,
    )
  }, [])

  const pick = useCallback((id: string) => {
    setSelected(id)
    setView('study')
  }, [])

  async function doReset() {
    const res = await fetch('/api/state/reset', { method: 'POST' })
    const data = (await res.json()) as { kps?: Kp[]; attempts?: Attempt[]; examAt?: number }
    if (data.kps) setRemote({ kps: data.kps, attempts: data.attempts ?? [] })
    setOffset(0)
    setView('home')
    setNote('已重置到演示初始状态')
  }

  /** 整卷交完：一次回来好几个考点的新状态，一起替换 */
  const onExamGraded = useCallback((updated: Kp[]) => {
    setRemote((prev) => {
      if (!prev) return prev
      const byId = new Map(updated.map((k) => [k.id, k]))
      return { ...prev, kps: prev.kps.map((k) => byId.get(k.id) ?? k) }
    })
    // 颜色变了，但错题本要重新拉一次证据才准
    fetch('/api/state')
      .then((r) => r.json())
      .then((d: { evidence?: Evidence[]; attempts?: Attempt[] }) => {
        if (Array.isArray(d.evidence)) setEvidence(d.evidence)
        if (Array.isArray(d.attempts)) setRemote((prev) => (prev ? { ...prev, attempts: d.attempts! } : prev))
      })
      .catch(() => {})
  }, [])

  if (base === null) {
    return (
      <div className="boot">
        <span className="boot-mark" />
        <span>正在铺开地图…</span>
      </div>
    )
  }

  const now = base + offset * DAY_MS
  // 考试日期没拿到就用「12 天后」，保证冲刺页永远有东西看
  const examAtMs = examAt ?? base + 12 * DAY_MS
  // 叶子 = 没有下级的考点（编/章只是分组容器，不能拿来算颜色和排期）
  const leaves = kps.filter((k) => !kps.some((o) => o.parent === k.id))
  const selectedKp = kps.find((k) => k.id === selected) ?? leaves[0] ?? kps[0]

  // 「今晚第一件事」：跟着当前模式走 —— 长期救快忘的、冲刺补最亏的、碎片给一个短块
  const heroRows = modeRows(kps, now, pace, examAtMs, 3)
  const heroTop = heroRows[0] ?? null
  const heroKp = (heroTop ? leaves.find((k) => k.id === heroTop.kpId) : null) ?? null
  const nextUp = heroKp ?? [...leaves].sort((a, b) => nextUpScore(b, now) - nextUpScore(a, now))[0] ?? null
  const heroReason = heroTop?.reason ?? null

  const counts = kps.reduce(
    (acc, k) => {
      const st = statusOf(k.state, now)
      if (st === 'new') acc.never += 1
      else if (st === 'due') acc.due += 1
      else acc.ok += 1
      if (strength(k.state, now) >= 0.8) acc.solid += 1
      return acc
    },
    { never: 0, due: 0, ok: 0, solid: 0 },
  )

  const overdueDays = (k: Kp) => {
    const d = daysUntilDue(k.state, now)
    return d === null ? -1e6 : -d
  }

  const dueList = leaves
    .filter((k) => statusOf(k.state, now) === 'due' || statusOf(k.state, now) === 'new')
    .sort((a, b) => overdueDays(b) - overdueDays(a))
    .slice(0, 6)

  return (
    <div className="app">
      <Sidebar
        kps={kps}
        now={now}
        view={view}
        selectedId={selectedKp?.id ?? null}
        onView={setView}
        onSelect={pick}
        onReset={doReset}
      />

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{VIEW_TITLE[view].title}</h1>
            <p>{VIEW_TITLE[view].hint}</p>
          </div>

          <div className="travel-mini">
            <span className="when-mini">
              {offset === 0 ? '今天' : offset > 0 ? `${offset} 天后` : `${-offset} 天前`}
              <em>{fmtDay(now)}</em>
            </span>
            <input
              type="range"
              min={-30}
              max={30}
              step={1}
              value={offset}
              aria-label="时间旅行"
              onChange={(e) => setOffset(Number(e.target.value))}
            />
            <button type="button" className="link" disabled={offset === 0} onClick={() => setOffset(0)}>
              回今天
            </button>
          </div>
        </header>

        {note && <div className="banner">{note}</div>}

        {view === 'home' && (
          <div className="home">
            <section className="hero">
              <div className="hero-main">
                <div className="hero-tag">接下来 {Math.min(nextUp?.estMinutes ?? 15, 15)} 分钟</div>
                {nextUp ? (
                  <>
                    <h2>{nextUp.title}</h2>
                    <p className="hero-why">
                      {heroReason ?? `${dueText(nextUp.state, now)}，现在 ${Math.round(strength(nextUp.state, now) * 100)}%`}
                    </p>
                    <div className="hero-actions">
                      <button type="button" className="btn" onClick={() => nextUp && pick(nextUp.id)}>
                        开始 · {Math.min(nextUp.estMinutes, 15)} 分钟
                      </button>
                      <button type="button" className="btn ghost" onClick={() => setView('outline')}>
                        看全图
                      </button>
                    </div>
                  </>
                ) : (
                  <p>这门课已经全部过完。</p>
                )}
              </div>

              {nextUp && (
                <div className="hero-side">
                  <div>
                    <span>记得多少</span>
                    <b>{Math.round(strength(nextUp.state, now) * 100)}%</b>
                  </div>
                  <div>
                    <span>下次复习</span>
                    <b>{statusOf(nextUp.state, now) === 'new' ? '还没学' : dueText(nextUp.state, now)}</b>
                  </div>
                  <div>
                    <span>用时</span>
                    <b>{Math.min(nextUp.estMinutes, 15)} 分钟</b>
                  </div>
                </div>
              )}
            </section>

            <ModeCompare kps={kps} now={now} pace={pace} examAt={examAtMs} onPace={setPace} />

            <div className="home-cols">
              <DayPlan kps={kps} now={now} pace={pace} />

              <section className="card">
                <div className="card-head">
                  <h2>成绩</h2>
                  <p className="cap">每天的平均分</p>
                </div>
                <ScoreChart attempts={attempts} now={now} />
              </section>
            </div>
          </div>
        )}

        {view === 'study' && selectedKp && (
          <ChatPanel
                  kp={selectedKp}
                  now={now}
                  mode={pace}
                  parentTitle={kps.find((k) => k.id === selectedKp.parent)?.title}
                  onGraded={onGraded}
                  onOpenPractice={() => setView('practice')}
                />
        )}

        {view === 'outline' && (
          <section className="card map-card">
            <div className="card-head">
              <div>
                <h2>颜色越深，记得越牢</h2>
                <p className="cap">点一块进去学 · 虚线是还没学 · 红环是到期了</p>
              </div>
              <p className="cap">{leaves.length} 个考点</p>
            </div>
            <KnowledgeMap kps={kps} now={now} selectedId={selectedKp?.id ?? null} onSelect={pick} />
          </section>
        )}

        {view === 'practice' && selectedKp && (
          <div className="practice">
            <div className="practice-bar">
              <span>
                正在练：<b>{selectedKp.title}</b>
              </span>
              <span className="cap">3 题 · 交卷后颜色当场变</span>
            </div>
            <QuizPanel kp={selectedKp} mode={pace} onGraded={onGraded} onClose={() => setView('study')} />
          </div>
        )}

        {view === 'sprint' && (
          <SprintBoard
            kps={kps}
            now={now}
            examAt={examAtMs}
            evidence={evidence}
            onExamAt={setExamAt}
            onPick={pick}
            onGraded={onExamGraded}
          />
        )}

        {view === 'fragment' && <Reader />}

      </main>
    </div>
  )
}
