// Vykresľovanie verejnej stránky z JSON blokov + živé CSS premenné.
// Ak je návštevník prihlásený admin, dotiahne sa editor.js a stránka sa dá upravovať naživo.

const qs = new URLSearchParams(location.search)
export const siteSlug = qs.get('site') || 'demo'
export const pageSlug = qs.get('page') || 'home'

export const api = (path, opts) =>
  fetch('/api' + path, { credentials: 'include', headers: opts && opts.isForm ? {} : { 'Content-Type': 'application/json' }, ...opts }).then(async (r) => {
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || 'Chyba')
    return data
  })

export const state = { site: null, page: null, pages: [], menu: [], themeVars: {}, customCss: '' }

export const FONTS = ['Inter', 'Poppins', 'Playfair Display', 'Merriweather', 'Roboto', 'Montserrat', 'Lora', 'Nunito']
let fontsLoaded = new Set()
function ensureFont(name) {
  if (!name || fontsLoaded.has(name)) return
  fontsLoaded.add(name)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:wght@400;600;700&display=swap`
  document.head.appendChild(link)
}

export function applyTheme(vars, css) {
  const v = vars || {}
  const root = document.documentElement.style
  if (v.primary) root.setProperty('--b-primary', v.primary)
  if (v.secondary) root.setProperty('--b-secondary', v.secondary)
  if (v.bg) root.setProperty('--b-bg', v.bg)
  if (v.text) root.setProperty('--b-text', v.text)
  if (v.headerBg) root.setProperty('--b-header-bg', v.headerBg)
  if (v.headerText) root.setProperty('--b-header-text', v.headerText)
  if (v.radius) root.setProperty('--b-radius', v.radius + 'px')
  if (v.containerWidth) root.setProperty('--b-container', v.containerWidth + 'px')
  if (v.font) { ensureFont(v.font); root.setProperty('--b-font', `'${v.font}', system-ui, sans-serif`) }
  if (v.headingFont) { ensureFont(v.headingFont); root.setProperty('--b-heading-font', `'${v.headingFont}', system-ui, sans-serif`) }
  document.getElementById('sb-custom-css').textContent = css || ''
}

/* ---------- render menu ---------- */

function menuHref(item) {
  if (item.link_type === 'url') return item.target
  if (item.link_type === 'anchor') return '#' + item.target
  return `/s.html?site=${encodeURIComponent(siteSlug)}&page=${encodeURIComponent(item.target || 'home')}`
}

export function renderMenu() {
  document.title = `${state.site.name} — ${state.page.title || ''}`
  document.getElementById('siteHeader').hidden = false
  document.getElementById('siteFooter').hidden = false
  document.getElementById('brandLink').textContent = state.site.name
  document.getElementById('brandLink').href = `/s.html?site=${encodeURIComponent(siteSlug)}&page=home`
  const nav = document.getElementById('navList')
  nav.innerHTML = ''
  for (const item of state.menu) {
    const li = document.createElement('li')
    const a = document.createElement('a')
    a.href = menuHref(item)
    a.textContent = item.label
    if (item.link_type === 'page' && (item.target || 'home') === pageSlug) a.classList.add('active')
    li.appendChild(a)
    nav.appendChild(li)
  }
  document.getElementById('siteFooter').textContent = `© ${new Date().getFullYear()} ${state.site.name}`
  const toggle = document.getElementById('menuToggle')
  toggle.onclick = () => nav.classList.toggle('open')
}

/* ---------- block renderers ---------- */

function el(tag, cls, html) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  return e
}

function renderHero(block) {
  const wrap = el('div', 'b-block b-hero')
  const slidesEl = el('div', 'b-hero-slides')
  if (!block.slides.length) {
    slidesEl.appendChild(el('div', 'b-hero-empty', 'Slider je zatiaľ prázdny.'))
  }
  let active = 0
  const slideEls = block.slides.map((s, i) => {
    const sl = el('div', 'b-hero-slide' + (i === 0 ? ' active' : '') + (s.imageUrl ? ' has-image' : ''))
    if (s.imageUrl) sl.style.setProperty('--slide-img', `url("${s.imageUrl}")`)
    const content = el('div', 'b-hero-content')
    if (s.heading) content.appendChild(el('h2', null, escapeHtml(s.heading)))
    if (s.subheading) content.appendChild(el('p', null, escapeHtml(s.subheading)))
    if (s.buttonText) {
      const a = el('a', 'b-hero-btn', escapeHtml(s.buttonText))
      a.href = s.buttonLink || '#'
      content.appendChild(a)
    }
    sl.appendChild(content)
    slidesEl.appendChild(sl)
    return sl
  })
  wrap.appendChild(slidesEl)
  let dotsEl, timer
  function show(i) {
    active = (i + block.slides.length) % block.slides.length
    slideEls.forEach((s, j) => s.classList.toggle('active', j === active))
    if (dotsEl) [...dotsEl.children].forEach((d, j) => d.classList.toggle('active', j === active))
  }
  if (block.slides.length > 1) {
    const prev = el('button', 'b-hero-arrow prev', '‹'); prev.onclick = () => { show(active - 1); resetTimer() }
    const next = el('button', 'b-hero-arrow next', '›'); next.onclick = () => { show(active + 1); resetTimer() }
    wrap.appendChild(prev); wrap.appendChild(next)
    dotsEl = el('div', 'b-hero-dots')
    block.slides.forEach((_, i) => {
      const d = el('button', 'b-hero-dot' + (i === 0 ? ' active' : ''))
      d.onclick = () => { show(i); resetTimer() }
      dotsEl.appendChild(d)
    })
    wrap.appendChild(dotsEl)
    function resetTimer() { clearInterval(timer); timer = setInterval(() => show(active + 1), block.intervalMs || 6000) }
    resetTimer()
  }
  return wrap
}

function renderText(block) {
  const wrap = el('div', 'b-block b-text')
  const cols = el('div', 'b-text-cols')
  cols.style.gridTemplateColumns = `repeat(${block.columns.length || 1}, 1fr)`
  for (const c of block.columns) cols.appendChild(el('div', 'b-text-col', c.html || ''))
  wrap.appendChild(el('div', 'b-container')).appendChild(cols)
  return wrap
}

function renderImage(block) {
  const wrap = el('div', `b-block b-image-wrap ${block.width}`)
  const container = el('div', 'b-container')
  if (block.imageUrl) {
    const img = el('img'); img.src = block.imageUrl; img.alt = block.caption || ''
    container.appendChild(img)
  } else {
    container.appendChild(el('div', 'b-hero-empty', 'Obrázok zatiaľ nevybraný.'))
  }
  if (block.caption) container.appendChild(el('div', 'b-image-caption', escapeHtml(block.caption)))
  wrap.appendChild(container)
  return wrap
}

function openLightbox(url) {
  const bd = el('div', 'b-lightbox')
  const img = el('img'); img.src = url
  const close = el('button', 'b-lightbox-close', '×')
  close.onclick = () => bd.remove()
  bd.onclick = (e) => { if (e.target === bd) bd.remove() }
  bd.appendChild(img); bd.appendChild(close)
  document.body.appendChild(bd)
}

function renderGallery(block) {
  const wrap = el('div', 'b-block b-gallery')
  const container = el('div', 'b-container')
  if (!block.images.length) {
    container.appendChild(el('div', 'b-gallery-empty', 'Fotogaléria je zatiaľ prázdna.'))
  } else {
    const grid = el('div', 'b-gallery-grid')
    grid.style.gridTemplateColumns = `repeat(${block.columns}, 1fr)`
    for (const im of block.images) {
      const img = el('img'); img.src = im.imageUrl; img.alt = im.alt || ''
      img.onclick = () => openLightbox(im.imageUrl)
      grid.appendChild(img)
    }
    container.appendChild(grid)
  }
  wrap.appendChild(container)
  return wrap
}

const RENDERERS = { hero_slider: renderHero, text: renderText, image: renderImage, gallery: renderGallery }

export function renderBlock(block) {
  const fn = RENDERERS[block.type]
  const node = fn ? fn(block) : el('div', 'b-block', '')
  node.dataset.blockId = block.id
  node.dataset.blockType = block.type
  return node
}

export function renderBlocks() {
  const host = document.getElementById('blocks')
  host.innerHTML = ''
  for (const b of state.page.blocks) host.appendChild(renderBlock(b))
}

function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }

/* ---------- boot ---------- */

async function boot() {
  let bundle
  try {
    bundle = await api(`/site/${encodeURIComponent(siteSlug)}/page/${encodeURIComponent(pageSlug)}`)
  } catch (e) {
    document.getElementById('blocks').innerHTML = `<div class="b-container" style="padding:60px 0;text-align:center">Stránka sa nenašla. <a href="/">Späť na dashboard</a></div>`
    return
  }
  state.site = bundle.site
  state.page = bundle.page
  state.pages = bundle.pages
  state.menu = bundle.menu
  state.themeVars = bundle.theme_vars
  state.customCss = bundle.custom_css

  applyTheme(state.themeVars, state.customCss)
  renderMenu()
  renderBlocks()

  const me = await api('/auth/me').catch(() => ({ authed: false }))
  if (me.authed) {
    const mod = await import('/assets/js/editor.js')
    mod.initEditor()
  }
}

boot()
