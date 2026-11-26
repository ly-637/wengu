'use client'

import { bandOf, colorOf, statusOf, strength } from '@/lib/color'
import type { Kp } from '@/lib/mock'

type Group = { root: Kp; chapters: Array<{ kp: Kp; points: Kp[] }> }

/** 把扁平列表收成 编 → 章 → 考点 三层 */
function group(kps: Kp[]): Group[] {
  const kids = (id: string) => kps.filter((k) => k.parent === id)
  return kps
    .filter((k) => k.parent === null)
    .map((root) => ({
      root,
      chapters: kids(root.id).map((kp) => ({ kp, points: kids(kp.id) })),
    }))
}

type Props = {
  kps: Kp[]
  now: number
  selectedId: string | null
  onSelect: (id: string) => void
}

/**
 * 泳道式知识地图：每章一行，右边横排这一章的考点。
 * 比纵向大树更适合投影 —— 8 章一屏放得下，颜色深浅一眼可比。
 */
export default function KnowledgeMap({ kps, now, selectedId, onSelect }: Props) {
  const groups = group(kps)

  const nodeProps = (kp: Kp) => {
    const v = strength(kp.state, now)
    const isNew = kp.state.lastReviewAt === null
    return {
      onClick: () => onSelect(kp.id),
      'data-new': isNew,
      'data-due': statusOf(kp.state, now) === 'due',
      'data-selected': selectedId === kp.id,
      title: `${kp.title} · ${isNew ? '未学' : bandOf(v)} · ${Math.round(v * 100)}%`,
      style: { background: isNew ? undefined : colorOf(v) },
    }
  }

  return (
    <div className="map">
      {groups.map(({ root, chapters }) => {
        const rv = strength(root.state, now)
        const rNew = root.state.lastReviewAt === null
        return (
          <div className="lane-group" key={root.id}>
            <div className="lane-head">
              <button
                type="button"
                className="root-node"
                onClick={() => onSelect(root.id)}
                data-new={rNew}
                data-selected={selectedId === root.id}
                style={{ borderLeftColor: rNew ? undefined : colorOf(rv) }}
                title={`${root.title} · ${rNew ? '未学' : bandOf(rv)}`}
              >
                <span className="rt">{root.title}</span>
                <span className="rv">{rNew ? '未学' : `${Math.round(rv * 100)}%`}</span>
              </button>
              <span className="lane-count">{chapters.length} 章</span>
            </div>

            <div className="lanes">
              {chapters.map(({ kp, points }) => (
                <div className="lane" key={kp.id}>
                  <button key={kp.id} type="button" className="node chap" {...nodeProps(kp)}>
                    <span className="t">{kp.title}</span>
                    <span className="v">
                      {kp.state.lastReviewAt === null ? '未学' : `${Math.round(strength(kp.state, now) * 100)}% · ${bandOf(strength(kp.state, now))}`}
                    </span>
                  </button>

                  <div className="lane-points">
                    {points.map((p) => {
                      const pv = strength(p.state, now)
                      return (
                        <button key={p.id} type="button" className="node leaf" {...nodeProps(p)}>
                          <span className="t">{p.title}</span>
                          <span className="v">{p.state.lastReviewAt === null ? '未学' : `${Math.round(pv * 100)}%`}</span>
                        </button>
                      )
                    })}
                    {points.length === 0 && <span className="empty">这一章还没拆考点</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      <div className="legend">
        <span>不会</span>
        <span className="bar" />
        <span>很熟</span>
        <span className="sep" />
        <span>
          <i className="key dashed" />
          虚线 = 还没学
        </span>
        <span>
          <i className="key ring" />
          红环 = 到期
        </span>
      </div>
    </div>
  )
}
