/**
 * 读本（碎片化学习）的数据结构与切段规则。
 *
 * 为什么按「段」而不是按「章」：碎片时间的单位是 3–8 分钟，一段 300–500 字，
 * 读完正好能讲一遍、答两题。切太细没有完整意思，切太粗一次读不完。
 */

export type AnnotationKind = 'exam' | 'confuse' | 'term' | 'mine'

export type Annotation = {
  id: string
  /** 必须是原文里出现过的片段，前端靠它做高亮 */
  quote: string
  kind: AnnotationKind
  note: string
  at: number
}

export type Segment = {
  id: string
  index: number
  heading: string
  text: string
  annotations: Annotation[]
  readAt: number | null
  feynmanAt: number | null
  feynmanScore: number | null
  quizScore: number | null
}

export type Doc = {
  id: string
  title: string
  createdAt: number
  segments: Segment[]
}

export const SEG_MIN = 260
export const SEG_MAX = 520

const isHeading = (line: string) => /^#{1,4}\s+/.test(line) || /^第[一二三四五六七八九十百]+[章节讲]/.test(line)

/** 把一篇文本切成 300–500 字的小段；标题行单独起段 */
export function splitSegments(text: string): Array<{ heading: string; text: string }> {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out: Array<{ heading: string; text: string }> = []
  let heading = ''
  let buf: string[] = []

  const flush = () => {
    const body = buf.join('\n').trim()
    if (body.length === 0) return
    out.push({ heading: heading || `第 ${out.length + 1} 段`, text: body })
    buf = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (line === '') {
      if (buf.join('').length >= SEG_MIN) flush()
      continue
    }
    if (isHeading(line)) {
      flush()
      heading = line.replace(/^#{1,4}\s+/, '').trim()
      continue
    }
    buf.push(line)
    if (buf.join('\n').length >= SEG_MAX) flush()
  }
  flush()

  // 太短的段落合并到上一段（避免出现只有一句话的「段」）
  const merged: Array<{ heading: string; text: string }> = []
  for (const seg of out) {
    const prev = merged[merged.length - 1]
    if (prev && prev.text.length < SEG_MIN && prev.text.length + seg.text.length <= SEG_MAX + 120) {
      prev.text = `${prev.text}\n${seg.text}`
    } else {
      merged.push({ ...seg })
    }
  }
  return merged.length > 0 ? merged : [{ heading: '全文', text: text.trim() }]
}

const rid = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function makeDoc(title: string, text: string, now = Date.now()): Doc {
  const segs = splitSegments(text)
  return {
    id: rid('d'),
    title: title.trim() || '未命名讲义',
    createdAt: now,
    segments: segs.map((s, i) => ({
      id: rid('s'),
      index: i,
      heading: s.heading,
      text: s.text,
      annotations: [],
      readAt: null,
      feynmanAt: null,
      feynmanScore: null,
      quizScore: null,
    })),
  }
}

export function docProgress(doc: Doc): { read: number; total: number; pct: number } {
  const total = doc.segments.length
  const read = doc.segments.filter((s) => s.readAt !== null).length
  return { read, total, pct: total === 0 ? 0 : Math.round((read / total) * 100) }
}

/** 演示用讲义：不联网也能跑通整个流程 */
export const SAMPLE_TITLE = '新文化运动与五四运动（讲义节选）'

export const SAMPLE_TEXT = `# 一、新文化运动的兴起

一九一五年，陈独秀在上海创办《青年杂志》（次年改名《新青年》），标志着新文化运动的兴起。这场运动以「民主」与「科学」为两面旗帜，反对旧道德、旧文学，提倡新道德、新文学。

新文化运动的主将包括陈独秀、李大钊、胡适、鲁迅等人。胡适发表《文学改良刍议》，主张以白话文代替文言文；鲁迅的《狂人日记》是中国现代文学史上第一篇白话小说，借「吃人」的意象控诉封建礼教。

需要特别注意的是，新文化运动前期属于资产阶级民主主义性质的思想解放运动，它高举的民主与科学，仍然是资产阶级的民主与科学；直到十月革命之后，马克思主义在中国广泛传播，这场运动才逐步转向新的方向。

# 二、五四运动

一九一九年，巴黎和会上中国外交失败，列强将德国在山东的特权转让给日本，消息传回国内，激起各阶层人民的强烈愤慨。五月四日，北京学生三千余人在天安门前集会游行，提出「外争主权，内除国贼」的口号，五四运动爆发。

六月以后，运动的主力由学生转向工人，上海等地工人举行罢工，形成工人罢工、学生罢课、商人罢市的「三罢」局面。工人阶级开始作为独立的政治力量登上历史舞台，这是五四运动区别于以往一切爱国运动的关键。

五四运动是一场彻底反帝反封建的爱国运动，它促进了马克思主义在中国的传播及其与工人运动的结合，为中国共产党的成立作了思想上和干部上的准备，标志着中国新民主主义革命的开端。

# 三、两个容易混的说法

「新民主主义革命的开端」说的是五四运动，不是辛亥革命；「中国近代史的开端」说的是鸦片战争，不是甲午战争。考试里这两个「开端」经常被互换，是选择题的高频陷阱。`

/** 一段 2 题的小测（读本用，不带知识点 id） */
export type ReadQuestion = {
  type: 'single' | 'judge'
  stem: string
  options: string[]
  answer: string
  explain: string
}

const q = (
  stem: string,
  options: string[],
  answer: string,
  explain: string,
): ReadQuestion => ({ type: 'single', stem, options, answer, explain })

/** 示例讲义配套的题：模型挂了也能演示 */
export const SAMPLE_QUIZZES: Array<{ match: string; items: ReadQuestion[] }> = [
  {
    match: '新文化运动',
    items: [
      q(
        '新文化运动兴起的标志是',
        ['《青年杂志》创刊', '《文学改良刍议》发表', '《狂人日记》发表', '五四运动爆发'],
        'A',
        '一九一五年陈独秀在上海创办《青年杂志》，次年改名《新青年》，这是新文化运动兴起的标志。',
      ),
      q(
        '新文化运动前期的性质是',
        ['无产阶级思想解放运动', '资产阶级民主主义性质的思想解放运动', '社会主义革命运动', '反帝反封建的政治运动'],
        'B',
        '前期高举的是资产阶级的民主与科学，属于资产阶级民主主义性质的思想解放运动；十月革命后才逐步转向新方向。',
      ),
    ],
  },
  {
    match: '五四运动',
    items: [
      q(
        '五四运动中，运动主力由学生转向工人的时间是',
        ['一九一九年五月四日', '一九一九年六月初', '一九一九年七月', '一九二一年'],
        'B',
        '六月以后，上海等地工人罢工，运动主力由学生转向工人，形成「三罢」局面。',
      ),
      q(
        '五四运动被称为中国新民主主义革命开端，主要依据是',
        ['它提出了民主与科学的口号', '工人阶级开始作为独立的政治力量登上历史舞台', '它由学生发起并迅速扩展到全国', '它迫使北洋政府释放被捕学生'],
        'B',
        '「开端」的核心依据是阶级力量的变化：工人阶级作为独立的政治力量登上历史舞台。',
      ),
    ],
  },
  {
    match: '容易混',
    items: [
      q(
        '下列对应关系正确的是',
        ['五四运动 — 中国近代史的开端', '鸦片战争 — 新民主主义革命的开端', '五四运动 — 新民主主义革命的开端', '甲午战争 — 中国近代史的开端'],
        'C',
        '五四运动=新民主主义革命的开端；鸦片战争=中国近代史的开端。这两个「开端」最容易被互换。',
      ),
    ],
  },
]

export function fallbackQuiz(text: string): ReadQuestion[] {
  const hit = SAMPLE_QUIZZES.find((s) => text.includes(s.match))
  return hit ? hit.items : []
}

/** 模型不可用时的兜底批注：保证断网演示也有内容 */
export function fallbackAnnotations(text: string, now = Date.now()): Annotation[] {
  const pool: Array<{ quote: string; kind: AnnotationKind; note: string }> = [
    {
      quote: '民主',
      kind: 'exam',
      note: '「民主与科学」是必考口号，注意与后期马克思主义传播区分。',
    },
    {
      quote: '一九一九年',
      kind: 'term',
      note: '五四运动爆发年份，常与一九二一年（建党）一起考时间线。',
    },
    {
      quote: '工人阶级开始作为独立的政治力量登上历史舞台',
      kind: 'exam',
      note: '这是五四运动「新」在哪里，也是新民主主义革命开端的核心依据。',
    },
    {
      quote: '开端',
      kind: 'confuse',
      note: '「开端」有两个：五四=新民主主义革命开端，鸦片战争=近代史开端。',
    },
  ]
  return pool
    .filter((p) => text.includes(p.quote))
    .slice(0, 4)
    .map((p) => ({ id: rid('a'), ...p, at: now, kind: p.kind }))
}
