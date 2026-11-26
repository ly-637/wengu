import fs from 'node:fs'

const path = 'src/app/page.tsx'
let s = fs.readFileSync(path, 'utf8')

// 1) 加一个统一的天数文案函数（放在 nextUpScore 后面）
const scoreFn = '/** 排「今晚先做什么」用的分值：逾期越久越急，没学过的其次，再按考频加权。 */'
const idx = s.indexOf(scoreFn)
if (idx < 0) {
  console.error('score anchor missing')
  process.exit(1)
}
const helper = `
/** 到期文案：逾期 / 今天 / 还有几天，三处列表与 hero 共用，避免出现「逾期 0 天」。 */
function dueText(state: Kp['state'], now: number): string {
  const d = daysUntilDue(state, now)
  if (d === null) return '还没学'
  if (d < 0) return \`逾期 \${Math.max(1, Math.round(-d))} 天\`
  if (d === 0) return '今天到期'
  return \`\${Math.round(d)} 天后\`
}
`
s = s.slice(0, idx) + helper + '\n' + s.slice(idx)

// 2) hero 侧栏
s = s.replace(
  `                            const d = daysUntilDue(nextUp.state, now) ?? 0
                            return d <= 0 ? \`逾期 \${Math.max(1, Math.round(-d))} 天\` : \`\${Math.round(d)} 天后\``,
  `                            return dueText(nextUp.state, now)`,
)

// 3) hero 理由里的逾期文案
s = s.replace(
  '`已经逾期 ${Math.max(1, Math.round(-(daysUntilDue(nextUp.state, now) ?? 0)))} 天，再拖下去就得重学`',
  '`${dueText(nextUp.state, now)}，再拖下去就得重学`',
)

// 4) 两处队列
s = s.replace(
  "{st === 'new' ? '没学过' : d === null ? '' : d <= 0 ? `逾期 ${Math.max(1, Math.round(-d))} 天` : `${Math.max(1, Math.round(d))} 天后`}",
  "{dueText(k.state, now)}",
)
s = s.replace(
  '<span className="queue-meta">{d <= 0 ? `逾期 ${Math.max(1, Math.round(-d))} 天` : `${Math.max(1, Math.round(d))} 天后`}</span>',
  '<span className="queue-meta">{dueText(k.state, now)}</span>',
)

fs.writeFileSync(path, s, 'utf8')
console.log('ok', (s.match(/dueText\(/g) || []).length)
