/**
 * 存储适配层：本地是 JSON 文件，部署到云上（Vercel / Render 只读文件系统）时换成 Upstash Redis。
 *
 * 判定很简单：环境里有 UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN 就走 Redis，
 * 否则退回 `.data/<key>.json`。业务代码只认 readJSON / writeJSON，不知道背后是什么。
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

const URL_BASE = process.env.UPSTASH_REDIS_REST_URL
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

export const usingRedis = Boolean(URL_BASE && TOKEN)

const DIR = path.join(process.cwd(), '.data')

async function redis(command: string[], body?: string): Promise<unknown> {
  const res = await fetch(`${URL_BASE}/${command.map(encodeURIComponent).join('/')}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      ...(body === undefined ? {} : { 'content-type': 'text/plain' }),
    },
    body,
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`redis ${command[0]} ${res.status}`)
  const json = (await res.json()) as { result?: unknown }
  return json.result
}

export async function readJSON<T>(key: string): Promise<T | null> {
  if (usingRedis) {
    const raw = await redis(['get', key])
    if (typeof raw !== 'string' || raw.length === 0) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }
  try {
    const raw = await fs.readFile(path.join(DIR, `${key}.json`), 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function writeJSON(key: string, value: unknown): Promise<void> {
  const text = JSON.stringify(value, null, 2)
  if (usingRedis) {
    await redis(['set', key], text)
    return
  }
  await fs.mkdir(DIR, { recursive: true })
  const target = path.join(DIR, `${key}.json`)
  const tmp = `${target}.${process.pid}.tmp`
  await fs.writeFile(tmp, text, 'utf8')
  await fs.rename(tmp, target)
}
