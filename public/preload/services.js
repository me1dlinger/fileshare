const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const os = require('node:os')
const crypto = require('node:crypto')

// ============================================================
//  State
// ============================================================
let server = null
let serverConfig = {
  port: 23456,
  ip: '',
  token: '',
  running: false
}
let shareItems = []
let shareIdCounter = 0
let webUiHtml = ''
let downloadLogs = []       // { ip, filePath, fileName, timestamp }
let ipWhitelist = []        // ['192.168.1.100', ...]
let lastLogMap = {}         // dedup: { 'ip|path': timestamp }

// ============================================================
//  Persistence helpers
// ============================================================
function loadState() {
  try {
    const savedShares = window.ztools.dbStorage.getItem('z-share-shares')
    if (savedShares) shareItems = savedShares
    const savedCounter = window.ztools.dbStorage.getItem('z-share-counter')
    if (savedCounter !== null && savedCounter !== undefined) shareIdCounter = savedCounter
    const savedConfig = window.ztools.dbStorage.getItem('z-share-config')
    if (savedConfig) {
      serverConfig.port = savedConfig.port || 23456
      serverConfig.ip = savedConfig.ip || ''
      serverConfig.token = savedConfig.token || ''
    }
    if (!serverConfig.token) {
      serverConfig.token = crypto.randomBytes(8).toString('hex')
      saveConfig()
    }
    const savedLogs = window.ztools.dbStorage.getItem('z-share-logs')
    if (savedLogs) downloadLogs = savedLogs
    const savedWhitelist = window.ztools.dbStorage.getItem('z-share-whitelist')
    if (savedWhitelist) ipWhitelist = savedWhitelist
  } catch (_e) { /* ignore */ }
}

function saveShares() {
  try {
    window.ztools.dbStorage.setItem('z-share-shares', shareItems)
    window.ztools.dbStorage.setItem('z-share-counter', shareIdCounter)
  } catch (_e) { /* ignore */ }
}

function saveConfig() {
  try {
    window.ztools.dbStorage.setItem('z-share-config', {
      port: serverConfig.port,
      ip: serverConfig.ip,
      token: serverConfig.token
    })
  } catch (_e) { /* ignore */ }
}

function saveLogs() {
  try {
    if (downloadLogs.length > 500) downloadLogs = downloadLogs.slice(-500)
    window.ztools.dbStorage.setItem('z-share-logs', downloadLogs)
  } catch (_e) { /* ignore */ }
}

function saveWhitelist() {
  try {
    window.ztools.dbStorage.setItem('z-share-whitelist', ipWhitelist)
  } catch (_e) { /* ignore */ }
}

// ============================================================
//  MIME type mapping
// ============================================================
const MIME_TYPES = {
  '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css',
  '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.ts': 'text/typescript', '.tsx': 'text/typescript', '.jsx': 'text/javascript',
  '.json': 'application/json', '.xml': 'application/xml',
  '.txt': 'text/plain', '.log': 'text/plain', '.csv': 'text/csv',
  '.md': 'text/markdown', '.markdown': 'text/markdown',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.flac': 'audio/flac', '.aac': 'audio/aac', '.m4a': 'audio/mp4',
  '.wma': 'audio/x-ms-wma',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo', '.mov': 'video/quicktime',
  '.flv': 'video/x-flv', '.wmv': 'video/x-ms-wmv',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip', '.tar': 'application/x-tar',
  '.gz': 'application/gzip', '.7z': 'application/x-7z-compressed',
  '.py': 'text/x-python', '.java': 'text/x-java',
  '.c': 'text/x-c', '.cpp': 'text/x-c++', '.h': 'text/x-c',
  '.rs': 'text/x-rust', '.go': 'text/x-go',
  '.rb': 'text/x-ruby', '.php': 'text/x-php',
  '.swift': 'text/x-swift', '.kt': 'text/x-kotlin',
  '.sh': 'text/x-shellscript', '.bat': 'text/x-batch',
  '.ps1': 'text/x-powershell', '.sql': 'text/x-sql',
  '.yml': 'text/yaml', '.yaml': 'text/yaml', '.toml': 'text/toml',
  '.ini': 'text/plain', '.cfg': 'text/plain', '.conf': 'text/plain',
  '.env': 'text/plain', '.scss': 'text/x-scss', '.less': 'text/x-less',
  '.vue': 'text/x-vue', '.svelte': 'text/x-svelte',
  '.scala': 'text/x-scala', '.dart': 'text/x-dart',
  '.lua': 'text/x-lua', '.r': 'text/x-r',
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_TYPES[ext] || 'application/octet-stream'
}

