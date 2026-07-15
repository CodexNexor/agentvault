import crypto from 'node:crypto'
import fs from 'fs-extra'
import path from 'node:path'
import { getAppPaths } from './paths.js'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const SALT_LENGTH = 32
const TAG_LENGTH = 16
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1

export interface EncryptedPayload {
  version: 1
  salt: string
  iv: string
  tag: string
  ciphertext: string
}

export class EncryptionService {
  private masterKey: Buffer | null = null
  private deviceKey: Buffer | null = null
  private unlocked = false

  async initialize(): Promise<void> {
    const { keys } = getAppPaths()
    await fs.ensureDir(keys)
    const deviceKeyPath = path.join(keys, 'device.key')

    if (await fs.pathExists(deviceKeyPath)) {
      this.deviceKey = await fs.readFile(deviceKeyPath)
    } else {
      this.deviceKey = crypto.randomBytes(KEY_LENGTH)
      await fs.writeFile(deviceKeyPath, this.deviceKey, { mode: 0o600 })
    }

    // Default: unlock with device key (no master password yet)
    this.masterKey = this.deviceKey
    this.unlocked = true
  }

  isUnlocked(): boolean {
    return this.unlocked && this.masterKey !== null
  }

  lock(): void {
    this.masterKey = null
    this.unlocked = false
  }

  async hasMasterPassword(): Promise<boolean> {
    const metaPath = path.join(getAppPaths().keys, 'master.meta')
    return fs.pathExists(metaPath)
  }

  async setMasterPassword(password: string): Promise<{ recoveryKey: string }> {
    if (!this.deviceKey) throw new Error('Encryption not initialized')

    const salt = crypto.randomBytes(SALT_LENGTH)
    const derived = await this.deriveKey(password, salt)
    const recoveryKey = crypto.randomBytes(32).toString('base64url')
    const recoverySalt = crypto.randomBytes(SALT_LENGTH)
    const recoveryDerived = await this.deriveKey(recoveryKey, recoverySalt)

    // Wrap device key with password-derived key
    const wrapped = this.encryptBuffer(this.deviceKey, derived)
    const recoveryWrapped = this.encryptBuffer(this.deviceKey, recoveryDerived)

    const meta = {
      salt: salt.toString('base64'),
      wrapped,
      recoverySalt: recoverySalt.toString('base64'),
      recoveryWrapped,
      createdAt: new Date().toISOString(),
    }

    await fs.writeFile(
      path.join(getAppPaths().keys, 'master.meta'),
      JSON.stringify(meta, null, 2),
      { mode: 0o600 }
    )

    this.masterKey = this.deviceKey
    this.unlocked = true

    return { recoveryKey }
  }

  async unlockWithPassword(password: string): Promise<boolean> {
    const metaPath = path.join(getAppPaths().keys, 'master.meta')
    if (!(await fs.pathExists(metaPath))) {
      this.masterKey = this.deviceKey
      this.unlocked = true
      return true
    }

    try {
      const meta = await fs.readJson(metaPath)
      const salt = Buffer.from(meta.salt, 'base64')
      const derived = await this.deriveKey(password, salt)
      this.masterKey = this.decryptBuffer(meta.wrapped, derived)
      this.unlocked = true
      return true
    } catch {
      this.unlocked = false
      this.masterKey = null
      return false
    }
  }

  async unlockWithRecoveryKey(recoveryKey: string): Promise<boolean> {
    const metaPath = path.join(getAppPaths().keys, 'master.meta')
    if (!(await fs.pathExists(metaPath))) return false

    try {
      const meta = await fs.readJson(metaPath)
      const salt = Buffer.from(meta.recoverySalt, 'base64')
      const derived = await this.deriveKey(recoveryKey, salt)
      this.masterKey = this.decryptBuffer(meta.recoveryWrapped, derived)
      this.unlocked = true
      return true
    } catch {
      return false
    }
  }

  private async deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.scrypt(
        password,
        salt,
        KEY_LENGTH,
        { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
        (err, key) => {
          if (err) reject(err)
          else resolve(key)
        }
      )
    })
  }

  private getKey(): Buffer {
    if (!this.masterKey) throw new Error('Vault is locked')
    return this.masterKey
  }

  encryptBuffer(data: Buffer, key?: Buffer): EncryptedPayload {
    const k = key ?? this.getKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, k, iv)
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()])
    const tag = cipher.getAuthTag()

    return {
      version: 1,
      salt: '',
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    }
  }

  decryptBuffer(payload: EncryptedPayload, key?: Buffer): Buffer {
    const k = key ?? this.getKey()
    const iv = Buffer.from(payload.iv, 'base64')
    const tag = Buffer.from(payload.tag, 'base64')
    const ciphertext = Buffer.from(payload.ciphertext, 'base64')
    const decipher = crypto.createDecipheriv(ALGORITHM, k, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  }

  async encryptFile(inputPath: string, outputPath: string): Promise<string> {
    const data = await fs.readFile(inputPath)
    const payload = this.encryptBuffer(data)
    const packed = Buffer.from(JSON.stringify(payload), 'utf8')
    await fs.writeFile(outputPath, packed)
    return this.checksum(packed)
  }

  async decryptFile(inputPath: string, outputPath: string): Promise<void> {
    const packed = await fs.readFile(inputPath)
    const payload = JSON.parse(packed.toString('utf8')) as EncryptedPayload
    const data = this.decryptBuffer(payload)
    await fs.writeFile(outputPath, data)
  }

  checksum(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex')
  }

  async checksumFile(filePath: string): Promise<string> {
    const data = await fs.readFile(filePath)
    return this.checksum(data)
  }

  encryptString(text: string): EncryptedPayload {
    return this.encryptBuffer(Buffer.from(text, 'utf8'))
  }

  decryptString(payload: EncryptedPayload): string {
    return this.decryptBuffer(payload).toString('utf8')
  }
}

export const encryption = new EncryptionService()
