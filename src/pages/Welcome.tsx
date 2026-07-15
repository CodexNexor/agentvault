import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shield, Cloud, HardDrive, Lock, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { vault } from '@/lib/api'
import { useToastStore } from '@/stores/toast-store'
import { useQueryClient } from '@tanstack/react-query'

export function WelcomePage() {
  const navigate = useNavigate()
  const push = useToastStore((s) => s.push)
  const qc = useQueryClient()
  const [loading, setLoading] = useState<'google' | 'offline' | null>(null)

  const finish = async (mode: 'google' | 'offline') => {
    setLoading(mode)
    try {
      await vault.completeFirstLaunch(mode)
      await qc.invalidateQueries({ queryKey: ['settings'] })
      if (mode === 'google') {
        push({
          type: 'success',
          title: 'Google Drive Connected',
          message: 'Your project backups will sync to the cloud.',
        })
      }
      navigate('/', { replace: true })
    } catch (err) {
      push({
        type: 'error',
        title: 'Setup failed',
        message: err instanceof Error ? err.message : 'Please try again',
      })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="relative flex h-full items-center justify-center ambient-bg noise overflow-hidden">
      {/* Decorative orbs */}
      <div className="pointer-events-none absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-white/[0.04] blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 h-80 w-80 rounded-full bg-white/[0.03] blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-lg px-6 text-center"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
          className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-[22px] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
        >
          <Shield className="h-10 w-10 text-black" strokeWidth={1.75} />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-4xl font-semibold tracking-tight mb-3"
        >
          AgentVault
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="text-lg text-white/50 mb-3 leading-relaxed"
        >
          Never lose your AI coding history again.
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32 }}
          className="text-sm text-white/35 mb-10 leading-relaxed max-w-md mx-auto"
        >
          Built for developers who live in Claude Code, Codex, Aider, and friends.
          We back up the project and the chats — so a new laptop feels like home.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="space-y-3"
        >
          <Button
            size="lg"
            className="w-full"
            loading={loading === 'google'}
            onClick={() => finish('google')}
          >
            <Cloud className="h-5 w-5" />
            Sign in with Google
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="w-full"
            loading={loading === 'offline'}
            onClick={() => finish('offline')}
          >
            <HardDrive className="h-5 w-5" />
            Continue Offline
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-12 grid grid-cols-3 gap-3"
        >
          {[
            { icon: Lock, label: 'AES-256-GCM' },
            { icon: Cloud, label: 'Google Drive' },
            { icon: Sparkles, label: 'Auto Backup' },
          ].map((f) => (
            <div
              key={f.label}
              className="rounded-2xl border border-white/[0.05] bg-white/[0.02] px-3 py-3.5"
            >
              <f.icon className="mx-auto mb-2 h-4 w-4 text-white" />
              <div className="text-[11px] text-white/45 font-medium">{f.label}</div>
            </div>
          ))}
        </motion.div>

        <p className="mt-8 text-[11px] text-white/25 leading-relaxed">
          Backups go to your Google Drive only. Personal tool — no encryption passwords.
        </p>
      </motion.div>
    </div>
  )
}
