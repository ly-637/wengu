import fs from 'node:fs'

const path = 'src/app/page.tsx'
const lines = fs.readFileSync(path, 'utf8').split('\n')

// 282..289（0-based）是那段缩进错位的「成绩」卡片 + home-cols 的收尾
const repl = [
  '              <section className="card">',
  '                <div className="card-head">',
  '                  <h2>成绩</h2>',
  '                  <p className="cap">每天的平均分</p>',
  '                </div>',
  '                <ScoreChart attempts={attempts} now={now} />',
  '              </section>',
  '            </div>',
  '          </div>',
]

console.log('before:', JSON.stringify(lines.slice(280, 292), null, 1))
lines.splice(282, 8, ...repl)
fs.writeFileSync(path, lines.join('\n'), 'utf8')
console.log('after:', JSON.stringify(lines.slice(278, 296), null, 1))
