/**
 * 存储适配层，三种后端，按环境变量自动选：
 *
 * 1. Vercel Blob（BLOB_READ_WRITE_TOKEN）—— 部署到 Vercel 时用，不需要注册任何第三方服务，
 *    在 Vercel 项目的 Storage 里点一下 Create Blob 就会自动注入这个变量。
 * 2. Upstash Redis（UPSTASH_REDIS_REST_URL + TOKEN）—— 想用 Redis 时用。
 * 3. 本地 JSON 文件（`.data/<key>.json`）—— 开发机默认。
 *
 * 业务代码只认 readJSON / writeJSON，不知道背后是什么。
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

export type Backend = 'blob' | 'redis' | 'file'

export const backend: Backend = BLOB_TOKEN ? 'blob' : REDIS_URL && REDIS_TOKEN ? 'redis' : 'file'

const DIR = path.join(process.cwd(), '.data')
const PREFIX = 'wengu'

async function redis(command: string[], body?: string): Promise<unknown> {
  const res = await fetch(`${REDIS_URL}/${command.map(encodeURIComponent).join('/')}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${REDIS_TOKEN}`,
      ...(body === undefined ? {} : { 'content-type': 'text/plain' }),
    },
    body,
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`redis ${command[0]} ${res.status}`)
  const json = (await res.json()) as { result?: unknown }
  return json.result
}

async function blobRead(key: string): Promise<string | null> {
  const { list } = await import('@vercel/blob')
  const { blobs } = await list({ prefix: `${PREFIX}/${key}.json`, token: BLOB_TOKEN, limit: 1 })
  const hit = blobs.find((b) => b.pathname === `${PREFIX}/${key}.json`) ?? blobs[0]
  if (!hit) return null
  const res = await fetch(hit.url, { cache: 'no-store' })
  if (!res.ok) return null
  return res.text()
}

async function blobWrite(key: string, text: string): Promise<void> {
  const { put } = await import('@vercel/blob')
  await put(`${PREFIX}/${key}.json`, text, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    token: BLOB_TOKEN,
  })
}

export async function readJSON<T>(key: string): Promise<T | null> {
  let raw: string | null = null

  if (backend === 'blob') raw = await blobRead(key)
  else if (backend === 'redis') {
    const value = await redis(['get', key])
    raw = typeof value === 'string' && value.length > 0 ? value : null
  } else {
    try {
      raw = await fs.readFile(path.join(DIR, `${key}.json`), 'utf8')
    } catch {
      raw = null
    }
  }

  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function writeJSON(key: string, value: unknown): Promise<void> {
  const text = JSON.stringify(value, null, 2)

  if (backend === 'blob') {
    await blobWrite(key, text)
    return
  }
  if (backend === 'redis') {
    await redis(['set', key], text)
    return
  }

  await fs.mkdir(DIR, { recursive: true })
  const target = path.join(DIR, `${key}.json`)
  const tmp = `${target}.${process.pid}.tmp`
  await fs.writeFile(tmp, text, 'utf8')
  await fs.rename(tmp, target)
}
