import fs from 'node:fs'

// ---- 1) Sidebar：去掉与首页重复的「排法」下拉 ----
let sb = fs.readFileSync('src/components/Sidebar.tsx', 'utf8')
sb = sb.replace(
  /        <label className="pace">[\s\S]*?<\/label>\n/,
  '',
)
// 去掉不再用的 props 与常量
sb = sb.replace("  onPace: (p: Pace) => void\n", '')
sb = sb.replace('pace: Pace\n', '')
sb = sb.replace('onPace, ', '')
sb = sb.replace(
  /const PACES: Array<\{ key: Pace; label: string \}> = \[[\s\S]*?\]\n\n/,
  '',
)
fs.writeFileSync('src/components/Sidebar.tsx', sb, 'utf8')

// ---- 2) page：Sidebar 不再传 pace / onPace ----
let pg = fs.readFileSync('src/app/page.tsx', 'utf8')
pg = pg.replace('        pace={pace}\n', '')
pg = pg.replace('        onPace={setPace}\n', '')
fs.writeFileSync('src/app/page.tsx', pg, 'utf8')

console.log('sidebar pace removed')