// ============================================================
//  Web UI HTML loader
// ============================================================
function loadWebUi() {
  try {
    const htmlPath = path.join(__dirname, '..', 'web', 'index.html')
    if (fs.existsSync(htmlPath)) {
      webUiHtml = fs.readFileSync(htmlPath, 'utf-8')
    }
  } catch (_e) {
    webUiHtml = '<!doctype html><html><body><h1>File Share</h1><p>Web UI not found.</p></body></html>'
  }
}

// ============================================================
//  File scanning
// ============================================================
function scanDirectory(dirPath) {
  const result = { fileCount: 0, files: [] }
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(dirPath, entry.name)
      try {
        if (entry.isDirectory()) {
          result.files.push({ path: fullPath, name: entry.name, isDirectory: true })
          const sub = scanDirectory(fullPath)
          result.fileCount += sub.fileCount
          result.files.push(...sub.files)
        } else if (entry.isFile()) {
          result.files.push({ path: fullPath, name: entry.name, isDirectory: false })
          result.fileCount++
        }
      } catch (_e) { /* skip */ }
    }
  } catch (_e) { /* skip */ }
  return result
}

function countFilesInDir(dirPath) {
  let count = 0
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      try {
        if (entry.isDirectory()) {
          count += countFilesInDir(path.join(dirPath, entry.name))
        } else if (entry.isFile()) {
          count++
        }
      } catch (_e) { /* skip */ }
    }
  } catch (_e) { /* skip */ }
  return count
}

// ============================================================
//  Build share tree for a directory
// ============================================================
function buildDirTree(dirPath, basePath) {
  const name = path.basename(dirPath)
  const children = []
  let fileCount = 0

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(dirPath, entry.name)
      try {
        if (entry.isDirectory()) {
          const subtree = buildDirTree(fullPath, basePath)
          children.push(subtree)
          fileCount += subtree.fileCount
        } else if (entry.isFile()) {
          children.push({
            id: String(++shareIdCounter),
            path: fullPath,
            name: entry.name,
            isDirectory: false,
            enabled: true
          })
          fileCount++
        }
      } catch (_e) { /* skip */ }
    }
  } catch (_e) { /* skip */ }

  return {
    id: String(++shareIdCounter),
    path: dirPath,
    name: name,
    isDirectory: true,
    enabled: true,
    children: children,
    fileCount: fileCount
  }
}

// ============================================================
//  Recursively find/update items in tree
// ============================================================
function findItemById(items, id) {
  for (const item of items) {
    if (item.id === id) return item
    if (item.children) {
      const found = findItemById(item.children, id)
      if (found) return found
    }
  }
  return null
}

function removeItemById(items, id) {
  const idx = items.findIndex(i => i.id === id)
  if (idx !== -1) {
    items.splice(idx, 1)
    return true
  }
  for (const item of items) {
    if (item.children) {
      if (removeItemById(item.children, id)) return true
    }
  }
  return false
}

// ============================================================
//  Build API tree, optionally scoped to a sub-path
// ============================================================
function buildApiTree(items, scopePath) {
  // If scoped, search recursively for the matching item
  if (scopePath) {
    const normScope = scopePath.replace(/\\/g, '/')
    const found = findItemByPath(items, normScope)
    if (found) {
      if (!found.enabled) return []
      const node = {
        name: found.name,
        path: found.path,
        isDirectory: found.isDirectory
      }
      if (found.children && found.children.length > 0) {
        node.children = buildApiTree(found.children)
        if (node.children.length === 0) return []
      }
      return [node]
    }
    return []
  }

  // No scope: return full tree
  return items
    .filter(item => item.enabled)
    .map(item => {
      const node = {
        name: item.name,
        path: item.path,
        isDirectory: item.isDirectory
      }
      if (item.children && item.children.length > 0) {
        node.children = buildApiTree(item.children)
        if (node.children.length === 0) return null
      }
      return node
    })
    .filter(Boolean)
}

