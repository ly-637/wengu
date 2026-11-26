import fs from 'node:fs'

const path = 'src/app/page.tsx'
let s = fs.readFileSync(path, 'utf8')
const start = s.indexOf('  // 「今晚第一件事」：跟着当前模式走')
const endMarker = '          : null\n'
const end = s.indexOf(endMarker, start) + endMarker.length
if (start < 0 || end < start) {
  console.error('anchor fail')
  process.exit(1)
}

const repl = [
  '  // 「今晚第一件事」：跟着当前模式走 —— 长期救快忘的、冲刺补最亏的、碎片给一个短块',
  '  const heroRows = modeRows(kps, now, pace, examAtMs, 3)',
  '  const heroTop = heroRows[0] ?? null',
  '  const heroKp = (heroTop ? leaves.find((k) => k.id === heroTop.kpId) : null) ?? null',
  '  const nextUp = heroKp ?? [...leaves].sort((a, b) => nextUpScore(b, now) - nextUpScore(a, now))[0] ?? null',
  '  const heroReason = heroTop?.reason ?? null',
  '',
].join('\n')

s = s.slice(0, start) + repl + s.slice(end)
fs.writeFileSync(path, s, 'utf8')
console.log('ok', s.includes('heroTop'))
