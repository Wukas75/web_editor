/* Lokálny dev server BEZ wrangler/workerd (na Windows padá na "write EOF" – pozri projekt podhajska).
 * Spúšťa reálny Hono router z functions/api s D1 shimom (node:sqlite) a R2 shimom (FS).
 *
 *   node scripts/dev-node.mjs           # http://localhost:8789
 *   node scripts/dev-node.mjs --reset   # zmaže lokálnu DB a médiá a naplní seed nanovo
 *
 * Slúži len na vývoj a kontrolu. Produkcia beží na Cloudflare Pages Functions.
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { extname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'

const ROOT = resolve(import.meta.dirname, '..')
const PUB = join(ROOT, 'public')
const STATE = join(ROOT, '.wrangler', 'devnode')
const DB_PATH = join(STATE, 'd1.sqlite')
const R2_DIR = join(STATE, 'r2')
const PORT = 8789

if (process.argv.includes('--reset') && existsSync(STATE)) rmSync(STATE, { recursive: true, force: true })
mkdirSync(R2_DIR, { recursive: true })

/* ---------- D1 shim ---------- */
const sqlite = new DatabaseSync(DB_PATH)
sqlite.exec('PRAGMA journal_mode = WAL;')
const freshDb = !tableExists('sites')
if (freshDb) {
  sqlite.exec(readFileSync(join(ROOT, 'migrations', '0001_init.sql'), 'utf8'))
  sqlite.exec(readFileSync(join(ROOT, 'migrations', '0002_seed.sql'), 'utf8'))
  console.log('• D1: vytvorená lokálna DB + seed (ukážkový web "demo")')
}
function tableExists(name) {
  try {
    return !!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)
  } catch {
    return false
  }
}
const clean = (p) => (p === undefined ? null : p)
class D1Stmt {
  constructor(sql, params) { this.sql = sql; this.params = params || [] }
  bind(...p) { return new D1Stmt(this.sql, p.map(clean)) }
  async first(col) {
    const row = sqlite.prepare(this.sql).get(...this.params)
    if (row == null) return null
    return col ? row[col] : row
  }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.params), success: true, meta: {} } }
  async run() {
    const r = sqlite.prepare(this.sql).run(...this.params)
    return { success: true, meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }
  }
}
const DB = {
  prepare: (sql) => new D1Stmt(sql),
  async batch(stmts) {
    sqlite.exec('BEGIN')
    try {
      const out = []
      for (const s of stmts) out.push(await s.run())
      sqlite.exec('COMMIT')
      return out
    } catch (e) {
      sqlite.exec('ROLLBACK')
      throw e
    }
  },
}

/* ---------- R2 shim ---------- */
const safeKey = (k) => k.replace(/[^a-zA-Z0-9._/-]/g, '_')
const R2 = {
  async put(key, value, opts) {
    const f = join(R2_DIR, safeKey(key))
    mkdirSync(join(f, '..'), { recursive: true })
    const buf = Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value)
    writeFileSync(f, buf)
    writeFileSync(f + '.meta', JSON.stringify({ contentType: (opts && opts.httpMetadata && opts.httpMetadata.contentType) || 'application/octet-stream', size: buf.length }))
  },
  async get(key) {
    const f = join(R2_DIR, safeKey(key))
    if (!existsSync(f)) return null
    const meta = existsSync(f + '.meta') ? JSON.parse(readFileSync(f + '.meta', 'utf8')) : { contentType: 'application/octet-stream' }
    return {
      body: Readable.toWeb(createReadStream(f)),
      httpEtag: '"' + meta.size + '"',
      writeHttpMetadata(headers) { headers.set('content-type', meta.contentType) },
    }
  },
  async delete(key) {
    for (const ext of ['', '.meta']) {
      const f = join(R2_DIR, safeKey(key)) + ext
      if (existsSync(f)) rmSync(f)
    }
  },
}

const ENV = { DB, R2, SESSION_SECRET: process.env.SESSION_SECRET || 'devnode-secret-0123456789abcdef', SETUP_TOKEN: process.env.SETUP_TOKEN || 'devnode-setup' }

/* ---------- načítanie Functions ---------- */
const { app } = await import('../functions/api/[[route]].js')
const imgMod = await import('../functions/img/[[key]].js')

/* ---------- statické súbory ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp' }
async function serveStatic(pathname, res) {
  let rel = pathname === '/' ? '/index.html' : pathname
  if (!extname(rel)) {
    if (existsSync(join(PUB, rel + '.html'))) rel += '.html'
    else rel = '/index.html'
  }
  const file = join(PUB, rel)
  if (!file.startsWith(PUB) || !existsSync(file)) { res.writeHead(404); res.end('Not found'); return }
  const buf = await readFile(file)
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
  res.end(buf)
}

/* ---------- request bridge ---------- */
function toRequest(req) {
  const url = 'http://localhost:' + PORT + req.url
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(',') : v)
  const hasBody = !['GET', 'HEAD'].includes(req.method)
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? 'half' : undefined,
  })
}
async function sendResponse(r, res) {
  res.writeHead(r.status, Object.fromEntries(r.headers))
  if (r.body) {
    for await (const chunk of Readable.fromWeb(r.body)) res.write(chunk)
  }
  res.end()
}

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(req.url.split('?')[0])
    if (pathname.startsWith('/api/')) {
      return void sendResponse(await app.fetch(toRequest(req), ENV, {}), res)
    }
    if (pathname.startsWith('/img/')) {
      const key = pathname.slice(5)
      const ctx = { env: ENV, params: { key }, request: toRequest(req) }
      return void sendResponse(await imgMod.onRequest(ctx), res)
    }
    await serveStatic(pathname, res)
  } catch (e) {
    console.error(e)
    res.writeHead(500); res.end('dev server error: ' + e.message)
  }
}).listen(PORT, () => {
  console.log('\n  Site Builder (dev-node)  →  http://localhost:' + PORT)
  console.log('  Dashboard:      http://localhost:' + PORT + '/')
  console.log('  Ukážkový web:   http://localhost:' + PORT + '/s.html?site=demo')
  console.log('  Setup token:   ', ENV.SETUP_TOKEN, '\n')
})
