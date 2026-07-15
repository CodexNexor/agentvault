import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  try {
    const d = typeof iso === 'string' ? parseISO(iso) : new Date(iso)
    if (isToday(d)) return `Today ${format(d, 'h:mm a')}`
    if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return '—'
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return format(parseISO(iso), 'MMM d, yyyy · h:mm a')
  } catch {
    return '—'
  }
}

export function agentLabel(id: string): string {
  const map: Record<string, string> = {
    codex: 'Codex CLI',
    opencode: 'OpenCode',
    'claude-code': 'Claude Code',
    continue: 'Continue',
    aider: 'Aider',
    gemini: 'Gemini CLI',
  }
  return map[id] || id
}

export function cloudLabel(provider: string): string {
  const map: Record<string, string> = {
    'google-drive': 'Google Drive',
    local: 'Local only',
    none: 'Not connected',
    dropbox: 'Dropbox',
    onedrive: 'OneDrive',
    s3: 'Amazon S3',
    r2: 'Cloudflare R2',
  }
  return map[provider] || provider
}
