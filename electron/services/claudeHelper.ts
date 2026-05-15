import { detectClaude } from './claude'

export async function getClaudeBinPath(): Promise<string> {
  const info = await detectClaude()
  if (!info.ok || !info.path) throw new Error(info.error ?? 'claude not found')
  return info.path
}
