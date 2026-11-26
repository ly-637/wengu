import fs from 'node:fs'

const path = 'src/app/page.tsx'
let s = fs.readFileSync(path, 'utf8')

const before = "import { buildDay, type SchedItem } from '@/lib/plan'"
const after = "import { buildDay, type SchedItem } from '@/lib/plan'\nimport { PACE_LABEL, modeRows } from '@/lib/modes'"
if (!s.includes(before)) {
  console.error('import anchor missing')
  process.exit(1)
}
s = s.replace(before, after)
s = s.replace('按「{PACE_NAME[pace]}」排', '按「{PACE_LABEL[pace]}」排')

fs.writeFileSync(path, s, 'utf8')
console.log('patched', s.includes('PACE_LABEL[pace]'), s.includes('modeRows'))
