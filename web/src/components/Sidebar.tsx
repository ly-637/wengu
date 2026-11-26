'use client'

import { useState } from 'react'
import { statusOf, strength } from '@/lib/color'
import { COURSE_TITLE } from '@/lib/mock'
import type { Kp } from '@/lib/mock'

export type View = 'home' | 'study' | 'outline' | 'practice' | 'sprint' | 'fragment' | 'calendar'

const NAV: Array<{ key: View; label: string }> = [
  { key: 'home', label: '今天' },
  { key: 'outline', label: '地图' },
  { key: 'practice', label: '练习' },
  { key: 'sprint', label: '冲刺' },
  { key: 'fragment', label: '阅读' },
]

type Props = {
  kps: Kp[]
  now: number
  view: View
  selectedId: string | null
  onView: (v: View) => void
  onSelect: (id: string) => void
  onReset: () => void
}

export default function Sidebar({ kps, now, view, selectedId, onView, onSelect, onReset }: Props) {
  // 考点树默认收着：28 个点全摊开会把侧栏挤爆，展开哪章由用户决定
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }))
  // 章 = 有下级的节点（编之下）；叶子才算一个真正的考点
  const chapters = kps.filter((k) => k.parent !== null && kps.some((o) => o.parent === k.id))
  const pointsOf = (id: string) => kps.filter((k) => k.parent === id)
  const leafCount = kps.filter((k) => !kps.some((o) => o.parent === k.id)).length
  const due = kps.filter((k) => statusOf(k.state, now) === 'due').length
  const done = kps.filter((k) => !kps.some((o) => o.parent === k.id) && strength(k.state, now) >= 0.8).length

  return (
    <aside className="side">
      <div className="side-top">
        <div className="ws">
          <span className="ws-mark" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M5 7v6.2A3.8 3.8 0 0 0 8.8 17H19" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <circle cx="5" cy="5.4" r="2.1" fill="currentColor" />
              <circle cx="19" cy="17" r="2.1" fill="currentColor" />
            </svg>
          </span>
          <div className="ws-text">
            <b>温故</b>
            <span>{COURSE_TITLE}</span>
          </div>
        </div>

        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.key} type="button" className="nav-item" data-on={view === n.key} onClick={() => onView(n.key)}>
              <span>{n.label}</span>
              {n.key === 'home' && due > 0 && <em className="pill">{due}</em>}
              {n.key === 'outline' && <em className="pill quiet">{done}/{leafCount}</em>}
            </button>
          ))}
        </nav>
      </div>

      <div className="side-list">
        <div className="side-label">考点</div>
        {chapters.map((ch) => {
          const isOpen = open[ch.id] ?? false
          return (
            <div className="side-group" key={ch.id}>
              <button
                type="button"
                className="side-chap"
                data-on={selectedId === ch.id}
                data-open={isOpen}
                onClick={() => toggle(ch.id)}
              >
                <span className="chev" aria-hidden="true">
                  {isOpen ? '−' : '+'}
                </span>
                {ch.title.replace(/^第[一二三四五六七八九十]+章\s*/, '')}
              </button>
              {isOpen &&
                pointsOf(ch.id).map((p) => {
                  const s = statusOf(p.state, now)
                  const pct = Math.round(strength(p.state, now) * 100)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="side-point"
                      data-on={selectedId === p.id}
                      data-due={s === 'due'}
                      data-new={s === 'new'}
                      title={`${p.title} · ${pct}%`}
                      onClick={() => onSelect(p.id)}
                    >
                      <i className="dot" data-strength={Math.round(pct / 20)} />
                      <span>{p.title}</span>
                    </button>
                  )
                })}
            </div>
          )
        })}
      </div>

      <div className="side-foot">
        <button type="button" className="side-reset" onClick={onReset}>
          重置演示数据
        </button>
      </div>
    </aside>
  )
}
