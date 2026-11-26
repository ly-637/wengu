// 一次性自检：确认从 127.0.0.1 访问时，客户端资源不会被 dev 的跨域保护拦掉
const base = process.env.BASE ?? 'http://127.0.0.1:3021'
const origin = new URL(base).origin

const html = await (await fetch(base + '/')).text()
const srcs = [...html.matchAll(/(?:src|href)="(\/_next\/[^"]+)"/g)].map((m) => m[1])
console.log('页面资源数:', srcs.length)

let bad = 0
for (const s of srcs) {
  const r = await fetch(base + s, { headers: { Origin: origin, Referer: origin + '/' } })
  if (!r.ok) {
    bad++
    console.log('FAIL', r.status, s.slice(0, 100))
  }
}
console.log(bad === 0 ? '全部资源 200 ✅' : `有 ${bad} 个资源失败 ❌`)

const st = await fetch(base + '/api/state')
const d = await st.json()
console.log('/api/state:', st.status, d.kps?.length, '个知识点')