// Find item by file system path, recursively
function findItemByPath(items, searchPath) {
  for (const item of items) {
    const itemPath = item.path.replace(/\\/g, '/')
    if (itemPath === searchPath) return item
    // Check if searchPath is inside this directory
    if (item.isDirectory && item.children && searchPath.startsWith(itemPath + '/')) {
      const found = findItemByPath(item.children, searchPath)
      if (found) return found
    }
  }
  return null
}

// ============================================================
//  Deep clone helper
// ============================================================
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

// ============================================================
//  HTTP Server
// ============================================================
function createServer(port, ip) {
  return http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Parse URL
    const urlObj = new URL(req.url, `http://${ip}:${port}`)
    const token = urlObj.searchParams.get('token') || ''

    // Auth check — skip if IP is whitelisted
    const clientIp = (req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                      req.socket.remoteAddress || '').replace('::ffff:', '')
    const isWhitelisted = ipWhitelist.includes(clientIp)

    if (token !== serverConfig.token && !isWhitelisted) {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#f1f5f9}h1{font-size:1.5rem}</style></head><body><h1>访问被拒绝</h1></body></html>')
      return
    }

    const pathname = urlObj.pathname

    // --- Route: GET / ---
    if (pathname === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(webUiHtml)
      return
    }

    // --- Route: GET /api/list ---
    if (pathname === '/api/list' && req.method === 'GET') {
      const scopePath = urlObj.searchParams.get('path') || ''
      const tree = buildApiTree(shareItems, scopePath || null)
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ files: tree, token: serverConfig.token, scoped: !!scopePath, scopePath: scopePath || '' }))
      return
    }

    // --- Route: GET /api/file?path=xxx ---
    if (pathname === '/api/file' && req.method === 'GET') {
      const filePath = urlObj.searchParams.get('path') || ''
      const isDownload = urlObj.searchParams.get('dl') === '1'
      serveFile(req, res, filePath, isDownload, clientIp)
      return
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  })
}

