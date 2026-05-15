import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

const CANDIDATE_PATHS = [
  process.env.CLAUDE_BIN,
  `${process.env.HOME}/.local/bin/claude`,
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude',
  'claude',
].filter(Boolean) as string[]

export interface ClaudeInfo {
  ok: boolean
  version?: string
  path?: string
  error?: string
}

export async function detectClaude(): Promise<ClaudeInfo> {
  for (const bin of CANDIDATE_PATHS) {
    try {
      const { stdout } = await execFileP(bin, ['--version'], { timeout: 5000 })
      const version = stdout.trim().split('\n')[0]
      return { ok: true, version, path: bin }
    } catch {
      continue
    }
  }
  return {
    ok: false,
    error: '未找到 claude CLI。请先安装 Claude Code 并完成 `claude login`,或设置 CLAUDE_BIN 环境变量指向可执行路径。',
  }
}
