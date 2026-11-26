import type { Kp } from './mock'

/** 一道题。三种题型够演示了：单选、判断、填空（关键词判分，不做开放式评分）。 */
export type QuizItem = {
  id: string
  kpId: string
  type: 'single' | 'judge' | 'blank'
  stem: string
  /** single 才有 */
  options?: string[]
  /** single: 'A'..'D'；judge: '对'/'错'；blank: 标准答案文本 */
  answer: string
  explain: string
}

const LETTERS = ['A', 'B', 'C', 'D'] as const

/**
 * 校验模型吐出来的题。宁可丢掉一道烂题，也不要让它进题库——
 * 现场一题选项为空、答案对不上，整个演示的可信度就没了。
 */
export function validateItems(raw: unknown, kp: Kp, limit = 3): QuizItem[] {
  const list = (raw as { items?: unknown[] } | null)?.items
  if (!Array.isArray(list)) return []
  const out: QuizItem[] = []
  for (const it of list) {
    const o = it as Partial<QuizItem>
    const stem = typeof o.stem === 'string' ? o.stem.trim() : ''
    if (stem.length < 5) continue
    const type = o.type === 'judge' || o.type === 'blank' ? o.type : 'single'

    if (type === 'single') {
      const options = Array.isArray(o.options) ? o.options.map((s) => String(s).trim()).filter(Boolean) : []
      if (options.length < 3) continue
      const answer = String(o.answer ?? '').trim().toUpperCase().slice(0, 1)
      if (!LETTERS.slice(0, options.length).includes(answer as (typeof LETTERS)[number])) continue
      out.push({
        id: `${kp.id}-${out.length}`,
        kpId: kp.id,
        type,
        stem,
        options: options.slice(0, 4),
        answer,
        explain: String(o.explain ?? '').trim(),
      })
    } else {
      const answer = String(o.answer ?? '').trim()
      if (!answer) continue
      out.push({
        id: `${kp.id}-${out.length}`,
        kpId: kp.id,
        type,
        stem,
        answer,
        explain: String(o.explain ?? '').trim(),
      })
    }
    if (out.length >= limit) break
  }
  return out
}

/** 出题提示词。文科味道要足：题干问「为什么/说明了什么」，不要背年份的填空题。 */
export function quizPrompt(kp: Kp, course: string) {
  const system = '你是中国近现代史纲要的命题老师。出的题要像期末卷：考理解与因果，不考生僻细节。只输出 JSON。'
  const user = [
    `课程：《${course}》`,
    `知识点：${kp.title}`,
    kp.note ? `讲授要点：${kp.note}` : '',
    '',
    '请出 3 道单选题，覆盖这个知识点的不同侧面（背景/内容/意义），难度接近期末考试。',
    '要求：',
    '1. 每题 4 个选项，只有一个正确，干扰项必须是学生真会混淆的常见误解，不要凑数。',
    '2. 解析 30–60 字，说清为什么对、错项错在哪。',
    '3. 只输出 JSON，格式：{"items":[{"type":"single","stem":"...","options":["...","...","...","..."],"answer":"A","explain":"..."}]}',
  ]
    .filter(Boolean)
    .join('\n')
  return { system, user }
}
