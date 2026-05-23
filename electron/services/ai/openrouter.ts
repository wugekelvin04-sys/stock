import { getAiSettings } from '../db'
import type { AiSettings } from '../db'

export interface StreamTextOptions {
  modelRole: 'analysis' | 'search' | 'cheap'
  search?: boolean
  signal?: AbortSignal
  onToken: (text: string) => void
}

export interface GenerateTextOptions {
  modelRole: 'analysis' | 'search' | 'cheap'
  search?: boolean
  signal?: AbortSignal
  onToken?: (text: string) => void
}

interface ChatCompletionChunk {
  choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>
  error?: { message?: string }
}

function modelFor(settings: AiSettings, role: StreamTextOptions['modelRole']): string {
  if (role === 'analysis') return settings.analysisModel
  if (role === 'search') return settings.searchModel
  return settings.cheapModel
}

function openRouterHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/wugekelvin04-sys/stock',
    'X-Title': 'Stock Desk',
  }
}

function parseSseLines(buffer: string): { lines: string[]; rest: string } {
  const lines = buffer.split('\n')
  return { lines: lines.slice(0, -1), rest: lines.at(-1) ?? '' }
}

function buildRequestBody(prompt: string, options: StreamTextOptions | GenerateTextOptions, stream: boolean) {
  const settings = getAiSettings(true)
  const body: Record<string, unknown> = {
    model: modelFor(settings, options.modelRole),
    messages: [
      {
        role: 'system',
        content: `你是一个严谨的美股分析助手。用中文回答。涉及最新信息时必须给出来源和日期；不确定就明确说明。需要搜索时最多调用 ${settings.searchMaxCalls} 次搜索工具。搜索完成后必须继续在 assistant content 中输出最终答案，不要停在工具调用、不要只输出 reasoning、不要输出工具调用 JSON。如果搜索不可用，也要基于可用信息输出结果并说明限制。`,
      },
      { role: 'user', content: prompt },
    ],
    stream,
  }

  if (options.search && settings.searchEnabled && settings.searchMaxCalls > 0) {
    body.tools = [{
      type: 'openrouter:web_search',
      parameters: {
        max_results: settings.searchMaxResults,
        ...(settings.searchEngine ? { engine: settings.searchEngine } : {}),
      },
    }]
    body.tool_choice = 'auto'
  }

  return { settings, body }
}

export async function streamOpenRouterText(prompt: string, options: StreamTextOptions): Promise<void> {
  const { settings, body } = buildRequestBody(prompt, options, true)
  const apiKey = settings.openrouterApiKey
  if (!apiKey) throw new Error('未配置 OpenRouter API Key')

  const res = await fetch(`${settings.openrouterApiBase.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify(body),
    signal: options.signal,
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenRouter 请求失败 (${res.status}): ${text.slice(0, 300)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parsed = parseSseLines(buffer)
    buffer = parsed.rest

    for (const line of parsed.lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue
      const chunk = JSON.parse(data) as ChatCompletionChunk
      if (chunk.error?.message) throw new Error(chunk.error.message)
      const token = chunk.choices?.[0]?.delta?.content
      if (token) options.onToken(token)
    }
  }
}

export async function generateOpenRouterText(prompt: string, options: GenerateTextOptions): Promise<string> {
  if (options.onToken) {
    let full = ''
    await streamOpenRouterText(prompt, {
      modelRole: options.modelRole,
      search: options.search,
      signal: options.signal,
      onToken: (text) => {
        full += text
        options.onToken?.(text)
      },
    })
    return full
  }

  const { settings, body } = buildRequestBody(prompt, options, false)
  const apiKey = settings.openrouterApiKey
  if (!apiKey) throw new Error('未配置 OpenRouter API Key')

  const res = await fetch(`${settings.openrouterApiBase.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify(body),
    signal: options.signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenRouter 请求失败 (${res.status}): ${text.slice(0, 300)}`)
  }
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
  if (json.error?.message) throw new Error(json.error.message)
  return json.choices?.[0]?.message?.content ?? ''
}
