(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const pick = (sel) => document.querySelector(sel)

  // 1. 填入费曼复述（React 受控组件要走原生 setter + input 事件）
  const ta = pick('.speech')
  if (!ta) return 'no .speech textarea'
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(
    ta,
    '这一段讲的是新文化运动的兴起。一九一五年陈独秀办了《青年杂志》，后来改名《新青年》，打出民主和科学两面旗，反对旧道德旧文学。胡适主张用白话文代替文言文，鲁迅写了《狂人日记》。要注意前期还是资产阶级民主主义性质的思想解放运动，十月革命以后马克思主义传进来才转向。',
  )
  ta.dispatchEvent(new Event('input', { bubbles: true }))
  await wait(400)

  // 2. 点判分
  const judgeBtn = [...document.querySelectorAll('button')].find((b) =>
    (b.textContent || '').includes('判我讲清楚没'),
  )
  if (!judgeBtn) return 'no judge button'
  judgeBtn.click()
  await wait(12000)
  const judge = pick('.judge')

  // 3. 出题
  const quizBtn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('考我两题'))
  if (quizBtn) {
    quizBtn.click()
    await wait(12000)
  }

  const q = pick('.readquiz')
  return JSON.stringify(
    {
      judge: judge ? judge.innerText.replace(/\n+/g, ' | ') : null,
      questions: document.querySelectorAll('.readquiz .rq').length,
      opts: document.querySelectorAll('.readquiz .rq-opt').length,
      quizText: q ? q.innerText.replace(/\n+/g, ' | ').slice(0, 260) : null,
      progress: pick('.read-sub') ? pick('.read-sub').innerText : null,
    },
    null,
    2,
  )
})()
