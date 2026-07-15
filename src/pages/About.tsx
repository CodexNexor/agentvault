import { motion } from 'framer-motion'
import { Shield, Heart } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

export function AboutPage() {
  return (
    <div>
      <TopBar title="About" subtitle="AgentVault" />
      <div className="p-6 max-w-[640px]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="text-center py-10">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
              <Shield className="h-8 w-8 text-black" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight mb-2">AgentVault</h2>
            <p className="text-white/45 mb-4 max-w-sm mx-auto">
              Never lose your AI coding history again. Premium backup & restore for local-first AI coding agents.
            </p>
            <div className="flex justify-center gap-2 mb-8">
              <Badge tone="accent">v1.0.0</Badge>
              <Badge>Plain ZIP</Badge>
              <Badge>Electron</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-left max-w-md mx-auto">
              {[
                'Plugin-based agent adapters',
                'Full project + IDE history',
                'Google Drive sync',
                'Automatic path repair',
                'Background auto-backup',
                'Integrity verification',
              ].map((f) => (
                <div
                  key={f}
                  className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5 text-xs text-white/55"
                >
                  {f}
                </div>
              ))}
            </div>
            <p className="mt-8 text-xs text-white/25 inline-flex items-center gap-1.5">
              Built with <Heart className="h-3 w-3 text-red-400" /> for developers
            </p>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
