'use client'

import { useMemo } from 'react'
import type { Attempt } from '@/lib/mock'

const W = 320
const H = 136
const PAD_L = 26
const PAD_B = 20
const PAD_T = 10
const PAD_R = 8
const MAX_DAYS = 14

type DayPoint = { key: string; at: number; avg: number; n: number }

const dayKey = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/**
 * 按「天」聚合，而不是按「一次作答」画点。
 *
 * 原因：一次整卷会同时写入 10 条作答，按次画就会在同一个 x 上出现 10 个点（100 和 0 交替），
 * 折线变成锯齿。按天取平均之后，看到的才是「这一天整体水平」。
 */
export default function ScoreChart({ attempts }: { attempts: Attempt[]; now: number }) {
  const days = useMemo(() => {
    const acc = new Map<string, { key: string; at: number; sum: number; n: number }>()
    for (const a of attempts) {
      const key = dayKey(a.at)
      const cur = acc.get(key) ?? { key, at: 0, sum: 0, n: 0 }
      cur.sum += a.score
      cur.n += 1
      cur.at = Math.max(cur.at, a.at)
      acc.set(key, cur)
    }
    return [...acc.values()]
      .map((d): DayPoint => ({ key: d.key, at: d.at, n: d.n, avg: d.sum / d.n }))
      .sort((x, y) => x.at - y.at)
      .slice(-MAX_DAYS)
  }, [attempts])

  const total = attempts.length

  const { path, area, dots, trend } = useMemo(() => {
    if (days.length === 0) {
      return { path: '', area: '', dots: [] as Array<{ x: number; y: number; d: DayPoint }>, trend: null as null | number }
    }
    const xOf = (i: number) =>
      days.length === 1
        ? PAD_L + (W - PAD_L - PAD_R) / 2
        : PAD_L + (i / (days.length - 1)) * (W - PAD_L - PAD_R)
    const yOf = (s: number) => PAD_T + (1 - s) * (H - PAD_T - PAD_B)
    const base = H - PAD_B

    const d = days.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(p.avg).toFixed(1)}`).join(' ')
    const ds = days.map((p, i) => ({ x: xOf(i), y: yOf(p.avg), d: p }))
    const lastX = xOf(days.length - 1).toFixed(1)
    const firstX = xOf(0).toFixed(1)

    const half = Math.floor(days.length / 2)
    const avg = (arr: DayPoint[]) => arr.reduce((s, p) => s + p.avg, 0) / (arr.length || 1)
    const t = days.length >= 4 ? avg(days.slice(half)) - avg(days.slice(0, half)) : null

    return { path: d, area: `${d} L ${lastX} ${base} L ${firstX} ${base} Z`, dots: ds, trend: t }
  }, [days])

  const last = days[days.length - 1]

  return (
    <div className="score">
      <div className="score-top">
        <b>{last ? `最近一天平均 ${Math.round(last.avg * 100)}%` : '还没有记录'}</b>
        {total > 0 && (
          <span className="cap">
            共 {total} 次 · {days.length} 天
          </span>
        )}
      </div>

      {days.length === 0 ? (
        <div className="empty">还没有做题记录。</div>
      ) : (
        <div className="chart-wrap">
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="成绩折线">
            <defs>
              <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--kp-full)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--kp-full)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {[0, 0.5, 1].map((g) => (
              <g key={g}>
                <line
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={PAD_T + (1 - g) * (H - PAD_T - PAD_B)}
                  y2={PAD_T + (1 - g) * (H - PAD_T - PAD_B)}
                  stroke="currentColor"
                  opacity={0.12}
                  strokeDasharray={g === 0 ? '' : '3 4'}
                />
                <text
                  x={2}
                  y={PAD_T + (1 - g) * (H - PAD_T - PAD_B) + 3}
                  fontSize={9}
                  fill="currentColor"
                  opacity={0.45}
                >
                  {Math.round(g * 100)}
                </text>
              </g>
            ))}

            <path d={area} fill="url(#scoreFill)" />
            <path
              d={path}
              fill="none"
              stroke="var(--kp-full)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {dots.map(({ x, y, d }, i) => (
              <circle key={i} cx={x} cy={y} r={3.4} fill="var(--kp-full)" stroke="var(--card)" strokeWidth={1.6}>
                <title>{`${d.key} 平均 ${Math.round(d.avg * 100)}%（${d.n} 次）`}</title>
              </circle>
            ))}
          </svg>
        </div>
      )}
    </div>
  )
}
