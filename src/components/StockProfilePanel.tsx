import { useEffect, useRef, useState } from 'react'
import { Building2, RefreshCw, Square, ExternalLink, ChevronDown } from 'lucide-react'

function cleanText(t: string) {
  return t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').trim()
}

interface ParsedSource { title: string; url: string }

function extractSources(raw: string): ParsedSource[] {
  const sources: ParsedSource[] = []
  const normalized = raw.replace(/\]\s*\n\s*\(/g, '](')
  const linkRe = /\[(.+?)\]\((https?:\/\/[^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(normalized)) !== null) {
    sources.push({ title: m[1], url: m[2] })
  }
  return sources
}

function filterContent(raw: string): string {
  // 把行内 ## 标题拆成独立行，防止 AI 把旁白和标题写在同一行
  const expanded = raw.replace(/(##\s*\S)/g, '\n$1')
  const lines = expanded.split('\n')
  const out: string[] = []
  let inSources = false
  let foundFirstSection = false
  const seenHeaders = new Set<string>()

  for (const line of lines) {
    if (/^##\s*sources/i.test(line) || /^sources[:：]?$/i.test(line.trim())) { inSources = true; continue }
    if (inSources && /^##/.test(line)) { inSources = false; foundFirstSection = true }
    if (inSources) continue
    if (/^---+$/.test(line.trim())) continue
    if (line.startsWith('>')) continue
    if (/^\[.+\]\(https?:\/\//.test(line.trim())) continue
    if (/^##/.test(line)) {
      // 同一个 ## 标题第二次出现说明内容重复了，截断
      const h = line.trim()
      if (seenHeaders.has(h)) break
      seenHeaders.add(h)
      foundFirstSection = true
    }
    if (!foundFirstSection) continue
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function renderMarkdown(text: string) {
  const lines = filterContent(text).split('\n')
  const elements: React.ReactNode[] = []
  let key = 0
  for (const line of lines) {
    const clean = cleanText(line)
    if (line.startsWith('## ')) {
      elements.push(<h4 key={key++} className="mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle first:mt-0">{clean.slice(3)}</h4>)
    } else if (line.match(/^[-*] /)) {
      elements.push(<li key={key++} className="ml-3 text-xs text-fg-muted list-disc leading-snug">{cleanText(line.slice(2))}</li>)
    } else if (line.trim() === '') {
      /* skip blank */
    } else {
      elements.push(<p key={key++} className="text-xs text-fg-muted leading-snug">{clean}</p>)
    }
  }
  return elements
}

export function StockProfilePanel({ symbol }: { symbol: string }) {
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [streaming, setStreaming] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const unsubRef = useRef<(() => void) | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(true)  // 防止 StrictMode double-invoke 导致重复 chunk

  const generate = async () => {
    setStreaming(true)
    setContent('')
    setTags([])
    setShowSources(false)
    unsubRef.current?.()

    let mySessionId: string | null = null

    const unsub = window.api.stock.onProfileChunk((chunk) => {
      if (!activeRef.current) return
      if (mySessionId && chunk.sessionId && chunk.sessionId !== mySessionId) return
      if (chunk.type === 'token' && chunk.text) setContent(p => p + chunk.text)
      else if (chunk.type === 'done') {
        setStreaming(false)
        window.api.stock.profileGet(symbol).then(p => { if (p && activeRef.current) setTags(p.tags) })
      } else if (chunk.type === 'error') {
        setStreaming(false)
      }
    })
    unsubRef.current = unsub

    try {
      const { sessionId } = await window.api.stock.profileGenerate(symbol)
      mySessionId = sessionId
    } catch {
      setStreaming(false)
      unsub()
    }
  }

  useEffect(() => {
    activeRef.current = true
    setContent('')
    setTags([])
    setLoaded(false)
    setStreaming(false)
    setShowSources(false)
    unsubRef.current?.()

    window.api.stock.profileGet(symbol).then(p => {
      if (!activeRef.current) return
      if (p) { setContent(p.content); setTags(p.tags) }
      else void generate()
      setLoaded(true)
    })

    return () => {
      activeRef.current = false
      unsubRef.current?.()
    }
  }, [symbol]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    if (!showSources) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowSources(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSources])

  if (!loaded && !streaming) return null

  const sources = extractSources(content)

  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 size={13} className="text-fg-muted" />
          <span className="text-sm font-semibold text-fg">公司介绍</span>
          {streaming && <span className="flex items-center gap-1 text-xs text-fg-subtle"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />生成中…</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {sources.length > 0 && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowSources(p => !p)}
                className="btn flex items-center gap-1 text-xs py-0.5"
              >
                来源 <ChevronDown size={10} className={`transition-transform ${showSources ? 'rotate-180' : ''}`} />
              </button>
              {showSources && (
                <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-border bg-bg-elevated shadow-xl">
                  <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                    {sources.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => window.api.openExternal(s.url)}
                        className="flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-bg-subtle transition-colors"
                      >
                        <ExternalLink size={10} className="mt-0.5 shrink-0 text-fg-subtle" />
                        <span className="text-[11px] text-fg-muted leading-snug line-clamp-2">{s.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {streaming
            ? <button onClick={() => { unsubRef.current?.(); setStreaming(false) }} className="btn flex items-center gap-1 text-xs py-0.5"><Square size={10} />停止</button>
            : <button onClick={generate} className="btn flex items-center gap-1 text-xs py-0.5"><RefreshCw size={10} />刷新</button>
          }
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map(t => (
            <span key={t} className="rounded-full border border-border bg-bg-subtle px-2 py-0.5 text-[10px] text-fg-muted">{t}</span>
          ))}
        </div>
      )}

      {content && (
        <div className="space-y-0.5">
          {renderMarkdown(content)}
          {streaming && <span className="inline-block h-3 w-0.5 animate-pulse bg-fg-muted align-middle" />}
        </div>
      )}
    </div>
  )
}
