'use client'

import { useMemo } from 'react'
import type { Kp } from '@/lib/mock'
import { PACE_LABEL, modeRows } from '@/lib/modes'
import type { Pace } from '@/lib/plan'

/**
 * 三种排法的对照：一行一个模式，只显示它排出来的第一条。
 *
 * 目的不是展示三列长列表，是让人一眼看到「换一种排法，第一件事就变了」。
 * 点一行 = 切换到那种排法。
 */

const ORDER: Pace[] = ['full', 'sprint', 'fragment']

export default function ModeCompare({
  kps,
  now,
  pace,
  examAt,
  onPace,
}: {
  kps: Kp[]
  now: number
  pace: Pace
  examAt: number
  onPace: (p: Pace) => void
}) {
  const rows = useMemo(
    () =>
      ORDER.map((p) => ({
        pace: p,
        label: PACE_LABEL[p],
        top: modeRows(kps, now, p, examAt, 1)[0] ?? null,
      })),
    [kps, now, examAt],
  )

  return (
    <section className="card modes">
      <div className="card-head">
        <h2>换一种排法</h2>
        <p className="cap">点一行切换</p>
      </div>
      <ul className="mode-rows">
        {rows.map((r) => (
          <li key={r.pace}>
            <button
              type="button"
              className="mode-line"
              data-on={r.pace === pace}
              onClick={() => onPace(r.pace)}
            >
              <span className="mode-name">{r.label}</span>
              <span className="mode-top">{r.top?.title ?? '暂时没有'}</span>
              <span className="mode-meta">{r.top?.meta ?? ''}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
