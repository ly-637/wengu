// 在「不能 spawn 子进程」的沙箱里验证页面的临时入口：Next 的 CLI 会 fork 子进程，这里直接 in-process 起。
// 用户本机正常用 `npm run dev` 就行，这个文件只是自检用。
import { createServer } from 'node:http'
import next from 'next'

const port = Number(process.env.PORT || 3021)
const app = next({ dev: true, dir: process.cwd() })
await app.prepare()
const handle = app.getRequestHandler()
createServer((req, res) => handle(req, res)).listen(port, () => console.log(`in-process dev on http://127.0.0.1:${port}`))
