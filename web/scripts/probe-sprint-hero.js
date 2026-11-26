(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const sel = [...document.querySelectorAll('select')][0]
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
  setter.call(sel, 'sprint')
  sel.dispatchEvent(new Event('change', { bubbles: true }))
  await wait(1200)
  return JSON.stringify(
    {
      tag: (document.querySelector('.hero-tag')?.textContent || '').trim(),
      title: (document.querySelector('.hero-main h2')?.textContent || '').trim(),
      why: (document.querySelector('.hero-why')?.textContent || '').trim(),
      side: [...document.querySelectorAll('.hero-side b')].map((b) => b.textContent.trim()),
    },
    null,
    2,
  )
})()
