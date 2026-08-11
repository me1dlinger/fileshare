export interface NetworkInterface {
  name: string
  ip: string
  family: string
  internal: boolean
}

export interface SharedItem {
  id: string
  path: string
  name: string
  isDirectory: boolean
  enabled: boolean
  children?: SharedItem[]
  fileCount?: number
}

export interface ServerConfig {
  port: number
  ip: string
  token: string
  running: boolean
}

export interface ScanResult {
  fileCount: number
  files: { path: string; name: string; isDirectory: boolean }[]
}

export interface DownloadLog {
  ip: string
  filePath: string
  fileName: string
  timestamp: string
}

export interface TextShareResult {
  id: string
  path: string
  name: string
  isDirectory: boolean
  enabled: boolean
}
