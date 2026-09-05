// API pre Site Builder – Cloudflare Pages Function (Hono).
// Obsluhuje všetky /api/* cesty. Dáta: D1 (binding DB), médiá: R2 (binding R2).

import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

const app = new Hono().basePath('/api')
const enc = new TextEncoder()
const dec = new TextDecoder()

/* ---------- pomocné: base64 / crypto ---------- */

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const b64d = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0))
const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64urld = (str) => {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  return b64d(str)
}

async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key,
    256,
  )
  return b64(bits)
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { hash: await pbkdf2(password, salt), salt: b64(salt) }
}
async function verifyPassword(password, hashB64, saltB64) {
  const h = await pbkdf2(password, b64d(saltB64))
  return timingSafeEqual(h, hashB64)
}
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return b64url(sig)
}
async function makeSession(secret, uid, days = 30) {
  const payload = b64url(enc.encode(JSON.stringify({ uid, exp: Date.now() + days * 864e5 })))
  return `${payload}.${await hmac(secret, payload)}`
}
async function readSession(secret, token) {
  if (!token || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  if (!timingSafeEqual(await hmac(secret, payload), sig)) return null
  try {
    const obj = JSON.parse(dec.decode(b64urld(payload)))
    if (!obj.exp || obj.exp < Date.now()) return null
    return obj
  } catch {
    return null
  }
}

/* ---------- pomocné: rôzne ---------- */

const safeJson = (str, fallback) => {
  try {
    return str ? JSON.parse(str) : fallback
  } catch {
    return fallback
  }
}

const COMBINING = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g')
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

const ALLOWED = new Set(['p', 'br', 'strong', 'em', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'img', 'blockquote'])
const attr = (attrs, name) => {
  const m = attrs.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i')) || attrs.match(new RegExp(name + "\\s*=\\s*'([^']*)'", 'i'))
  return m ? m[1] : ''
}
function sanitizeHtml(html) {
  if (!html) return ''
  let s = String(html)
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(/<(script|style|iframe|object|embed|form|input|textarea|link|meta|svg)[\s\S]*?<\/\1>/gi, '')
  s = s.replace(/<(script|style|iframe|object|embed|form|input|textarea|link|meta|svg)[^>]*>/gi, '')
  s = s.replace(/<(\/?)([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (m, close, tag, attrs) => {
    tag = tag.toLowerCase()
    if (tag === 'b') tag = 'strong'
    if (tag === 'i') tag = 'em'
    if (tag === 'div') tag = 'p'
    if (!ALLOWED.has(tag)) return ''
    if (close) return `</${tag}>`
    if (tag === 'a') {
      const href = attr(attrs, 'href')
      return /^(https?:|mailto:|#|\/)/i.test(href)
        ? `<a href="${href.replace(/"/g, '&quot;')}" rel="noopener">`
        : '<a>'
    }
    if (tag === 'img') {
      const src = attr(attrs, 'src')
      if (!/^\/img\//.test(src)) return ''
      return `<img src="${src.replace(/"/g, '&quot;')}" alt="${attr(attrs, 'alt').replace(/"/g, '&quot;')}" loading="lazy">`
    }
    if (tag.match(/^h[23]$/)) {
      const id = attr(attrs, 'id')
      return id ? `<${tag} id="${id.replace(/"/g, '&quot;')}">` : `<${tag}>`
    }
    return `<${tag}>`
  })
  return s.trim()
}

function sanitizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return []
  return blocks
    .map((b) => {
      if (!b || typeof b !== 'object') return null
      const id = String(b.id || crypto.randomUUID().slice(0, 8))
      if (b.type === 'hero_slider') {
        const slides = Array.isArray(b.slides) ? b.slides : []
        return {
          type: 'hero_slider',
          id,
          intervalMs: Number(b.intervalMs) || 6000,
          slides: slides.slice(0, 10).map((s) => ({
            id: String(s.id || crypto.randomUUID().slice(0, 8)),
            imageUrl: /^\/img\//.test(s.imageUrl || '') ? s.imageUrl : '',
            heading: String(s.heading || '').slice(0, 200),
            subheading: String(s.subheading || '').slice(0, 300),
            buttonText: String(s.buttonText || '').slice(0, 60),
            buttonLink: String(s.buttonLink || '').slice(0, 300),
          })),
        }
      }
      if (b.type === 'text') {
        const cols = Array.isArray(b.columns) ? b.columns : []
        return { type: 'text', id, columns: cols.slice(0, 4).map((c) => ({ html: sanitizeHtml(c && c.html) })) }
      }
      if (b.type === 'image') {
        return {
          type: 'image',
          id,
          imageUrl: /^\/img\//.test(b.imageUrl || '') ? b.imageUrl : '',
          caption: String(b.caption || '').slice(0, 300),
          width: b.width === 'full' ? 'full' : 'contained',
        }
      }
      if (b.type === 'gallery') {
        const images = Array.isArray(b.images) ? b.images : []
        return {
          type: 'gallery',
          id,
          columns: [2, 3, 4].includes(Number(b.columns)) ? Number(b.columns) : 3,
          images: images
            .filter((im) => im && /^\/img\//.test(im.imageUrl || ''))
            .slice(0, 60)
            .map((im) => ({ imageUrl: im.imageUrl, alt: String(im.alt || '').slice(0, 200) })),
        }
      }
      return null
    })
    .filter(Boolean)
}

const bad = (c, msg, code = 400) => c.json({ error: msg }, code)

/* ---------- auth middleware ---------- */

async function requireAuth(c, next) {
  const sess = await readSession(c.env.SESSION_SECRET, getCookie(c, 'sb_session'))
  if (!sess) return bad(c, 'Neprihlásený', 401)
  c.set('uid', sess.uid)
  await next()
}

async function loadSiteOr404(c, id) {
  const site = await c.env.DB.prepare('SELECT * FROM sites WHERE id = ?').bind(id).first()
  return site || null
}

/* ================= PUBLIC ================= */

app.get('/site/:slug', async (c) => {
  const db = c.env.DB
  const site = await db.prepare('SELECT id, name, slug FROM sites WHERE slug = ?').bind(c.req.param('slug')).first()
  if (!site) return bad(c, 'Web neexistuje', 404)
  const [pages, menu, theme] = await Promise.all([
    db.prepare('SELECT slug, title, is_home FROM pages WHERE site_id = ? ORDER BY sort, id').bind(site.id).all(),
    db.prepare('SELECT id, label, link_type, target FROM menu_items WHERE site_id = ? ORDER BY sort, id').bind(site.id).all(),
    db.prepare('SELECT theme_vars, custom_css FROM site_theme WHERE site_id = ?').bind(site.id).first(),
  ])
  return c.json({
    site,
    pages: pages.results || [],
    menu: menu.results || [],
    theme_vars: safeJson(theme && theme.theme_vars, {}),
    custom_css: (theme && theme.custom_css) || '',
  })
})

app.get('/site/:slug/page/:pageSlug', async (c) => {
  const db = c.env.DB
  const site = await db.prepare('SELECT id, name, slug FROM sites WHERE slug = ?').bind(c.req.param('slug')).first()
  if (!site) return bad(c, 'Web neexistuje', 404)
  const [page, pages, menu, theme] = await Promise.all([
    db.prepare('SELECT id, slug, title, content_json, is_home FROM pages WHERE site_id = ? AND slug = ?').bind(site.id, c.req.param('pageSlug')).first(),
    db.prepare('SELECT slug, title, is_home FROM pages WHERE site_id = ? ORDER BY sort, id').bind(site.id).all(),
    db.prepare('SELECT id, label, link_type, target FROM menu_items WHERE site_id = ? ORDER BY sort, id').bind(site.id).all(),
    db.prepare('SELECT theme_vars, custom_css FROM site_theme WHERE site_id = ?').bind(site.id).first(),
  ])
  if (!page) return bad(c, 'Stránka neexistuje', 404)
  return c.json({
    site,
    page: { slug: page.slug, title: page.title, is_home: !!page.is_home, blocks: safeJson(page.content_json, []) },
    pages: pages.results || [],
    menu: menu.results || [],
    theme_vars: safeJson(theme && theme.theme_vars, {}),
    custom_css: (theme && theme.custom_css) || '',
  })
})

/* ================= AUTH ================= */

app.get('/auth/me', async (c) => {
  const sess = await readSession(c.env.SESSION_SECRET, getCookie(c, 'sb_session'))
  return c.json({ authed: !!sess })
})

app.post('/auth/login', async (c) => {
  const { username, password } = await c.req.json().catch(() => ({}))
  if (!username || !password) return bad(c, 'Zadaj meno a heslo')
  const user = await c.env.DB.prepare('SELECT id, password_hash, password_salt FROM admin_users WHERE username = ?')
    .bind(String(username).trim())
    .first()
  const ok = user && (await verifyPassword(password, user.password_hash, user.password_salt))
  if (!ok) return bad(c, 'Nesprávne meno alebo heslo', 401)
  const token = await makeSession(c.env.SESSION_SECRET, user.id)
  setCookie(c, 'sb_session', token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return c.json({ ok: true })
})

app.post('/auth/logout', (c) => {
  deleteCookie(c, 'sb_session', { path: '/' })
  return c.json({ ok: true })
})

app.post('/setup', async (c) => {
  const { username, password, token } = await c.req.json().catch(() => ({}))
  if (!token || token !== c.env.SETUP_TOKEN) return bad(c, 'Neplatný setup token', 403)
  if (!username || !password || String(password).length < 8) return bad(c, 'Heslo musí mať aspoň 8 znakov')
  const { count } = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM admin_users').first()
  if (count > 0) return bad(c, 'Administrátor už existuje', 409)
  const { hash, salt } = await hashPassword(password)
  await c.env.DB.prepare('INSERT INTO admin_users (username, password_hash, password_salt) VALUES (?, ?, ?)')
    .bind(String(username).trim(), hash, salt)
    .run()
  return c.json({ ok: true })
})

/* ================= ADMIN ================= */

app.use('/admin/*', requireAuth)

app.post('/admin/password', async (c) => {
  const { current, next } = await c.req.json().catch(() => ({}))
  if (!next || String(next).length < 8) return bad(c, 'Nové heslo musí mať aspoň 8 znakov')
  const user = await c.env.DB.prepare('SELECT password_hash, password_salt FROM admin_users WHERE id = ?')
    .bind(c.get('uid'))
    .first()
  if (!user || !(await verifyPassword(current, user.password_hash, user.password_salt)))
    return bad(c, 'Súčasné heslo nesedí', 403)
  const { hash, salt } = await hashPassword(next)
  await c.env.DB.prepare("UPDATE admin_users SET password_hash = ?, password_salt = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(hash, salt, c.get('uid'))
    .run()
  return c.json({ ok: true })
})

/* ---- weby ---- */

app.get('/admin/sites', async (c) => {
  const r = await c.env.DB.prepare('SELECT id, name, slug, created_at FROM sites ORDER BY id').all()
  return c.json(r.results || [])
})

app.post('/admin/sites', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  if (!b.name) return bad(c, 'Názov webu je povinný')
  const db = c.env.DB
  let slug = slugify(b.slug || b.name) || 'web'
  for (let i = 0; i < 50; i++) {
    const hit = await db.prepare('SELECT id FROM sites WHERE slug = ?').bind(slug).first()
    if (!hit) break
    slug = `${slugify(b.slug || b.name)}-${i + 2}`
  }
  const res = await db.prepare('INSERT INTO sites (name, slug) VALUES (?, ?) RETURNING id').bind(b.name, slug).first()
  await db.prepare('INSERT INTO site_theme (site_id, theme_vars, custom_css) VALUES (?, ?, ?)')
    .bind(res.id, '{"primary":"#1a5f4a","secondary":"#c9a24b","bg":"#ffffff","text":"#1f2320","headerBg":"#ffffff","headerText":"#1f2320","font":"Inter","headingFont":"Poppins","radius":"10","containerWidth":"1180"}', '')
    .run()
  await db.prepare("INSERT INTO pages (site_id, slug, title, is_home, sort, content_json) VALUES (?, 'home', 'Domov', 1, 0, '[]')").bind(res.id).run()
  return c.json({ ok: true, id: res.id, slug })
})

app.get('/admin/sites/:id', async (c) => {
  const site = await loadSiteOr404(c, c.req.param('id'))
  if (!site) return bad(c, 'Web neexistuje', 404)
  const db = c.env.DB
  const [pages, menu, theme] = await Promise.all([
    db.prepare('SELECT id, slug, title, is_home, sort FROM pages WHERE site_id = ? ORDER BY sort, id').bind(site.id).all(),
    db.prepare('SELECT id, label, link_type, target, sort FROM menu_items WHERE site_id = ? ORDER BY sort, id').bind(site.id).all(),
    db.prepare('SELECT theme_vars, custom_css FROM site_theme WHERE site_id = ?').bind(site.id).first(),
  ])
  return c.json({
    site,
    pages: pages.results || [],
    menu: menu.results || [],
    theme_vars: safeJson(theme && theme.theme_vars, {}),
    custom_css: (theme && theme.custom_css) || '',
  })
})

app.put('/admin/sites/:id', async (c) => {
  const site = await loadSiteOr404(c, c.req.param('id'))
  if (!site) return bad(c, 'Web neexistuje', 404)
  const b = await c.req.json().catch(() => ({}))
  const name = b.name ?? site.name
  let slug = site.slug
  if (b.slug && slugify(b.slug) !== site.slug) {
    slug = slugify(b.slug)
    const hit = await c.env.DB.prepare('SELECT id FROM sites WHERE slug = ? AND id != ?').bind(slug, site.id).first()
    if (hit) return bad(c, 'Táto adresa webu už existuje')
  }
  await c.env.DB.prepare("UPDATE sites SET name = ?, slug = ?, updated_at = datetime('now') WHERE id = ?").bind(name, slug, site.id).run()
  return c.json({ ok: true, slug })
})

app.delete('/admin/sites/:id', async (c) => {
  const site = await loadSiteOr404(c, c.req.param('id'))
  if (!site) return bad(c, 'Web neexistuje', 404)
  const db = c.env.DB
  const media = await db.prepare('SELECT r2_key FROM media WHERE site_id = ?').bind(site.id).all()
  for (const m of media.results || []) await c.env.R2.delete(m.r2_key).catch(() => {})
  await db.batch([
    db.prepare('DELETE FROM media WHERE site_id = ?').bind(site.id),
    db.prepare('DELETE FROM menu_items WHERE site_id = ?').bind(site.id),
    db.prepare('DELETE FROM pages WHERE site_id = ?').bind(site.id),
    db.prepare('DELETE FROM site_theme WHERE site_id = ?').bind(site.id),
    db.prepare('DELETE FROM sites WHERE id = ?').bind(site.id),
  ])
  return c.json({ ok: true })
})

/* ---- stránky ---- */

app.post('/admin/sites/:id/pages', async (c) => {
  const site = await loadSiteOr404(c, c.req.param('id'))
  if (!site) return bad(c, 'Web neexistuje', 404)
  const b = await c.req.json().catch(() => ({}))
  if (!b.title) return bad(c, 'Názov stránky je povinný')
  const db = c.env.DB
  let slug = slugify(b.slug || b.title) || 'stranka'
  for (let i = 0; i < 50; i++) {
    const hit = await db.prepare('SELECT id FROM pages WHERE site_id = ? AND slug = ?').bind(site.id, slug).first()
    if (!hit) break
    slug = `${slugify(b.slug || b.title)}-${i + 2}`
  }
  const max = await db.prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM pages WHERE site_id = ?').bind(site.id).first()
  const res = await db
    .prepare('INSERT INTO pages (site_id, slug, title, sort, content_json) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(site.id, slug, b.title, (max.m ?? -1) + 1, '[]')
    .first()
  return c.json({ ok: true, id: res.id, slug })
})

app.get('/admin/pages/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM pages WHERE id = ?').bind(c.req.param('id')).first()
  if (!row) return bad(c, 'Stránka neexistuje', 404)
  return c.json({ ...row, blocks: safeJson(row.content_json, []) })
})

app.put('/admin/pages/:id', async (c) => {
  const id = c.req.param('id')
  const cur = await c.env.DB.prepare('SELECT * FROM pages WHERE id = ?').bind(id).first()
  if (!cur) return bad(c, 'Stránka neexistuje', 404)
  const b = await c.req.json().catch(() => ({}))
  const title = b.title ?? cur.title
  let slug = cur.slug
  if (cur.is_home) {
    slug = 'home' // úvodná stránka si musí zachovať adresu 'home'
  } else if (b.slug && slugify(b.slug) !== cur.slug) {
    slug = slugify(b.slug)
    const hit = await c.env.DB.prepare('SELECT id FROM pages WHERE site_id = ? AND slug = ? AND id != ?').bind(cur.site_id, slug, id).first()
    if (hit) return bad(c, 'Táto adresa stránky už existuje')
  }
  const blocks = b.blocks != null ? JSON.stringify(sanitizeBlocks(b.blocks)) : cur.content_json
  await c.env.DB.prepare("UPDATE pages SET title=?, slug=?, content_json=?, updated_at=datetime('now') WHERE id=?")
    .bind(title, slug, blocks, id)
    .run()
  return c.json({ ok: true, slug })
})

app.delete('/admin/pages/:id', async (c) => {
  const cur = await c.env.DB.prepare('SELECT * FROM pages WHERE id = ?').bind(c.req.param('id')).first()
  if (!cur) return bad(c, 'Stránka neexistuje', 404)
  if (cur.is_home) return bad(c, 'Úvodnú stránku nie je možné zmazať')
  await c.env.DB.prepare('DELETE FROM pages WHERE id = ?').bind(cur.id).run()
  return c.json({ ok: true })
})

/* ---- menu ---- */

app.put('/admin/sites/:id/menu', async (c) => {
  const site = await loadSiteOr404(c, c.req.param('id'))
  if (!site) return bad(c, 'Web neexistuje', 404)
  const { items } = await c.req.json().catch(() => ({}))
  if (!Array.isArray(items)) return bad(c, 'Zoznam položiek chýba')
  const db = c.env.DB
  const ops = [db.prepare('DELETE FROM menu_items WHERE site_id = ?').bind(site.id)]
  const ins = db.prepare('INSERT INTO menu_items (site_id, label, link_type, target, sort) VALUES (?, ?, ?, ?, ?)')
  items.slice(0, 30).forEach((it, i) => {
    const type = ['page', 'url', 'anchor'].includes(it.link_type) ? it.link_type : 'page'
    ops.push(ins.bind(site.id, String(it.label || '').slice(0, 60), type, String(it.target || '').slice(0, 300), i))
  })
  await db.batch(ops)
  return c.json({ ok: true })
})

/* ---- vzhľad / CSS ---- */

app.put('/admin/sites/:id/theme', async (c) => {
  const site = await loadSiteOr404(c, c.req.param('id'))
  if (!site) return bad(c, 'Web neexistuje', 404)
  const b = await c.req.json().catch(() => ({}))
  await c.env.DB.prepare(
    'INSERT INTO site_theme (site_id, theme_vars, custom_css) VALUES (?, ?, ?) ON CONFLICT(site_id) DO UPDATE SET theme_vars = excluded.theme_vars, custom_css = excluded.custom_css',
  )
    .bind(site.id, JSON.stringify(b.theme_vars ?? {}), String(b.custom_css ?? ''))
    .run()
  return c.json({ ok: true })
})

/* ---- médiá ---- */

app.get('/admin/sites/:id/media', async (c) => {
  const site = await loadSiteOr404(c, c.req.param('id'))
  if (!site) return bad(c, 'Web neexistuje', 404)
  const r = await c.env.DB.prepare('SELECT id, url, alt, created_at FROM media WHERE site_id = ? ORDER BY id DESC').bind(site.id).all()
  return c.json(r.results || [])
})

app.post('/admin/sites/:id/media', async (c) => {
  const site = await loadSiteOr404(c, c.req.param('id'))
  if (!site) return bad(c, 'Web neexistuje', 404)
  const form = await c.req.formData().catch(() => null)
  const file = form && form.get('file')
  if (!file || typeof file === 'string') return bad(c, 'Chýba súbor')
  if (!/^image\//.test(file.type || '')) return bad(c, 'Povolené sú len obrázky')
  if (file.size > 15 * 1024 * 1024) return bad(c, 'Maximálna veľkosť je 15 MB')
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const key = `media/${site.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`
  await c.env.R2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } })
  const url = `/img/${key}`
  const res = await c.env.DB.prepare('INSERT INTO media (site_id, r2_key, url, alt) VALUES (?, ?, ?, ?) RETURNING id')
    .bind(site.id, key, url, String(form.get('alt') || ''))
    .first()
  return c.json({ ok: true, id: res.id, url })
})

app.put('/admin/media/:id', async (c) => {
  const b = await c.req.json().catch(() => ({}))
  await c.env.DB.prepare('UPDATE media SET alt = ? WHERE id = ?').bind(String(b.alt || ''), c.req.param('id')).run()
  return c.json({ ok: true })
})

app.delete('/admin/media/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT r2_key FROM media WHERE id = ?').bind(c.req.param('id')).first()
  if (row) await c.env.R2.delete(row.r2_key).catch(() => {})
  await c.env.DB.prepare('DELETE FROM media WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

app.notFound((c) => c.json({ error: 'Neznáma cesta' }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Serverová chyba' }, 500)
})

export const onRequest = (context) => app.fetch(context.request, context.env, context)

// Pre lokálny Node harness (scripts/dev-node.mjs). Na Cloudflare sa nepoužíva.
export { app }
