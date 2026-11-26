/**
 * 与 DeepSeek 说话的唯一通道（服务端专用，不要在客户端 import）。
 *
 * 为什么不在浏览器里直连：key 会暴露在 DevTools 里，而且 CORS 结果不可控。
 * 走 Next 的 route handler，浏览器只跟自己人说话。
 *
 * 实测结论（2026-11-23，deepseek-flash）：
 *   - 开思考链时 token 会被 reasoning 吃掉、延迟 2.5s；出题/建树这类活必须关掉。
 *   - 关掉后 1.5s，且 message 里没有 reasoning_content 字段。
 *   - json_object 模式可用，但解析前仍要剥 ``` 围栏兜底（模型偶尔不听话）。
 */

export type ChatOptions = {
  system?: string
  user: string
  /** 要求返回 JSON。会带上 response_format，并在解析失败时重试一次 */
  json?: boolean
  maxTokens?: number
  timeoutMs?: number
}

export class LlmError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'LlmError'
    this.status = status
  }
}

const stripFence = (s: string): string => {
  const t = s.trim()
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t)
  return m ? m[1].trim() : t
}

export function aiConfig() {
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')
  const model = process.env.AI_MODEL || 'deepseek-flash'
  const apiKey = process.env.AI_API_KEY || ''
  return { baseUrl, model, apiKey, configured: apiKey.length > 0 }
}

async function callOnce(opts: ChatOptions): Promise<string> {
  const { baseUrl, model, apiKey, configured } = aiConfig()
  if (!configured) throw new LlmError('没配 AI_API_KEY，去 web/.env.local 里填', 503)

  const body: Record<string, unknown> = {
    model,
    messages: [
      ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
      { role: 'user', content: opts.user },
    ],
    max_tokens: opts.maxTokens ?? 1500,
    // 关掉思考链：出题不需要它，开着只会让 token 飘和延迟翻倍
    thinking: { type: 'disabled' },
  }
  if (opts.json) body.response_format = { type: 'json_object' }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
  })

  const text = await res.text()
  if (!res.ok) {
    let detail = text.slice(0, 240)
    try {
      const j = JSON.parse(text) as { error?: { message?: string } }
      if (j.error?.message) detail = j.error.message
    } catch {
      /* 保留原文 */
    }
    throw new LlmError(detail, res.status)
  }

  const json = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> }
  const content = json.choices?.[0]?.message?.content ?? ''
  if (!content.trim()) throw new LlmError('模型返回了空内容（可能被 max_tokens 截断）', 502)
  return content
}

/** 普通文本调用。失败重试一次（免费额度偶尔 429/超时，重试几乎总能过）。 */
export async function chat(opts: ChatOptions): Promise<string> {
  try {
    return await callOnce(opts)
  } catch (err) {
    if (err instanceof LlmError && err.status === 503) throw err
    await new Promise((r) => setTimeout(r, 600))
    return await callOnce(opts)
  }
}

/** 要求结构化 JSON 的调用：剥围栏 → 解析 → 失败再来一次更严厉的提示 */
export async function chatJSON<T>(opts: ChatOptions): Promise<T> {
  const parse = (raw: string): T => JSON.parse(stripFence(raw)) as T
  const first = await chat({ ...opts, json: true })
  try {
    return parse(first)
  } catch {
    const retry = await chat({
      ...opts,
      json: true,
      user: `${opts.user}\n\n注意：上一次输出不是合法 JSON。这次只输出 JSON 本身，不要任何解释、不要 markdown 围栏。`,
    })
    try {
      return parse(retry)
    } catch {
      throw new LlmError('模型两次都没给出能解析的 JSON')
    }
  }
}
