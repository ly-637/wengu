(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const pick = (sel) => document.querySelector(sel)

  const quizBtn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('考我两题'))
  if (!quizBtn) return 'no quiz button'
  quizBtn.click()
  await wait(12000)

  // 全部选 B，交卷，看判分与解析
  const rows = [...document.querySelectorAll('.readquiz .rq')]
  for (const row of rows) {
    const opts = [...row.querySelectorAll('.rq-opt')]
    if (opts[1]) opts[1].click()
    await wait(200)
  }
  await wait(400)
  const submit = [...document.querySelectorAll('.readquiz button')].find((b) => (b.textContent || '').includes('交卷'))
  if (submit) submit.click()
  await wait(2500)

  // 滚到费曼区，方便截图
  const act = pick('.read-actions')
  if (act) act.scrollIntoView({ block: 'center' })
  await wait(600)

  const rq = pick('.readquiz')
  return JSON.stringify(
    {
      questions: rows.length,
      result: pick('.rq-result') ? pick('.rq-result').innerText : null,
      explain: [...document.querySelectorAll('.rq-explain')].map((n) => n.innerText.slice(0, 40)),
      text: rq ? rq.innerText.replace(/\n+/g, ' | ').slice(0, 200) : null,
    },
    null,
    2,
  )
})()
