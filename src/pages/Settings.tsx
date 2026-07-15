import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Toggle } from '@/components/ui/Toggle'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { vault } from '@/lib/api'
import type { AppSettings, AutoBackupInterval } from '../../shared/types'
import { useToastStore } from '@/stores/toast-store'
import { Cloud, Shield, ExternalLink, Eye, EyeOff, HardDrive } from 'lucide-react'

const INTERVALS: { value: AutoBackupInterval; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: '5m', label: 'Every 5 minutes' },
  { value: '15m', label: 'Every 15 minutes' },
  { value: '30m', label: 'Every 30 minutes' },
  { value: '1h', label: 'Every 1 hour' },
]

export function SettingsPage() {
  const qc = useQueryClient()
  const push = useToastStore((s) => s.push)
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => vault.getSettings(),
  })
  const { data: google } = useQuery({
    queryKey: ['google'],
    queryFn: () => vault.getGoogleAuth(),
  })

  const [local, setLocal] = useState<AppSettings | null>(null)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [oauthBusy, setOauthBusy] = useState(false)

  useEffect(() => {
    if (settings) {
      setLocal(settings)
      setClientId(settings.googleClientId || '')
      // Don't prefill secret in clear text from storage into UI on every load if empty typing - show placeholder if set
      if (settings.googleClientSecret) {
        setClientSecret(settings.googleClientSecret)
      }
    }
  }, [settings])

  const update = async (partial: Partial<AppSettings>) => {
    if (!local) return
    const next = { ...local, ...partial }
    setLocal(next)
    await vault.updateSettings(partial)
    await qc.invalidateQueries({ queryKey: ['settings'] })
    await qc.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const saveOAuth = async () => {
    setOauthBusy(true)
    try {
      await vault.saveGoogleOAuthCredentials(clientId, clientSecret)
      await qc.invalidateQueries({ queryKey: ['settings'] })
      push({
        type: 'success',
        title: 'Credentials saved',
        message: 'Stored only on this PC. Now click Connect Google Drive.',
      })
    } catch (err) {
      push({
        type: 'error',
        title: 'Could not save',
        message: err instanceof Error ? err.message : 'Invalid credentials',
      })
    } finally {
      setOauthBusy(false)
    }
  }

  const connectDrive = async () => {
    setOauthBusy(true)
    try {
      if (clientId.trim() && clientSecret.trim()) {
        await vault.saveGoogleOAuthCredentials(clientId, clientSecret)
      }
      const state = await vault.connectGoogle()
      await qc.invalidateQueries({ queryKey: ['google'] })
      await qc.invalidateQueries({ queryKey: ['settings'] })
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
      push({
        type: 'success',
        title: 'Google Drive connected',
        message: state.email
          ? `Signed in as ${state.email}`
          : 'Your Drive is ready for complete backups',
      })
    } catch (err) {
      push({
        type: 'error',
        title: 'Connect failed',
        message: err instanceof Error ? err.message : 'Check Client ID, secret, and test users',
      })
    } finally {
      setOauthBusy(false)
    }
  }

  if (!local) {
    return (
      <div>
        <TopBar title="Settings" />
        <div className="p-6 text-sm text-white/40">Loading…</div>
      </div>
    )
  }

  return (
    <div>
      <TopBar title="Settings" subtitle="General, storage, Drive & agents" />
      <div className="p-6 max-w-[720px] space-y-6">
        {/* General */}
        <Card>
          <CardTitle className="mb-1">General</CardTitle>
          <CardDescription className="mb-5">Backup behavior and notifications</CardDescription>
          <div className="space-y-5">
            <Toggle
              checked={local.autoBackup}
              onChange={(v) => update({ autoBackup: v })}
              label="Auto Backup"
              description="Watch for conversation and file changes in the background"
            />
            <div>
              <div className="text-sm font-medium mb-2">Backup interval</div>
              <div className="flex flex-wrap gap-2">
                {INTERVALS.map((iv) => (
                  <button
                    key={iv.value}
                    onClick={() => update({ autoBackupInterval: iv.value })}
                    className={`rounded-xl px-3 py-2 text-xs font-medium border transition-colors ${
                      local.autoBackupInterval === iv.value
                        ? 'bg-white text-black border-white'
                        : 'bg-white/[0.03] border-white/[0.06] text-white/50 hover:text-white'
                    }`}
                  >
                    {iv.label}
                  </button>
                ))}
              </div>
            </div>
            <Toggle
              checked={local.notifications}
              onChange={(v) => update({ notifications: v })}
              label="Notifications"
              description="Show toast alerts for backups, restores, and sync"
            />
            <div>
              <div className="text-sm font-medium mb-1">Theme</div>
              <div className="text-xs text-white/40 mb-2">Dark mode is the primary experience</div>
              <Badge tone="accent">Dark</Badge>
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Computer name</div>
              <div className="text-sm text-white/60 font-mono">{local.computerName}</div>
            </div>
          </div>
        </Card>

        {/* Google Drive — BYO OAuth */}
        <Card>
          <CardTitle className="mb-1">Google Drive (your own OAuth)</CardTitle>
          <CardDescription className="mb-5">
            You create a free Desktop OAuth client in your Google Cloud project, paste Client ID
            + Client secret here, then Connect. Only your Google account is used — no shared
            100-user limit from our app. We&apos;ll publish a short video for these steps.
          </CardDescription>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 mb-5 space-y-2 text-xs text-white/50 leading-relaxed">
            <div className="text-sm font-medium text-white/80 mb-2">How to get Client ID & secret</div>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>
                Open{' '}
                <a
                  className="text-white underline underline-offset-2"
                  href="https://console.cloud.google.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Cloud Console
                </a>{' '}
                <ExternalLink className="inline h-3 w-3" />
              </li>
              <li>Create a project (or pick one) → enable <strong className="text-white/70">Google Drive API</strong></li>
              <li>
                <strong className="text-white/70">OAuth consent screen</strong> → External → fill app
                name → add your Gmail under <strong className="text-white/70">Test users</strong>
              </li>
              <li>
                <strong className="text-white/70">Credentials</strong> → Create credentials → OAuth
                client ID → type <strong className="text-white/70">Desktop app</strong>
              </li>
              <li>Copy Client ID + Client secret into the fields below → Save → Connect</li>
            </ol>
          </div>

          <div className="space-y-3 mb-5">
            <div>
              <label className="text-xs text-white/45 mb-1.5 block">Client ID</label>
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="123456789-xxx.apps.googleusercontent.com"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div>
              <label className="text-xs text-white/45 mb-1.5 block">Client secret</label>
              <div className="flex gap-2">
                <Input
                  type={showSecret ? 'text' : 'password'}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="GOCSPX-…"
                  autoComplete="off"
                  spellCheck={false}
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={() => setShowSecret((v) => !v)}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                loading={oauthBusy}
                disabled={!clientId.trim() || !clientSecret.trim()}
                onClick={saveOAuth}
              >
                Save credentials
              </Button>
              {(local.googleClientId || local.googleClientSecret) && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={oauthBusy}
                  onClick={async () => {
                    await vault.clearGoogleOAuthCredentials()
                    setClientId('')
                    setClientSecret('')
                    await qc.invalidateQueries({ queryKey: ['settings'] })
                    await qc.invalidateQueries({ queryKey: ['google'] })
                    push({ type: 'info', title: 'Credentials cleared', message: 'Stored OAuth keys removed from this PC' })
                  }}
                >
                  Clear saved keys
                </Button>
              )}
            </div>
            {local.googleClientId && (
              <Badge tone="success">Client ID saved on this machine</Badge>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
                <Cloud className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {google?.connected ? 'Google Drive connected' : 'Not connected'}
                </div>
                <div className="text-xs text-white/40 truncate">
                  {google?.email ||
                    'After saving Client ID + secret, connect your Google account'}
                </div>
              </div>
            </div>
            {google?.connected ? (
              <Button
                size="sm"
                variant="secondary"
                loading={oauthBusy}
                onClick={async () => {
                  await vault.disconnectGoogle()
                  await qc.invalidateQueries({ queryKey: ['google'] })
                  await qc.invalidateQueries({ queryKey: ['settings'] })
                  await qc.invalidateQueries({ queryKey: ['dashboard'] })
                  push({ type: 'info', title: 'Disconnected', message: 'Google Drive unlinked' })
                }}
              >
                Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                loading={oauthBusy}
                disabled={!clientId.trim() || !clientSecret.trim()}
                onClick={connectDrive}
              >
                Connect Google Drive
              </Button>
            )}
          </div>
          <p className="text-[11px] text-white/30 leading-relaxed">
            OAuth Client ID/secret stay on this PC only. Add yourself as a Test user while the
            app is in Testing. Complete Backup uploads full project archives to your Drive.
          </p>
        </Card>

        {/* Simple backup model — no encryption keys */}
        <Card>
          <CardTitle className="mb-1">Backup format</CardTitle>
          <CardDescription className="mb-4">
            Personal tool mode — plain archives, no passwords or encryption keys
          </CardDescription>
          <div className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <HardDrive className="h-5 w-5 shrink-0 text-white/40 mt-0.5" />
            <div className="text-[12px] text-white/45 leading-relaxed space-y-1.5">
              <p>
                Each Complete Backup is a normal <strong className="text-white/70">.avault ZIP</strong>{' '}
                on Drive under <code className="text-white/55">AgentVault/Backups/&lt;project&gt;/</code>.
              </p>
              <p>
                After a full PC reset: install → connect Drive → Cloud Projects → Restore all.
                No vault password. No recovery key.
              </p>
            </div>
          </div>
        </Card>

        {/* Exclusions */}
        <Card>
          <CardTitle className="mb-1">Backup exclusions</CardTitle>
          <CardDescription className="mb-4">
            Patterns skipped during gather (one per line conceptually)
          </CardDescription>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {local.excludePatterns.map((p) => (
              <Badge key={p} tone="muted">
                {p}
              </Badge>
            ))}
          </div>
          <Toggle
            checked={local.includeGitMetadata}
            onChange={(v) => update({ includeGitMetadata: v })}
            label="Include Git metadata"
            description="HEAD, refs, and config — not full object store"
          />
          <div className="mt-4">
            <Toggle
              checked={local.includeTerminalHistory}
              onChange={(v) => update({ includeTerminalHistory: v })}
              label="Include terminal history"
              description="Optional · may contain secrets"
            />
          </div>
        </Card>

        {/* Agents */}
        <Card>
          <CardTitle className="mb-1">Supported agents</CardTitle>
          <CardDescription className="mb-4">
            Plugin-based adapters · implement AgentProvider to add more
          </CardDescription>
          <div className="flex flex-wrap gap-2">
            {[
              'Codex CLI',
              'OpenCode',
              'Claude Code',
              'Continue',
              'Aider',
              'Gemini CLI',
            ].map((name) => (
              <Badge key={name} tone="accent">
                <Shield className="h-3 w-3" />
                {name}
              </Badge>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
