'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Annotation, Doc, ReadQuestion, Segment } from '@/lib/docs'
import { docProgress } from '@/lib/docs'

type DocSummary = {
  id: string
  title: string
  createdAt: number
  progress: { read: number; total: number; pct: number }
}

const KIND_LABEL: Record<Annotation['kind'], string> = {
  exam: '易考',
  confuse: '易混',
  term: '术语',
  mine: '我的',
}

function splitByQuotes(text: string, anns: Annotation[]) {
  const hits: Array<{ start: number; end: number; kind: Annotation['kind'] }> = []
  for (const a of anns) {
    const start = text.indexOf(a.quote)
    if (start >= 0) hits.push({ start, end: start + a.quote.length, kind: a.kind })
  }
  hits.sort((x, y) => x.start - y.start)
  const out: Array<{ text: string; kind?: Annotation['kind'] }> = []
  let cursor = 0
  for (const h of hits) {
    if (h.start < cursor) continue
    if (h.start > cursor) out.push({ text: text.slice(cursor, h.start) })
    out.push({ text: text.slice(h.start, h.end), kind: h.kind })
    cursor = h.end
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) })
  return out
}

export default function Reader() {
  const [docs, setDocs] = useState<DocSummary[]>([])
  const [doc, setDoc] = useState<Doc | null>(null)
  const [segId, setSegId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<'load' | 'save' | 'ann' | 'fey' | 'quiz' | null>('load')
  const [note, setNote] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // 费曼
  const [speech, setSpeech] = useState('')
  const [judge, setJudge] = useState<{ score: number; missing: string[]; followUp: string } | null>(null)
  // 小测
  const [questions, setQuestions] = useState<ReadQuestion[]>([])
  const [picked, setPicked] = useState<Record<number, string>>({})
  const [quizDone, setQuizDone] = useState<{ right: number; total: number } | null>(null)
  // 划线
  const [marking, setMarking] = useState<string | null>(null)
  const [markNote, setMarkNote] = useState('')
  const paperRef = useRef<HTMLDivElement | null>(null)

  const seg: Segment | null = useMemo(
    () => doc?.segments.find((s) => s.id === segId) ?? doc?.segments[0] ?? null,
    [doc, segId],
  )

  const refreshList = useCallback(async () => {
    const res = await fetch('/api/docs', { cache: 'no-store' })
    const data = (await res.json()) as { docs: DocSummary[] }
    setDocs(data.docs ?? [])
    return data.docs ?? []
  }, [])

  const openDoc = useCallback(async (id: string) => {
    setBusy('load')
    setErr(null)
    try {
      const res = await fetch(`/api/docs/${id}`, { cache: 'no-store' })
      const data = (await res.json()) as { doc?: Doc; error?: string }
      if (!res.ok || !data.doc) throw new Error(data.error ?? '打不开这篇读本')
      setDoc(data.doc)
      setSegId(data.doc.segments[0]?.id ?? null)
      setCreating(false)
      setJudge(null)
      setQuestions([])
      setPicked({})
      setQuizDone(null)
      setSpeech('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      const list = await refreshList()
      setBusy(null)
      // ?new=1 直接停在上传页（演示时先说「粘一段讲义进来」）
      if (new URLSearchParams(window.location.search).get('new') === '1') {
        setCreating(true)
        return
      }
      if (list.length > 0) await openDoc(list[0].id)
    })()
  }, [refreshList, openDoc])

  const create = async (payload: { sample?: boolean }) => {
    setBusy('save')
    setErr(null)
    try {
      const res = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(payload.sample ? { sample: true } : { title, text }),
        }),
      })
      const data = (await res.json()) as { doc?: Doc; error?: string }
      if (!res.ok || !data.doc) throw new Error(data.error ?? '创建失败')
      setText('')
      setTitle('')
      await refreshList()
      setDoc(data.doc)
      setSegId(data.doc.segments[0]?.id ?? null)
      setCreating(false)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const patch = async (segmentId: string, body: Record<string, unknown>) => {
    if (!doc) return null
    const res = await fetch(`/api/docs/${doc.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ segmentId, patch: body }),
    })
    const data = (await res.json()) as { doc?: Doc; error?: string }
    if (!res.ok || !data.doc) throw new Error(data.error ?? '保存失败')
    setDoc(data.doc)
    return data.doc
  }

  const annotate = async () => {
    if (!doc || !seg) return
    setBusy('ann')
    setErr(null)
    setNote(null)
    try {
      const res = await fetch('/api/ai/annotate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ docId: doc.id, segmentId: seg.id }),
      })
      const data = (await res.json()) as { doc?: Doc; warning?: string; error?: string }
      if (!res.ok || !data.doc) throw new Error(data.error ?? '批注失败')
      setDoc(data.doc)
      if (data.warning) setNote(data.warning)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const saveMine = async () => {
    if (!doc || !seg || !marking) return
    const quote = marking.trim()
    if (quote.length === 0) return
    const ann: Annotation = {
      id: `me${Date.now().toString(36)}`,
      quote,
      kind: 'mine',
      note: markNote.trim() || '我划的线',
      at: Date.now(),
    }
    try {
      await patch(seg.id, { annotations: [...seg.annotations, ann] })
      setMarking(null)
      setMarkNote('')
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const grabSelection = () => {
    const sel = window.getSelection()
    const picked = sel?.toString().trim() ?? ''
    if (picked.length < 4) {
      setErr('先在本段正文里选中一句（至少 4 个字），再点这个按钮')
      return
    }
    setErr(null)
    setMarking(picked.slice(0, 60))
  }

  const submitFeynman = async () => {
    if (!doc || !seg) return
    setBusy('fey')
    setErr(null)
    try {
      const res = await fetch('/api/ai/feynman', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ docId: doc.id, segmentId: seg.id, answer: speech }),
      })
      const data = (await res.json()) as {
        doc?: Doc
        score?: number
        missing?: string[]
        followUp?: string
        error?: string
      }
      if (!res.ok || !data.doc) throw new Error(data.error ?? '判分失败')
      setDoc(data.doc)
      setJudge({
        score: data.score ?? 0,
        missing: data.missing ?? [],
        followUp: data.followUp ?? '',
      })
      await refreshList()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const makeQuiz = async () => {
    if (!doc || !seg) return
    setBusy('quiz')
    setErr(null)
    setNote(null)
    setQuestions([])
    setPicked({})
    setQuizDone(null)
    try {
      const res = await fetch('/api/ai/readquiz', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ docId: doc.id, segmentId: seg.id }),
      })
      const data = (await res.json()) as { items?: ReadQuestion[]; warning?: string; error?: string }
      if (!res.ok || !data.items) throw new Error(data.error ?? '出题失败')
      setQuestions(data.items)
      if (data.warning) setNote(data.warning)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const submitQuiz = async () => {
    if (!doc || !seg || questions.length === 0) return
    const right = questions.filter((q, i) => picked[i] === q.answer).length
    setQuizDone({ right, total: questions.length })
    try {
      await patch(seg.id, {
        quizScore: right / questions.length,
        readAt: seg.readAt ?? Date.now(),
      })
      await refreshList()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const markRead = async () => {
    if (!doc || !seg) return
    try {
      await patch(seg.id, { readAt: Date.now() })
      await refreshList()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const progress = doc ? docProgress(doc) : { read: 0, total: 0, pct: 0 }
  const pieces = seg ? splitByQuotes(seg.text, seg.annotations) : []

  return (
    <div className="frag">
      <aside className="frag-side">
        <div className="frag-side-head">
          <span>我的读本</span>
          <button type="button" className="mini" onClick={() => setCreating(true)}>
            + 新的一篇
          </button>
        </div>
        {docs.length === 0 && <p className="frag-empty">还没有读本。点「+ 新的一篇」粘贴一段讲义，或者载入示例。</p>}
        <ul className="frag-docs">
          {docs.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="frag-doc"
                data-on={doc?.id === d.id}
                onClick={() => void openDoc(d.id)}
              >
                <span className="frag-doc-t">{d.title}</span>
                <span className="frag-doc-m">
                  {d.progress.read}/{d.progress.total} 段读完
                </span>
                <span className="frag-bar">
                  <i style={{ width: `${d.progress.pct}%` }} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="frag-main">
        {creating || (!doc && busy !== 'load') ? (
          <div className="card upload">
            <div className="upload-head">
              <h2>放进一段讲义</h2>
              <p>粘贴文本，或上传 .txt / .md，自动切成 300–500 字的小段。</p>
            </div>
            <input
              className="upload-title"
              placeholder="标题，比如：新文化运动与五四运动（讲义节选）"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="upload-text"
              placeholder="把讲义粘贴到这里（至少 200 字）…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="upload-foot">
              <label className="file">
                上传文件
                <input
                  type="file"
                  accept=".txt,.md,text/plain,text/markdown"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    const content = await f.text()
                    setText(content)
                    if (!title) setTitle(f.name.replace(/\.(txt|md)$/i, ''))
                  }}
                />
              </label>
              {text.length > 0 && <span className="charcount">{text.length} 字</span>}
              <button type="button" className="btn ghost" onClick={() => void create({ sample: true })}>
                载入示例讲义
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy === 'save' || text.trim().length < 200}
                onClick={() => void create({})}
              >
                {busy === 'save' ? '切段中…' : '切成小段，开始读'}
              </button>
            </div>
          </div>
        ) : doc && seg ? (
          <>
            <div className="read-head">
              <div>
                <h2>{doc.title}</h2>
                <p className="read-sub">
                  共 {progress.total} 段 · 已读 {progress.read} 段 · 这一段 {seg.text.length} 字，约 {Math.max(2, Math.round(seg.text.length / 120))} 分钟
                </p>
              </div>
              <div className="read-progress">
                <i style={{ width: `${progress.pct}%` }} />
              </div>
              <button
                type="button"
                className="mini"
                title="删掉这一篇（演示前清场用）"
                onClick={async () => {
                  if (!doc) return
                  await fetch(`/api/docs/${doc.id}`, { method: 'DELETE' })
                  setDoc(null)
                  setSegId(null)
                  const list = await refreshList()
                  if (list.length > 0) await openDoc(list[0].id)
                  else setCreating(false)
                }}
              >
                删掉这篇
              </button>
            </div>

            <div className="seg-tabs" role="tablist">
              {doc.segments.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={s.id === seg.id}
                  className="seg-tab"
                  data-done={s.readAt !== null}
                  data-on={s.id === seg.id}
                  onClick={() => {
                    setSegId(s.id)
                    setJudge(null)
                    setQuestions([])
                    setPicked({})
                    setQuizDone(null)
                    setSpeech('')
                    setNote(null)
                  }}
                  title={s.heading}
                >
                  {s.index + 1}
                  <span>{s.heading.length > 10 ? `${s.heading.slice(0, 10)}…` : s.heading}</span>
                </button>
              ))}
            </div>

            <div className="read-grid">
              <article className="paper">
                <h3>{seg.heading}</h3>
                <div className="paper-body" ref={paperRef}>
                  {pieces.map((p, i) =>
                    p.kind ? (
                      <mark key={i} className="hl" data-k={p.kind}>
                        {p.text}
                      </mark>
                    ) : (
                      <span key={i}>{p.text}</span>
                    ),
                  )}
                </div>
                <div className="paper-foot">
                  <button type="button" className="mini" onClick={markRead} disabled={seg.readAt !== null}>
                    {seg.readAt ? '已标记读完' : '只读完，不测'}
                  </button>
                  <button type="button" className="mini" onClick={grabSelection}>
                    把选中的句子记成笔记
                  </button>
                </div>
              </article>

              <aside className="notes">
                <div className="notes-head">
                  <span>旁注</span>
                  <button
                    type="button"
                    className="mini"
                    onClick={() => void annotate()}
                    disabled={busy === 'ann'}
                  >
                    {busy === 'ann' ? '正在批注…' : seg.annotations.length > 0 ? '重新批注' : 'AI 批注这一段'}
                  </button>
                </div>

                {marking && (
                  <div className="mark-box">
                    <p className="mark-quote">「{marking}」</p>
                    <input
                      className="mark-input"
                      placeholder="我为什么划它（可不填）"
                      value={markNote}
                      onChange={(e) => setMarkNote(e.target.value)}
                    />
                    <div className="mark-btns">
                      <button type="button" className="mini" onClick={() => setMarking(null)}>
                        取消
                      </button>
                      <button type="button" className="mini" data-primary onClick={() => void saveMine()}>
                        记下来
                      </button>
                    </div>
                  </div>
                )}

                {seg.annotations.length === 0 ? (
                  <p className="frag-empty">
                    还没有旁注。点上面的「AI 批注这一段」，或者选中正文里的句子自己划线。
                  </p>
                ) : (
                  <ul className="ann-list">
                    {seg.annotations.map((a) => (
                      <li key={a.id} className="ann" data-k={a.kind}>
                        <span className="ann-kind">{KIND_LABEL[a.kind]}</span>
                        <p className="ann-quote">「{a.quote}」</p>
                        <p className="ann-note">{a.note}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            </div>

            <div className="read-actions">
              <div className="act-row">
                <span className="act-label">合上讲一遍</span>
                <span className="act-hint">别回看原文，用自己的话写 3 句以上，我来判你讲清楚没</span>
              </div>
              {(seg.feynmanScore !== null || seg.quizScore !== null) && (
                <p className="act-last">
                  这一段上次：
                  {seg.feynmanScore !== null && `讲清 ${Math.round(seg.feynmanScore * 100)} 分`}
                  {seg.feynmanScore !== null && seg.quizScore !== null && ' · '}
                  {seg.quizScore !== null && `小测 ${Math.round(seg.quizScore * 100)} 分`}
                </p>
              )}
              <textarea
                className="speech"
                placeholder="比如：这一段讲的是……关键在于……我原来以为……其实……"
                value={speech}
                onChange={(e) => setSpeech(e.target.value)}
              />
              <div className="act-foot">
                <button
                  type="button"
                  className="btn"
                  disabled={busy === 'fey' || speech.trim().length < 20}
                  onClick={() => void submitFeynman()}
                >
                  {busy === 'fey' ? '正在判…' : '判我讲清楚没'}
                </button>
                <button type="button" className="btn ghost" disabled={busy === 'quiz'} onClick={() => void makeQuiz()}>
                  {busy === 'quiz' ? '出题中…' : '考我两题'}
                </button>
              </div>

              {judge && (
                <div className="judge" data-band={judge.score >= 0.75 ? 'ok' : judge.score >= 0.45 ? 'mid' : 'low'}>
                  <div className="judge-score">
                    <b>{Math.round(judge.score * 100)}</b>
                    <span>分</span>
                  </div>
                  <div className="judge-body">
                    {judge.missing.length > 0 ? (
                      <ul className="judge-missing">
                        {judge.missing.map((m, i) => (
                          <li key={i}>没讲到：{m}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="judge-ok">三条都讲到了，这一段算过关。</p>
                    )}
                    {judge.followUp && <p className="judge-follow">追问：{judge.followUp}</p>}
                  </div>
                </div>
              )}

              {questions.length > 0 && (
                <div className="readquiz">
                  {questions.map((q, qi) => (
                    <div key={qi} className="rq">
                      <p className="rq-stem">
                        <span className="rq-no">{qi + 1}</span>
                        {q.stem}
                      </p>
                      <div className="rq-opts">
                        {q.options.map((o, oi) => {
                          const letter = 'ABCD'[oi]
                          const state = quizDone
                            ? letter === q.answer
                              ? 'right'
                              : picked[qi] === letter
                                ? 'wrong'
                                : undefined
                            : undefined
                          return (
                            <button
                              key={oi}
                              type="button"
                              className="rq-opt"
                              data-picked={picked[qi] === letter}
                              data-state={state}
                              disabled={quizDone !== null}
                              onClick={() => setPicked((p) => ({ ...p, [qi]: letter }))}
                            >
                              <b>{letter}</b>
                              {o}
                            </button>
                          )
                        })}
                      </div>
                      {quizDone && q.explain && <p className="rq-explain">{q.explain}</p>}
                    </div>
                  ))}
                  {quizDone ? (
                    <p className="rq-result">
                      对了 {quizDone.right}/{quizDone.total} 道，这一段就算过了一遍。
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="btn"
                      disabled={Object.keys(picked).length < questions.length}
                      onClick={() => void submitQuiz()}
                    >
                      交卷
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="frag-placeholder">正在读存档…</div>
        )}

        {note && <p className="banner">{note}</p>}
        {err && (
          <p className="banner danger">
            {err}
            <button type="button" className="mini" onClick={() => setErr(null)}>
              知道了
            </button>
          </p>
        )}
      </section>
    </div>
  )
}