function serveFile(req, res, filePath, isDownload, clientIp) {
  if (!filePath) {
    res.writeHead(400)
    res.end('Missing path parameter')
    return
  }

  const normalized = path.normalize(filePath)
  if (!fs.existsSync(normalized)) {
    res.writeHead(404)
    res.end('File not found')
    return
  }

  const stat = fs.statSync(normalized)
  if (stat.isDirectory()) {
    res.writeHead(400)
    res.end('Cannot serve directory')
    return
  }

  // --- Download logging (only for explicit downloads, not previews) ---
  if (isDownload) {
    const ip = clientIp || 'unknown'
    const dedupKey = ip + '|' + normalized
    const now = Date.now()
    // Dedup: skip if same IP+path logged within 3 seconds
    if (!lastLogMap[dedupKey] || now - lastLogMap[dedupKey] > 3000) {
      lastLogMap[dedupKey] = now
      downloadLogs.push({
        ip: ip,
        filePath: normalized,
        fileName: path.basename(normalized),
        timestamp: new Date().toISOString()
      })
      saveLogs()
    }
  }

  const mimeType = getMimeType(normalized)
  const fileSize = stat.size
  const fileName = path.basename(normalized)
  const encodedName = encodeURIComponent(fileName)

  // Handle Range requests (for audio/video seeking)
  const range = req.headers.range
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
    const chunkSize = end - start + 1

    res.writeHead(206, {
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename*=UTF-8''${encodedName}`,
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Cache-Control': 'public, max-age=3600'
    })

    const stream = fs.createReadStream(normalized, { start, end })
    stream.pipe(res)
    stream.on('error', () => { res.end() })
    return
  }

  res.writeHead(200, {
    'Content-Type': mimeType,
    'Content-Disposition': `inline; filename*=UTF-8''${encodedName}`,
    'Content-Length': fileSize,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=3600'
  })

  const stream = fs.createReadStream(normalized)
  stream.pipe(res)
  stream.on('error', () => { res.end() })
}

// ============================================================
//  Exported Services
// ============================================================
window.services = {
  // ---- Server control ----
  startServer(port, ip) {
    if (server) {
      server.close()
      server = null
    }
    serverConfig.port = port
    serverConfig.ip = ip
    serverConfig.running = true   // optimistic: set immediately for UI
    try {
      server = createServer(port, ip)
      server.listen(port, ip, () => {
        serverConfig.running = true
      })
      server.on('error', (err) => {
        serverConfig.running = false
        server = null
        console.error('Server error:', err.message)
      })
      saveConfig()
      return true
    } catch (err) {
      serverConfig.running = false
      console.error('Failed to start server:', err.message)
      return false
    }
  },

  stopServer() {
    if (server) {
      server.close()
      server = null
    }
    serverConfig.running = false
  },

  getServerStatus() {
    return {
      port: serverConfig.port,
      ip: serverConfig.ip,
      token: serverConfig.token,
      running: serverConfig.running
    }
  },

  // ---- Token management ----
  regenerateToken() {
    serverConfig.token = crypto.randomBytes(8).toString('hex')
    saveConfig()
    return serverConfig.token
  },

  // ---- Share management ----
  addShares(filePaths) {
    const added = []
    const skipped = []

    for (const fp of filePaths) {
      try {
        const stat = fs.statSync(fp)
        const name = path.basename(fp)

        const exists = shareItems.some(item => item.path === fp)
        if (exists) {
          skipped.push(name)
          continue
        }

        if (stat.isDirectory()) {
          const tree = buildDirTree(fp, fp)
          shareItems.push(tree)
          added.push(tree)
        } else {
          const item = {
            id: String(++shareIdCounter),
            path: fp,
            name: name,
            isDirectory: false,
            enabled: true
          }
          shareItems.push(item)
          added.push(item)
        }
      } catch (_e) {
        skipped.push(path.basename(fp))
      }
    }

    saveShares()
    return { added, skipped }
  },

  removeShare(id) {
    const removed = removeItemById(shareItems, id)
    if (removed) saveShares()
    return removed
  },

  toggleShare(id, enabled) {
    const item = findItemById(shareItems, id)
    if (item) {
      item.enabled = enabled
      saveShares()
      return true
    }
    return false
  },

  getShareList() {
    // Deep clone so Vue detects changes
    return deepClone(shareItems)
  },

  // ---- Network ----
  getNetworkInterfaces() {
    const interfaces = os.networkInterfaces()
    const result = []
    for (const [name, addrs] of Object.entries(interfaces)) {
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          result.push({
            name: name,
            ip: addr.address,
            family: addr.family,
            internal: addr.internal
          })
        }
      }
    }
    return result
  },

  // ---- File scanning ----
  scanDirectory(dirPath) {
    const count = countFilesInDir(dirPath)
    const files = []
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        files.push({
          path: path.join(dirPath, entry.name),
          name: entry.name,
          isDirectory: entry.isDirectory()
        })
      }
    } catch (_e) { /* skip */ }
    return { fileCount: count, files }
  },

  // ---- Token ----
  getAccessToken() {
    return serverConfig.token
  },

  // ---- Web UI ----
  getWebUiHtml() {
    return webUiHtml
  },

  // ---- Download Logs ----
  getDownloadLogs() {
    return downloadLogs.slice()
  },

  clearDownloadLogs() {
    downloadLogs = []
    saveLogs()
  },

  // ---- IP Whitelist ----
  getWhitelist() {
    return ipWhitelist.slice()
  },

  addWhitelist(ip) {
    const trimmed = ip.trim()
    if (!trimmed || ipWhitelist.includes(trimmed)) return false
    // Basic IPv4 validation
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) return false
    ipWhitelist.push(trimmed)
    saveWhitelist()
    return true
  },

  removeWhitelist(ip) {
    const idx = ipWhitelist.indexOf(ip)
    if (idx === -1) return false
    ipWhitelist.splice(idx, 1)
    saveWhitelist()
    return true
  },

  // ---- Text Sharing ----
  shareText(text) {
    if (!text || !text.trim()) return null
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const fileName = `share_${ts}.txt`
    const filePath = path.join(window.ztools.getPath('downloads'), fileName)
    try {
      fs.writeFileSync(filePath, text, { encoding: 'utf-8' })
      const item = {
        id: String(++shareIdCounter),
        path: filePath,
        name: fileName,
        isDirectory: false,
        enabled: true
      }
      shareItems.push(item)
      saveShares()
      return item
    } catch (_e) {
      return null
    }
  }
}

// ============================================================
//  Initialize
// ============================================================
loadState()
loadWebUi()
