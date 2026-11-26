import fs from 'node:fs'

const path = 'src/app/page.tsx'
let s = fs.readFileSync(path, 'utf8')

// ---------- 1) 顶栏标题：去掉口号式的 hint ----------
const vstart = s.indexOf('const VIEW_TITLE: Record<View, { title: string; hint: string }> = {')
const vend = s.indexOf('}', vstart) + 1
if (vstart < 0 || vend < vstart) {
  console.error('VIEW_TITLE anchor fail')
  process.exit(1)
}
s =
  s.slice(0, vstart) +
  `const VIEW_TITLE: Record<View, { title: string; hint?: string }> = {
  home: { title: '今天' },
  study: { title: '学习' },
  outline: { title: '地图' },
  practice: { title: '练习' },
  sprint: { title: '冲刺' },
  fragment: { title: '阅读' },
  calendar: { title: '日历' },
}` +
  s.slice(vend)

// ---------- 2) 首页重排 ----------
const hstart = s.indexOf('        {view === \'home\' && (')
const hmark = '        {view === \'study\' && selectedKp && ('
const hend = s.indexOf(hmark)
if (hstart < 0 || hend < hstart) {
  console.error('home anchor fail')
  process.exit(1)
}

const home = `        {view === 'home' && (
          <div className="home">
            <section className="hero">
              <div className="hero-main">
                <div className="hero-tag">现在做这个 · 按「{PACE_LABEL[pace]}」排</div>
                {nextUp ? (
                  <>
                    <h2>{nextUp.title}</h2>
                    <p className="hero-why">
                      {heroReason ?? \`\${dueText(nextUp.state, now)}，现在 \${Math.round(strength(nextUp.state, now) * 100)}%\`}
                    </p>
                    <div className="hero-actions">
                      <button type="button" className="btn" onClick={() => nextUp && pick(nextUp.id)}>
                        开始 · {Math.min(nextUp.estMinutes, 15)} 分钟
                      </button>
                      <button type="button" className="btn ghost" onClick={() => setView('outline')}>
                        看全图
                      </button>
                    </div>
                  </>
                ) : (
                  <p>这门课已经全部过完。</p>
                )}
              </div>

              {nextUp && (
                <div className="hero-side">
                  <div>
                    <span>记得多少</span>
                    <b>{Math.round(strength(nextUp.state, now) * 100)}%</b>
                  </div>
                  <div>
                    <span>下次复习</span>
                    <b>{statusOf(nextUp.state, now) === 'new' ? '还没学' : dueText(nextUp.state, now)}</b>
                  </div>
                  <div>
                    <span>用时</span>
                    <b>{Math.min(nextUp.estMinutes, 15)} 分钟</b>
                  </div>
                </div>
              )}
            </section>

            <ModeCompare kps={kps} now={now} pace={pace} examAt={examAtMs} onPace={setPace} />

            <div className="home-cols">
              <DayPlan kps={kps} now={now} pace={pace} />

              <section className="card">
                <div className="card-head">
                  <h2>待复习</h2>
                  <p className="cap">{pace === 'sprint' ? '按考分缺口排' : pace === 'fragment' ? '十分钟一个' : '最急的在上面'}</p>
                </div>
                <ul className="queue">
                  {dueList.map((k) => (
                    <li key={k.id}>
                      <button type="button" className="queue-row" onClick={() => pick(k.id)}>
                        <i className="dot" data-strength={Math.round((strength(k.state, now) * 100) / 20)} />
                        <span className="queue-title">{k.title}</span>
                        <span className="queue-meta">{dueText(k.state, now)}</span>
                      </button>
                    </li>
                  ))}
                  {dueList.length === 0 && <li className="empty">今天没有到期的。</li>}
                </ul>
              </section>
            </div>

            <section className="card">
              <div className="card-head">
                <h2>成绩</h2>
                <p className="cap">每天的平均分</p>
              </div>
              <ScoreChart attempts={attempts} now={now} />
            </section>
          </div>
        )}

`

s = s.slice(0, hstart) + home + s.slice(hend)

// ---------- 3) 删掉日历视图（内容已并进首页与地图） ----------
const cstart = s.indexOf("        {view === 'calendar' && (")
if (cstart > 0) {
  const cendMark = '        )}\n      </main>'
  const cend = s.indexOf(cendMark, cstart)
  if (cend < 0) {
    console.error('calendar end fail')
    process.exit(1)
  }
  s = s.slice(0, cstart) + s.slice(cend)
}

fs.writeFileSync(path, s, 'utf8')
console.log('home patched', s.includes('home-cols'), !s.includes("view === 'calendar'"))
