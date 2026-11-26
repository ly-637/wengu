(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const out = {}
  const sel = [...document.querySelectorAll('select')][0]
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set

  const readHero = () => ({
    tag: (document.querySelector('.hero-tag')?.textContent || '').trim(),
    title: (document.querySelector('.hero-main h2')?.textContent || '').trim(),
    why: (document.querySelector('.hero-why')?.textContent || '').trim(),
    cols: [...document.querySelectorAll('.mode-col')].map((c) => ({
      head: (c.querySelector('.mode-head b')?.textContent || '').trim(),
      first: (c.querySelector('.mode-row .mode-title')?.textContent || '').trim(),
    })),
  })

  out.full = readHero()

  for (const [key, label] of [
    ['sprint', '期末冲刺'],
    ['fragment', '碎片探索'],
  ]) {
    setter.call(sel, key)
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    await wait(900)
    out[key] = { selected: sel.value, ...readHero() }
  }

  out.overflow = {
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    scrollH: document.documentElement.scrollHeight,
  }
  return JSON.stringify(out, null, 2)
})()
