/**
 * Future-ready cloud storage provider interface.
 * Google Drive is implemented; others can plug in without UI changes.
 */
export interface StorageProvider {
  readonly id: string
  readonly name: string

  connect(): Promise<{ connected: boolean; accountLabel?: string }>
  disconnect(): Promise<void>
  isConnected(): boolean

  ensureStructure(): Promise<void>
  upload(localPath: string, remotePath: string): Promise<string>
  download(remoteId: string, localPath: string): Promise<void>
  list(prefix?: string): Promise<Array<{ id: string; name: string; size: number }>>
  remove(remoteId: string): Promise<void>
}

export type StorageProviderId =
  | 'google-drive'
  | 'local'
  | 'dropbox'
  | 'onedrive'
  | 'icloud'
  | 's3'
  | 'r2'
  | 'supabase'
  | 'github'
  | 'backblaze'
  | 'webdav'
