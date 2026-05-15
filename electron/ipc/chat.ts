import { ipcMain, BrowserWindow } from 'electron'
import { startChat, cancelAnalysis } from '../services/claude'
import type { ChatMessage } from '../services/claude'

// Build a single prompt string from conversation history + new user message.
// We use a plain-text "conversation transcript" approach since claude CLI
// doesn't natively support multi-turn — the full history is included in the prompt.
function buildChatPrompt(history: ChatMessage[], userMessage: string): string {
  const systemPrefix = `你是一个专业的美股投资助手，擅长分析股票、期权、宏观经济和市场趋势。
用户可以用中文或英文提问，你始终用中文回答。
你可以使用 WebSearch 搜索最新信息，使用 WebFetch 获取网页内容。
回答要专业、简洁、有针对性。\n\n`

  if (history.length === 0) {
    return systemPrefix + userMessage
  }

  // Reconstruct conversation context
  const transcript = history.map(m =>
    m.role === 'user' ? `用户: ${m.text}` : `助手: ${m.text}`
  ).join('\n\n')

  return `${systemPrefix}以下是之前的对话记录：\n\n${transcript}\n\n用户: ${userMessage}\n\n请继续回答：`
}

export function registerChatHandlers() {
  ipcMain.handle('chat:send', async (e, userMessage: string, history: ChatMessage[]) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) throw new Error('No window found')
    const sessionId = `chat-${Date.now()}`
    const prompt = buildChatPrompt(history, userMessage)
    void startChat(prompt, win, sessionId)
    return { sessionId }
  })

  ipcMain.handle('chat:cancel', (_e, sessionId: string) => {
    cancelAnalysis(sessionId)
    return { ok: true }
  })
}
