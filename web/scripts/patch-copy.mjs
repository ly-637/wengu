import fs from 'node:fs'

const edits = [
  // ---- plan.ts：理由写成人话，但不写励志句 ----
  [
    'src/lib/plan.ts',
    '          ? `逾期 ${Math.round(overdue)} 天，现在只用 ${Math.round(i.strength * 100)}% 记得`\n          : `今天到期，${Math.round(i.strength * 100)}% 还记得`',
    '          ? `逾期 ${Math.round(overdue)} 天 · 现在 ${Math.round(i.strength * 100)}%`\n          : `今天到期 · 现在 ${Math.round(i.strength * 100)}%`',
  ],
  [
    'src/lib/plan.ts',
    '      reason:\n        i.prereqs.length === 0\n          ? `第 ${i.importance} 重要，前置已满足，可以开始`\n          : `前置「${i.prereqs.join(\'、\')}」已掌握，时机正好`,',
    '      reason:\n        i.prereqs.length === 0\n          ? `重要度 ${i.importance}/5 · 没有前置`\n          : `前置「${i.prereqs.join(\'、\')}」已掌握`,',
  ],
  ['src/lib/plan.ts', "        reason: '连续学了这么久，站起来走两步',", "        reason: '休息',"],

  // ---- DayPlan：去掉产品说教与夸张的时长 ----
  [
    'src/components/DayPlan.tsx',
    "  full: '完整学习 · 今晚 3 小时',\n  sprint: '期末冲刺 · 今晚 2 小时',\n  fragment: '碎片学习 · 今晚 1 小时',",
    "  full: '扎实长期',\n  sprint: '期末冲刺',\n  fragment: '碎片探索',",
  ],
  [
    'src/components/DayPlan.tsx',
    '          每一条都写了「为什么排它」。没有理由的计划，用户第二天就会关掉不看。',
    '          时间按 19:00 起算，可以拖时间旅行看别的日子。',
  ],

  // ---- page：hero 与说明 ----
  ['src/app/page.tsx', '<div className="hero-tag">现在做这个 · 按「{PACE_LABEL[pace]}」排</div>', '<div className="hero-tag">接下来 {Math.min(nextUp?.estMinutes ?? 15, 15)} 分钟</div>'],
  ['src/app/page.tsx', '<p className="cap">同一份数据，排法不同，第一件事就不同</p>', '<p className="cap">点一行切换</p>'],
  ['src/app/page.tsx', '<p className="cap">{pace === \'sprint\' ? \'按考分缺口排\' : pace === \'fragment\' ? \'十分钟一个\' : \'最急的在上面\'}</p>', '<p className="cap">{pace === \'sprint\' ? \'按考分缺口\' : pace === \'fragment\' ? \'每个十分钟\' : \'最急的在上面\'}</p>'],
  ['src/app/page.tsx', '                <p className="lead">每一块都是一个考点，颜色 = 学得多扎实 × 现在还记得多少</p>', '                <p className="lead">颜色越深，记得越牢</p>'],
  ['src/app/page.tsx', '                {leaves.length} 个考点 · 点一块，直接进助教对话', '                {leaves.length} 个考点 · 点一块进去学'],

  // ---- ChatPanel：开场白与提示 ----
  [
    'src/components/ChatPanel.tsx',
    'text: `「${kp.title}」现在 ${pct}%。\\n· 要我先把这条讲一遍？\\n· 还是直接考你三题、看哪里漏？\\n选一个，或者直接说自己哪儿没懂。`,',
    'text: `「${kp.title}」现在 ${pct}%。要我讲一遍，还是先考三题？`,',
  ],
  [
    'src/components/ChatPanel.tsx',
    "          {['这考点最容易考什么？', '它和前后的因果关系是什么？', '给我一个能记住的类比'].map((q) => (",
    "          {['最容易考什么？', '它和前后什么关系？', '给个能记住的类比'].map((q) => (",
  ],
  [
    'src/components/ChatPanel.tsx',
    'Enter 发送 · Shift+Enter 换行 · 回答由 deepseek-flash 生成，可能出错，以课本为准',
    'Enter 发送 · Shift+Enter 换行 · 生成内容可能有误，以课本为准',
  ],
  [
    'src/components/ChatPanel.tsx',
    '<span className="meta-line">{st === \'new\' ? \'还没测过\' : st === \'due\' ? \'到期了\' : \'还在\'}</span>',
    '<span className="meta-line">{st === \'new\' ? \'没学过\' : st === \'due\' ? \'该复习\' : \'还记得\'}</span>',
  ],

  // ---- QuizPanel / ExamPanel / QuizCard：去掉说教 ----
  ['src/components/QuizPanel.tsx', "{source === 'cache' ? '题库缓存' : source === 'ai' ? '刚刚由模型现出' : '出题中'}", "{source === 'cache' ? '题库' : source === 'ai' ? '新出的题' : '出题中'}"],
  [
    'src/components/QuizPanel.tsx',
    '                分数不是终点：答对会把这个知识点的复习间隔拉长，答错会让它更早重新出现。右边折线和左边的到期红圈都会跟着变。',
    '                答对会拉长复习间隔，答错会更早再考一次。',
  ],
  ['src/components/QuizPanel.tsx', '再来一组（实时出题）', '再来一组'],
  ['src/components/ExamPanel.tsx', '对 {right}/{items.length} · 刚错的那几道已经进错题本，颜色也变了', '对 {right}/{items.length} · 错题已进错题本'],

  // ---- Reader：标题说明 ----
  ['src/components/Reader.tsx', '<p>粘贴文本，或上传 .txt / .md。会自动切成 300–500 字的小段。</p>', '<p>粘贴文本，或上传 .txt / .md，自动切成 300–500 字的小段。</p>'],
]

for (const [file, from, to] of edits) {
  const p = file
  let s = fs.readFileSync(p, 'utf8')
  if (!s.includes(from)) {
    console.error('MISS', file, JSON.stringify(from.slice(0, 40)))
    continue
  }
  s = s.replace(from, to)
  fs.writeFileSync(p, s, 'utf8')
}
console.log('copy pass done')
