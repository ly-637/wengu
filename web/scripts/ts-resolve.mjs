// 注册 TS 解析钩子给 `node --test` 用：node --import ./scripts/ts-resolve.mjs --test …
import { register } from 'node:module'

register('./ts-hooks.mjs', import.meta.url)
