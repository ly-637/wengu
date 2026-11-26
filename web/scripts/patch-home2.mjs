import fs from 'node:fs'

const path = 'src/app/page.tsx'
let s = fs.readFileSync(path, 'utf8')

const startMark = '            <div className="home-cols">'
const endMark = '            <section className="card">\n              <div className="card-head">\n                <h2>成绩</h2>'
const start = s.indexOf(startMark)
const end = s.indexOf(endMark)
if (start < 0 || end < start) {
  console.error('home-cols anchor fail')
  process.exit(1)
}

const mid = `            <div className="home-cols">
              <DayPlan kps={kps} now={now} pace={pace} />

`
s = s.slice(0, start) + mid + s.slice(end)

// 待复习那一列整块删掉后，home-cols 里只剩计划 + 成绩，grid 改成 1.5fr / 1fr
fs.writeFileSync(path, s, 'utf8')
console.log('ok', s.includes('待复习'))

// ---- DayPlan：休息块不重复显示 reason ----
const dp = 'src/components/DayPlan.tsx'
let d = fs.readFileSync(dp, 'utf8')
const before = d
d = d.replace(
  /(<p className="why">\{)/,
  '$1',
)
fs.writeFileSync(dp, d, 'utf8')
