import crypto from 'node:crypto'
import fs from 'fs-extra'

/**
 * Integrity helpers only — no encryption keys.
 * Personal tool: backups are plain ZIP archives (stored as .avault).
 * Drive recovery after PC reset needs no password.
 */
export class EncryptionService {
  async initialize(): Promise<void> {
    /* no keys */
  }

  isUnlocked(): boolean {
    return true
  }

  checksum(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex')
  }

  async checksumFile(filePath: string): Promise<string> {
    const data = await fs.readFile(filePath)
    return this.checksum(data)
  }

  /** True if file looks like the old AES JSON envelope (legacy, not supported for restore) */
  async looksLikeLegacyEncrypted(filePath: string): Promise<boolean> {
    try {
      const buf = await fs.readFile(filePath)
      const head = buf.subarray(0, Math.min(buf.length, 200)).toString('utf8').trim()
      if (!head.startsWith('{')) return false
      const parsed = JSON.parse(buf.toString('utf8')) as {
        ciphertext?: string
        tag?: string
        iv?: string
      }
      return Boolean(parsed.ciphertext && parsed.tag && parsed.iv)
    } catch {
      return false
    }
  }
}

export const encryption = new EncryptionService()
