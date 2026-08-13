/// <reference types="vite/client" />
/// <reference types="@ztools-center/ztools-api-types" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

interface NetworkInterface {
  name: string
  ip: string
  family: string
  internal: boolean
}

interface SharedItem {
  id: string
  path: string
  name: string
  isDirectory: boolean
  enabled: boolean
  children?: SharedItem[]
  fileCount?: number
  origin?: { type: 'upload'; ip: string; time: string }
  hash?: string
  hashSize?: number
  hashMtime?: number
}

interface ServerConfig {
  port: number
  ip: string
  token: string
  running: boolean
}

interface ScanResult {
  fileCount: number
  files: { path: string; name: string; isDirectory: boolean }[]
}

interface DownloadLog {
  type?: 'download' | 'upload'
  ip: string
  filePath: string
  fileName: string
  size?: number
  timestamp: string
}

interface Services {
  startServer: (port: number, ip: string) => Promise<{ ok: boolean; error?: string }>
  stopServer: () => void
  setPort: (port: number) => boolean
  getFreePort: (ip: string) => Promise<number>
  getServerStatus: () => ServerConfig
  regenerateToken: () => string
  addShares: (paths: string[]) => { added: SharedItem[]; skipped: string[] }
  removeShare: (id: string) => boolean
  toggleShare: (id: string, enabled: boolean) => boolean
  getShareList: () => SharedItem[]
  getNetworkInterfaces: () => NetworkInterface[]
  scanDirectory: (dirPath: string) => ScanResult
  getAccessToken: () => string
  getWebUiHtml: () => string
  getDownloadLogs: () => DownloadLog[]
  clearDownloadLogs: () => void
  getWhitelist: () => string[]
  addWhitelist: (ip: string) => boolean
  removeWhitelist: (ip: string) => boolean
  shareText: (text: string) => SharedItem | null
}

declare global {
  interface Window {
    services: Services
  }
}

export {}
