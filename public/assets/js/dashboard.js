// Dashboard: prihlásenie + zoznam webov (/) — vytváranie, otváranie v editore, mazanie.
const app = document.getElementById('app')
const api = (path, opts) => fetch('/api' + path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts }).then(async (r) => {
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Chyba')
  return data
})

let authed = false
let hasAdmin = null // null = neznáme, zistíme pri prvom pokuse o login/setup

async function boot() {
  const me = await api('/auth/me').catch(() => ({ authed: false }))
  authed = me.authed
  render()
}

function render() {
  app.innerHTML = ''
  app.appendChild(authed ? renderDashboard() : renderLogin())
}

function renderLogin() {
  const wrap = document.createElement('div')
  wrap.className = 'dash-login'
  let mode = 'login' // alebo 'setup'
  wrap.innerHTML = `
    <h1>Site Builder</h1>
    <p class="sub">Editor landing pages – prihlás sa do administrácie.</p>
    <div id="loginForm"></div>
  `
  const formHost = wrap.querySelector('#loginForm')

  function paint() {
    formHost.innerHTML = mode === 'login' ? `
      <label>Meno</label><input id="fUser" type="text" autocomplete="username">
      <label>Heslo</label><input id="fPass" type="password" autocomplete="current-password">
      <button class="submit" id="fSubmit">Prihlásiť sa</button>
      <div class="toggle">Prvé spustenie? <a id="fToggle">Vytvoriť administrátora</a></div>
      <div id="fErr"></div>
    ` : `
      <label>Setup token</label><input id="fToken" type="text" placeholder="zo SETUP_TOKEN premennej">
      <label>Meno</label><input id="fUser" type="text">
      <label>Heslo (min. 8 znakov)</label><input id="fPass" type="password">
      <button class="submit" id="fSubmit">Vytvoriť účet</button>
      <div class="toggle"><a id="fToggle">Späť na prihlásenie</a></div>
      <div id="fErr"></div>
    `
    formHost.querySelector('#fToggle').onclick = () => { mode = mode === 'login' ? 'setup' : 'login'; paint() }
    formHost.querySelector('#fSubmit').onclick = async () => {
      const errEl = formHost.querySelector('#fErr')
      errEl.innerHTML = ''
      try {
        if (mode === 'login') {
          await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: formHost.querySelector('#fUser').value, password: formHost.querySelector('#fPass').value }) })
        } else {
          await api('/setup', { method: 'POST', body: JSON.stringify({ token: formHost.querySelector('#fToken').value, username: formHost.querySelector('#fUser').value, password: formHost.querySelector('#fPass').value }) })
          mode = 'login'; paint()
          return
        }
        authed = true
        render()
      } catch (e) {
        errEl.innerHTML = `<div class="dash-error">${e.message}</div>`
      }
    }
  }
  paint()
  return wrap
}

function renderDashboard() {
  const wrap = document.createElement('div')
  wrap.innerHTML = `
    <div class="dash-header">
      <h1>🧩 Site Builder</h1>
      <button id="logoutBtn">Odhlásiť sa</button>
    </div>
    <div class="dash-wrap">
      <div class="dash-toolbar">
        <h2>Moje weby</h2>
        <button class="dash-btn" id="newSiteBtn">+ Nový web</button>
      </div>
      <div class="dash-grid" id="grid"></div>
    </div>
  `
  wrap.querySelector('#logoutBtn').onclick = async () => { await api('/auth/logout', { method: 'POST' }); authed = false; render() }
  wrap.querySelector('#newSiteBtn').onclick = () => openNewSiteModal(wrap)
  loadSites(wrap)
  return wrap
}

async function loadSites(wrap) {
  const grid = wrap.querySelector('#grid')
  grid.innerHTML = 'Načítavam…'
  const sites = await api('/admin/sites').catch(() => [])
  if (!sites.length) { grid.outerHTML = '<div class="dash-empty" id="grid">Zatiaľ žiadny web. Vytvor si prvý tlačidlom vyššie.</div>'; return }
  grid.innerHTML = ''
  for (const s of sites) {
    const card = document.createElement('div')
    card.className = 'dash-card'
    card.innerHTML = `
      <h3>${escapeHtml(s.name)}</h3>
      <div class="slug">/${escapeHtml(s.slug)}</div>
      <div class="row">
        <a class="open" href="/s.html?site=${encodeURIComponent(s.slug)}" target="_blank">Otvoriť a upraviť</a>
        <button class="del">Zmazať</button>
      </div>
    `
    card.querySelector('.del').onclick = async () => {
      if (!confirm(`Naozaj zmazať web „${s.name}“ vrátane všetkých stránok a médií?`)) return
      await api(`/admin/sites/${s.id}`, { method: 'DELETE' })
      loadSites(wrap)
    }
    grid.appendChild(card)
  }
}

function openNewSiteModal(wrap) {
  const bd = document.createElement('div')
  bd.className = 'dash-modal-backdrop'
  bd.innerHTML = `
    <div class="dash-modal">
      <h3>Nový web</h3>
      <label>Názov</label><input id="nName" type="text" placeholder="napr. Kaviareň Lipa">
      <label>Adresa (voliteľné)</label><input id="nSlug" type="text" placeholder="kaviaren-lipa">
      <div class="actions">
        <button class="ed-btn" id="nCancel">Zrušiť</button>
        <button class="ed-btn primary" id="nCreate">Vytvoriť</button>
      </div>
    </div>
  `
  document.body.appendChild(bd)
  bd.querySelector('#nCancel').onclick = () => bd.remove()
  bd.querySelector('#nCreate').onclick = async () => {
    const name = bd.querySelector('#nName').value.trim()
    if (!name) return
    await api('/admin/sites', { method: 'POST', body: JSON.stringify({ name, slug: bd.querySelector('#nSlug').value.trim() }) })
    bd.remove()
    loadSites(wrap)
  }
}

function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }

boot()
