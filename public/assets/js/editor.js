// Editor priamo na stránke – dynamicky sa dotiahne pre prihláseného admina (viď site.js).
// Bloky: pridávanie / mazanie / presúvanie priamo na stránke, úprava obsahu cez modály,
// menu, stránky webu a živý CSS panel (rovnaký princíp ako v podhajska).

import { state, api, siteSlug, pageSlug, applyTheme, renderMenu, renderBlocks, FONTS } from './site.js'

const ctx = { siteId: null, pageId: null, pagesMeta: [], menuItems: [], themeVars: {}, customCss: '' }

const uid = () => crypto.randomUUID().slice(0, 8)
const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export async function initEditor() {
  document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/assets/css/editor.css' }))
  await import('/assets/js/wysiwyg.js')

  document.body.classList.add('ed-editing')
  injectBadge()

  const sites = await api('/admin/sites').catch(() => [])
  const siteRow = sites.find((s) => s.slug === siteSlug)
  if (!siteRow) return
  const detail = await api(`/admin/sites/${siteRow.id}`).catch(() => null)
  if (!detail) return
  ctx.siteId = siteRow.id
  ctx.pagesMeta = detail.pages
  ctx.menuItems = detail.menu.map((m) => ({ label: m.label, link_type: m.link_type, target: m.target }))
  ctx.themeVars = detail.theme_vars
  ctx.customCss = detail.custom_css
  const pm = detail.pages.find((p) => p.slug === pageSlug)
  if (!pm) return
  ctx.pageId = pm.id

  refreshUI()
  injectFab()
}

/* ---------- základné UI (badge, FAB, toast) ---------- */

function injectBadge() {
  const bar = document.createElement('div')
  bar.className = 'ed-badge'
  bar.innerHTML = '<span>🛠 Režim úprav — meníš web priamo naživo</span>'
  const btn = document.createElement('button')
  btn.textContent = 'Odhlásiť sa'
  btn.onclick = async () => { await api('/auth/logout', { method: 'POST' }); location.reload() }
  bar.appendChild(btn)
  document.body.prepend(bar)
}

function injectFab() {
  const fab = document.createElement('div')
  fab.className = 'ed-fab'
  const menu = document.createElement('div')
  menu.className = 'ed-fab-menu'
  const items = [
    ['📄 Stránky', openPagesModal],
    ['☰ Menu', openMenuModal],
    ['⚙ Vzhľad a CSS', openThemeModal],
    ['↩ Dashboard', () => (location.href = '/')],
  ]
  for (const [label, fn] of items) {
    const b = document.createElement('button')
    b.className = 'ed-fab-item'
    b.textContent = label
    b.onclick = () => { fn(); menu.classList.remove('open') }
    menu.appendChild(b)
  }
  const main = document.createElement('button')
  main.className = 'ed-fab-main'
  main.textContent = '✎'
  main.onclick = () => menu.classList.toggle('open')
  fab.appendChild(menu)
  fab.appendChild(main)
  document.body.appendChild(fab)
}

function toast(msg) {
  const t = document.createElement('div')
  t.className = 'ed-toast'
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 1800)
}

function mkBtn(label, onClick) {
  const b = document.createElement('button')
  b.textContent = label
  b.onclick = onClick
  return b
}

function labeledInput(label, value, onInput, type = 'text') {
  const wrap = document.createElement('div')
  wrap.className = 'ed-field'
  const l = document.createElement('label')
  l.textContent = label
  const i = document.createElement('input')
  i.type = type
  i.value = value || ''
  i.oninput = () => onInput(i.value)
  wrap.append(l, i)
  return wrap
}

/* ---------- generický modál ---------- */

function openModal({ title, wide, render, onClose }) {
  const bd = document.createElement('div')
  bd.className = 'ed-modal-backdrop'
  const modal = document.createElement('div')
  modal.className = 'ed-modal' + (wide ? ' wide' : '')
  const head = document.createElement('div')
  head.className = 'ed-modal-head'
  head.innerHTML = `<h3>${title}</h3>`
  const closeBtn = document.createElement('button')
  closeBtn.innerHTML = '×'
  head.appendChild(closeBtn)
  const body = document.createElement('div')
  body.className = 'ed-modal-body'
  const foot = document.createElement('div')
  foot.className = 'ed-modal-foot'
  modal.append(head, body, foot)
  bd.appendChild(modal)
  document.body.appendChild(bd)
  let closed = false
  function close() { if (closed) return; closed = true; bd.remove(); onClose && onClose() }
  closeBtn.onclick = close
  bd.addEventListener('mousedown', (e) => { if (e.target === bd) close() })
  render(body, foot, close)
  return { close }
}

/* ---------- knižnica médií (výber / nahrávanie) ---------- */

function selectMedia({ multi = false } = {}) {
  return new Promise((resolve) => {
    let resolved = false
    const selected = []
    openModal({
      title: multi ? 'Vybrať fotky' : 'Vybrať obrázok',
      wide: true,
      onClose: () => { if (!resolved) resolve(null) },
      render(body) {
        const tabs = document.createElement('div')
        tabs.className = 'ed-media-tabs'
        const tUpload = mkBtn('Nahrať', () => show('upload'))
        const tLibrary = mkBtn('Knižnica', () => show('library'))
        tabs.append(tUpload, tLibrary)
        body.appendChild(tabs)
        const content = document.createElement('div')
        body.appendChild(content)
        if (multi) {
          const useBtn = document.createElement('button')
          useBtn.className = 'ed-btn primary'
          useBtn.textContent = 'Použiť vybrané'
          useBtn.style.marginTop = '14px'
          useBtn.onclick = () => { resolved = true; resolve(selected); close() }
          body.appendChild(useBtn)
        }
        let mode = 'library'
        function show(m) { mode = m; tUpload.classList.toggle('active', m === 'upload'); tLibrary.classList.toggle('active', m === 'library'); paint() }
        async function paint() {
          content.innerHTML = ''
          if (mode === 'upload') {
            const drop = document.createElement('div')
            drop.className = 'ed-media-drop'
            drop.textContent = 'Klikni alebo presuň sem obrázky'
            const fileInput = document.createElement('input')
            fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.multiple = multi; fileInput.hidden = true
            const status = document.createElement('div')
            status.className = 'ed-hint'
            drop.onclick = () => fileInput.click()
            drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('drag') }
            drop.ondragleave = () => drop.classList.remove('drag')
            drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('drag'); handleFiles(e.dataTransfer.files) }
            fileInput.onchange = () => handleFiles(fileInput.files)
            content.append(drop, fileInput, status)
            async function handleFiles(files) {
              for (const f of files) {
                status.textContent = `Nahrávam ${f.name}…`
                const fd = new FormData(); fd.append('file', f)
                try {
                  const res = await api(`/admin/sites/${ctx.siteId}/media`, { method: 'POST', body: fd, isForm: true })
                  if (!multi) { resolved = true; resolve({ id: res.id, url: res.url, alt: '' }); close(); return }
                  selected.push({ id: res.id, url: res.url, alt: '' })
                } catch (e) { status.textContent = 'Chyba: ' + e.message }
              }
              status.textContent = multi ? `Nahraných ${selected.length} nových fotiek (prepni na Knižnicu a vyber ich).` : ''
            }
          } else {
            content.textContent = 'Načítavam…'
            const items = await api(`/admin/sites/${ctx.siteId}/media`).catch(() => [])
            content.innerHTML = ''
            if (!items.length) { content.innerHTML = '<div class="ed-hint">Zatiaľ žiadne nahraté súbory.</div>'; return }
            const grid = document.createElement('div')
            grid.className = 'ed-media-grid'
            for (const m of items) {
              const it = document.createElement('div')
              it.className = 'ed-media-item'
              if (selected.some((s) => s.id === m.id)) it.classList.add('selected')
              const img = document.createElement('img'); img.src = m.url
              it.appendChild(img)
              const del = document.createElement('button')
              del.className = 'ed-media-del'; del.textContent = '×'
              del.onclick = async (e) => { e.stopPropagation(); if (!confirm('Zmazať tento súbor?')) return; await api(`/admin/media/${m.id}`, { method: 'DELETE' }); paint() }
              it.appendChild(del)
              it.onclick = () => {
                if (!multi) { resolved = true; resolve({ id: m.id, url: m.url, alt: m.alt }); close(); return }
                it.classList.toggle('selected')
                const idx = selected.findIndex((s) => s.id === m.id)
                if (idx >= 0) selected.splice(idx, 1)
                else selected.push({ id: m.id, url: m.url, alt: m.alt })
              }
              grid.appendChild(it)
            }
            content.appendChild(grid)
          }
        }
        show('library')
      },
    })
  })
}

/* ---------- bloky na stránke: nástrojová lišta, presun, mazanie, ukladanie ---------- */

function refreshUI() { renderBlocks(); decorateBlocks() }

async function saveBlocks() {
  await api(`/admin/pages/${ctx.pageId}`, { method: 'PUT', body: JSON.stringify({ blocks: state.page.blocks }) }).catch((e) => toast('Chyba pri ukladaní: ' + e.message))
}

function decorateBlocks() {
  const host = document.getElementById('blocks')
  const blockEls = [...host.querySelectorAll('.b-block')]
  blockEls.forEach((elm, i) => {
    const id = elm.dataset.blockId
    const toolbar = document.createElement('div')
    toolbar.className = 'ed-toolbar'
    const up = mkBtn('↑', () => moveBlock(id, -1)); up.disabled = i === 0
    const down = mkBtn('↓', () => moveBlock(id, 1)); down.disabled = i === blockEls.length - 1
    toolbar.append(up, down, mkBtn('✏', () => editBlock(id)), mkBtn('🗑', () => deleteBlock(id)))
    elm.appendChild(toolbar)
  })
  const addBtn = document.createElement('button')
  addBtn.className = 'ed-add-block'
  addBtn.textContent = '+ Pridať blok'
  addBtn.onclick = addBlockFlow
  host.appendChild(addBtn)
}

function moveBlock(id, dir) {
  const blocks = state.page.blocks
  const i = blocks.findIndex((b) => b.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= blocks.length) return
  ;[blocks[i], blocks[j]] = [blocks[j], blocks[i]]
  refreshUI(); saveBlocks()
}

function deleteBlock(id) {
  if (!confirm('Zmazať tento blok?')) return
  state.page.blocks = state.page.blocks.filter((b) => b.id !== id)
  refreshUI(); saveBlocks()
}

function defaultBlock(type) {
  const id = uid()
  if (type === 'hero_slider') return { type, id, intervalMs: 6000, slides: [{ id: uid(), imageUrl: '', heading: 'Nový nadpis', subheading: '', buttonText: '', buttonLink: '' }] }
  if (type === 'text') return { type, id, columns: [{ html: '<p>Nový text…</p>' }] }
  if (type === 'image') return { type, id, imageUrl: '', caption: '', width: 'contained' }
  return { type: 'gallery', id, columns: 3, images: [] }
}

function addBlockFlow() {
  const handle = openModal({
    title: 'Pridať blok',
    render(body) {
      const grid = document.createElement('div')
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:10px'
      const opts = [['hero_slider', '🖼 Hero slider'], ['text', '📝 Text'], ['image', '🖼 Obrázok'], ['gallery', '🗂 Fotogaléria']]
      for (const [type, label] of opts) {
        const b = document.createElement('button')
        b.className = 'ed-btn'
        b.style.padding = '22px 10px'
        b.textContent = label
        b.onclick = () => {
          const block = defaultBlock(type)
          state.page.blocks.push(block)
          refreshUI(); saveBlocks()
          handle.close()
          editBlock(block.id)
        }
        grid.appendChild(b)
      }
      body.appendChild(grid)
    },
  })
}

function editBlock(id) {
  const idx = state.page.blocks.findIndex((b) => b.id === id)
  if (idx < 0) return
  const block = state.page.blocks[idx]
  const commit = (newBlock) => { state.page.blocks[idx] = newBlock; refreshUI(); saveBlocks() }
  if (block.type === 'hero_slider') editHero(block, commit)
  else if (block.type === 'text') editText(block, commit)
  else if (block.type === 'image') editImage(block, commit)
  else if (block.type === 'gallery') editGallery(block, commit)
}

/* ---------- editory jednotlivých typov blokov ---------- */

function editHero(block, commit) {
  const local = structuredClone(block)
  openModal({
    title: 'Hero slider', wide: true,
    render(body, foot, close) {
      body.appendChild(labeledInput('Interval striedania (sekundy)', Math.round((local.intervalMs || 6000) / 1000), (v) => (local.intervalMs = (Number(v) || 6) * 1000), 'number'))

      const listHost = document.createElement('div')
      body.appendChild(listHost)
      function paintList() {
        listHost.innerHTML = ''
        local.slides.forEach((s, i) => {
          const item = document.createElement('div')
          item.className = 'ed-list-item'
          const head = document.createElement('div')
          head.className = 'ed-list-item-head'
          head.innerHTML = `<span class="ed-list-title">Slide ${i + 1}</span>`
          const actions = document.createElement('div')
          actions.className = 'ed-mini-actions'
          const up = mkBtn('↑', () => { if (i > 0) { [local.slides[i - 1], local.slides[i]] = [local.slides[i], local.slides[i - 1]]; paintList() } }); up.disabled = i === 0
          const down = mkBtn('↓', () => { if (i < local.slides.length - 1) { [local.slides[i + 1], local.slides[i]] = [local.slides[i], local.slides[i + 1]]; paintList() } }); down.disabled = i === local.slides.length - 1
          const del = mkBtn('🗑', () => { if (local.slides.length <= 1) return alert('Aspoň jeden slide musí zostať.'); local.slides.splice(i, 1); paintList() })
          actions.append(up, down, del)
          head.appendChild(actions)
          item.appendChild(head)

          if (s.imageUrl) { const prev = document.createElement('img'); prev.src = s.imageUrl; prev.style.cssText = 'max-width:100%;max-height:140px;object-fit:cover;border-radius:8px;margin-bottom:8px;display:block'; item.appendChild(prev) }
          const imgBtn = document.createElement('button')
          imgBtn.className = 'ed-btn small'
          imgBtn.textContent = s.imageUrl ? 'Zmeniť obrázok' : 'Vybrať obrázok'
          imgBtn.onclick = async () => { const m = await selectMedia({ multi: false }); if (m) { s.imageUrl = m.url; paintList() } }
          item.appendChild(imgBtn)

          item.appendChild(labeledInput('Nadpis', s.heading, (v) => (s.heading = v)))
          item.appendChild(labeledInput('Podnadpis', s.subheading, (v) => (s.subheading = v)))
          const row = document.createElement('div')
          row.className = 'ed-row'
          row.appendChild(labeledInput('Text tlačidla', s.buttonText, (v) => (s.buttonText = v)))
          row.appendChild(labeledInput('Odkaz tlačidla', s.buttonLink, (v) => (s.buttonLink = v)))
          item.appendChild(row)
          listHost.appendChild(item)
        })
      }
      paintList()

      const addSlide = document.createElement('button')
      addSlide.className = 'ed-btn'
      addSlide.textContent = '+ Pridať slide'
      addSlide.onclick = () => { local.slides.push({ id: uid(), imageUrl: '', heading: '', subheading: '', buttonText: '', buttonLink: '' }); paintList() }
      body.appendChild(addSlide)

      foot.append(mkBtn2('Zrušiť', close), mkBtn2('Uložiť', () => { commit(local); close() }, true))
    },
  })
}

function editText(block, commit) {
  const local = structuredClone(block)
  let wzInstances = []
  openModal({
    title: 'Textový blok', wide: true,
    render(body, foot, close) {
      const colBtns = document.createElement('div')
      colBtns.className = 'ed-col-btns'
      ;[1, 2, 3, 4].forEach((n) => {
        const b = document.createElement('button')
        b.textContent = n
        b.onclick = () => {
          if (n > local.columns.length) while (local.columns.length < n) local.columns.push({ html: '<p></p>' })
          else local.columns = local.columns.slice(0, n)
          paintCols()
        }
        colBtns.appendChild(b)
      })
      body.appendChild(colBtns)
      const hint = document.createElement('div')
      hint.className = 'ed-hint'
      hint.textContent = 'Zvoľ počet stĺpcov vedľa seba, potom uprav text v každom z nich.'
      hint.style.marginBottom = '10px'
      body.appendChild(hint)
      const colsHost = document.createElement('div')
      colsHost.style.cssText = 'display:grid;gap:14px'
      body.appendChild(colsHost)

      function paintCols() {
        ;[...colBtns.children].forEach((b, i) => b.classList.toggle('active', i + 1 === local.columns.length))
        colsHost.style.gridTemplateColumns = `repeat(${local.columns.length}, 1fr)`
        colsHost.innerHTML = ''
        wzInstances = []
        local.columns.forEach((c) => {
          const host = document.createElement('div')
          const ed = window.SBwysiwyg.create(host, { onImage: (insert) => selectMedia({ multi: false }).then((m) => { if (m) insert(m.url, m.alt) }) })
          ed.set(c.html)
          colsHost.appendChild(host)
          wzInstances.push(ed)
        })
      }
      paintCols()

      foot.append(
        mkBtn2('Zrušiť', close),
        mkBtn2('Uložiť', () => { local.columns = wzInstances.map((ed) => ({ html: ed.get() })); commit(local); close() }, true),
      )
    },
  })
}

function editImage(block, commit) {
  const local = structuredClone(block)
  openModal({
    title: 'Obrázok',
    render(body, foot, close) {
      const preview = document.createElement('div')
      function paintPreview() { preview.innerHTML = local.imageUrl ? `<img src="${local.imageUrl}" style="max-width:100%;border-radius:8px;margin-bottom:10px">` : '<div class="ed-hint">Obrázok zatiaľ nevybraný.</div>' }
      paintPreview()
      body.appendChild(preview)
      const pickBtn = document.createElement('button')
      pickBtn.className = 'ed-btn'
      pickBtn.textContent = 'Vybrať obrázok'
      pickBtn.onclick = async () => { const m = await selectMedia({ multi: false }); if (m) { local.imageUrl = m.url; paintPreview() } }
      body.appendChild(pickBtn)
      body.appendChild(labeledInput('Popis (caption)', local.caption, (v) => (local.caption = v)))

      const widthWrap = document.createElement('div')
      widthWrap.className = 'ed-row'
      widthWrap.style.marginTop = '10px'
      const cBtn = document.createElement('button'); cBtn.className = 'ed-btn'; cBtn.textContent = 'V rámci textu'
      const fBtn = document.createElement('button'); fBtn.className = 'ed-btn'; fBtn.textContent = 'Na celú šírku'
      function paintWidth() { cBtn.classList.toggle('primary', local.width !== 'full'); fBtn.classList.toggle('primary', local.width === 'full') }
      cBtn.onclick = () => { local.width = 'contained'; paintWidth() }
      fBtn.onclick = () => { local.width = 'full'; paintWidth() }
      paintWidth()
      widthWrap.append(cBtn, fBtn)
      body.appendChild(widthWrap)

      foot.append(mkBtn2('Zrušiť', close), mkBtn2('Uložiť', () => { commit(local); close() }, true))
    },
  })
}

function editGallery(block, commit) {
  const local = structuredClone(block)
  openModal({
    title: 'Fotogaléria', wide: true,
    render(body, foot, close) {
      const colsWrap = document.createElement('div')
      colsWrap.className = 'ed-field'
      colsWrap.innerHTML = '<label>Počet stĺpcov</label>'
      const sel = document.createElement('select')
      ;[2, 3, 4].forEach((n) => { const o = document.createElement('option'); o.value = n; o.textContent = n; if (local.columns === n) o.selected = true; sel.appendChild(o) })
      sel.onchange = () => (local.columns = Number(sel.value))
      colsWrap.appendChild(sel)
      body.appendChild(colsWrap)

      const listHost = document.createElement('div')
      body.appendChild(listHost)
      function paintList() {
        listHost.innerHTML = ''
        if (!local.images.length) listHost.innerHTML = '<div class="ed-hint">Zatiaľ žiadne fotky.</div>'
        local.images.forEach((im, i) => {
          const row = document.createElement('div')
          row.className = 'ed-list-item'
          const head = document.createElement('div')
          head.className = 'ed-list-item-head'
          const thumb = document.createElement('img')
          thumb.src = im.imageUrl
          thumb.style.cssText = 'width:50px;height:50px;object-fit:cover;border-radius:6px'
          head.appendChild(thumb)
          const actions = document.createElement('div')
          actions.className = 'ed-mini-actions'
          const up = mkBtn('↑', () => { if (i > 0) { [local.images[i - 1], local.images[i]] = [local.images[i], local.images[i - 1]]; paintList() } }); up.disabled = i === 0
          const down = mkBtn('↓', () => { if (i < local.images.length - 1) { [local.images[i + 1], local.images[i]] = [local.images[i], local.images[i + 1]]; paintList() } }); down.disabled = i === local.images.length - 1
          const del = mkBtn('🗑', () => { local.images.splice(i, 1); paintList() })
          actions.append(up, down, del)
          head.appendChild(actions)
          row.appendChild(head)
          listHost.appendChild(row)
        })
      }
      paintList()

      const addBtn = document.createElement('button')
      addBtn.className = 'ed-btn'
      addBtn.textContent = '+ Pridať fotky'
      addBtn.onclick = async () => {
        const items = await selectMedia({ multi: true })
        if (items && items.length) {
          for (const it of items) if (!local.images.some((x) => x.imageUrl === it.url)) local.images.push({ imageUrl: it.url, alt: it.alt || '' })
          paintList()
        }
      }
      body.appendChild(addBtn)

      foot.append(mkBtn2('Zrušiť', close), mkBtn2('Uložiť', () => { commit(local); close() }, true))
    },
  })
}

function mkBtn2(label, onClick, primary) {
  const b = document.createElement('button')
  b.className = 'ed-btn' + (primary ? ' primary' : '')
  b.textContent = label
  b.onclick = onClick
  return b
}

/* ---------- menu ---------- */

function openMenuModal() {
  const local = ctx.menuItems.map((it) => ({ ...it }))
  openModal({
    title: 'Menu', wide: true,
    render(body, foot, close) {
      const listHost = document.createElement('div')
      body.appendChild(listHost)
      function paint() {
        listHost.innerHTML = ''
        local.forEach((it, i) => {
          const row = document.createElement('div')
          row.className = 'ed-list-item'
          const head = document.createElement('div')
          head.className = 'ed-list-item-head'
          head.innerHTML = `<span class="ed-list-title">Položka ${i + 1}</span>`
          const actions = document.createElement('div')
          actions.className = 'ed-mini-actions'
          const up = mkBtn('↑', () => { if (i > 0) { [local[i - 1], local[i]] = [local[i], local[i - 1]]; paint() } }); up.disabled = i === 0
          const down = mkBtn('↓', () => { if (i < local.length - 1) { [local[i + 1], local[i]] = [local[i], local[i + 1]]; paint() } }); down.disabled = i === local.length - 1
          const del = mkBtn('🗑', () => { local.splice(i, 1); paint() })
          actions.append(up, down, del)
          head.appendChild(actions)
          row.appendChild(head)

          row.appendChild(labeledInput('Popisok', it.label, (v) => (it.label = v)))

          const typeWrap = document.createElement('div')
          typeWrap.className = 'ed-field'
          typeWrap.innerHTML = '<label>Typ odkazu</label>'
          const sel = document.createElement('select')
          ;[['page', 'Stránka'], ['url', 'Externá URL'], ['anchor', 'Kotva na stránke (#id)']].forEach(([v, l]) => {
            const o = document.createElement('option'); o.value = v; o.textContent = l; if (it.link_type === v) o.selected = true; sel.appendChild(o)
          })
          sel.onchange = () => { it.link_type = sel.value; paint() }
          typeWrap.appendChild(sel)
          row.appendChild(typeWrap)

          if (it.link_type === 'page') {
            const twrap = document.createElement('div')
            twrap.className = 'ed-field'
            twrap.innerHTML = '<label>Cieľová stránka</label>'
            const tsel = document.createElement('select')
            if (!it.target && ctx.pagesMeta[0]) it.target = ctx.pagesMeta[0].slug
            ctx.pagesMeta.forEach((p) => { const o = document.createElement('option'); o.value = p.slug; o.textContent = p.title || p.slug; if (it.target === p.slug) o.selected = true; tsel.appendChild(o) })
            tsel.onchange = () => (it.target = tsel.value)
            twrap.appendChild(tsel)
            row.appendChild(twrap)
          } else {
            row.appendChild(labeledInput(it.link_type === 'url' ? 'URL (https://…)' : 'ID kotvy (bez #)', it.target, (v) => (it.target = v)))
          }
          listHost.appendChild(row)
        })
      }
      paint()

      const addBtn = document.createElement('button')
      addBtn.className = 'ed-btn'
      addBtn.textContent = '+ Pridať položku'
      addBtn.onclick = () => { local.push({ label: 'Nová položka', link_type: 'page', target: ctx.pagesMeta[0] ? ctx.pagesMeta[0].slug : 'home' }); paint() }
      body.appendChild(addBtn)

      foot.append(mkBtn2('Zrušiť', close), mkBtn2('Uložiť', async () => {
        await api(`/admin/sites/${ctx.siteId}/menu`, { method: 'PUT', body: JSON.stringify({ items: local }) }).catch((e) => toast('Chyba: ' + e.message))
        ctx.menuItems = local
        state.menu = local.map((it, i) => ({ id: i, ...it }))
        renderMenu()
        toast('Menu uložené')
        close()
      }, true))
    },
  })
}

/* ---------- stránky webu ---------- */

function openPagesModal() {
  let newTitle = ''
  openModal({
    title: 'Stránky webu',
    render(body, foot, close) {
      const listHost = document.createElement('div')
      body.appendChild(listHost)
      function paint() {
        listHost.innerHTML = ''
        ctx.pagesMeta.forEach((p) => {
          const row = document.createElement('div')
          row.className = 'ed-list-item'
          const head = document.createElement('div')
          head.className = 'ed-list-item-head'
          head.innerHTML = `<span class="ed-list-title">${escapeHtml(p.title || p.slug)}${p.is_home ? ' 🏠' : ''} <span class="ed-hint">/${escapeHtml(p.slug)}</span></span>`
          const actions = document.createElement('div')
          actions.className = 'ed-mini-actions'
          const openB = document.createElement('button')
          openB.className = 'ed-btn small'
          openB.textContent = 'Otvoriť'
          openB.onclick = () => { location.href = `/s.html?site=${encodeURIComponent(siteSlug)}&page=${encodeURIComponent(p.slug)}` }
          actions.appendChild(openB)
          if (!p.is_home) {
            const del = document.createElement('button')
            del.className = 'ed-btn small danger'
            del.textContent = 'Zmazať'
            del.onclick = async () => {
              if (!confirm('Zmazať túto stránku?')) return
              await api(`/admin/pages/${p.id}`, { method: 'DELETE' }).catch((e) => toast('Chyba: ' + e.message))
              ctx.pagesMeta = ctx.pagesMeta.filter((x) => x.id !== p.id)
              paint()
            }
            actions.appendChild(del)
          }
          head.appendChild(actions)
          row.appendChild(head)
          listHost.appendChild(row)
        })
      }
      paint()

      const newWrap = document.createElement('div')
      newWrap.style.marginTop = '16px'
      newWrap.appendChild(labeledInput('Názov novej stránky', '', (v) => (newTitle = v)))
      const addBtn = document.createElement('button')
      addBtn.className = 'ed-btn primary'
      addBtn.textContent = '+ Vytvoriť stránku'
      addBtn.onclick = async () => {
        if (!newTitle.trim()) return
        const res = await api(`/admin/sites/${ctx.siteId}/pages`, { method: 'POST', body: JSON.stringify({ title: newTitle }) }).catch((e) => { toast('Chyba: ' + e.message); return null })
        if (res) location.href = `/s.html?site=${encodeURIComponent(siteSlug)}&page=${encodeURIComponent(res.slug)}`
      }
      newWrap.appendChild(addBtn)
      body.appendChild(newWrap)

      foot.append(mkBtn2('Zavrieť', close))
    },
  })
}

/* ---------- vzhľad / CSS ---------- */

function openThemeModal() {
  const local = { ...ctx.themeVars }
  let localCss = ctx.customCss
  openModal({
    title: 'Vzhľad a CSS', wide: true,
    render(body, foot, close) {
      function colorRow(label, key) {
        const row = document.createElement('div')
        row.className = 'ed-swatch-row'
        const l = document.createElement('label'); l.textContent = label
        const inp = document.createElement('input'); inp.type = 'color'; inp.value = local[key] || '#000000'
        inp.oninput = () => { local[key] = inp.value; applyTheme(local, localCss) }
        row.append(l, inp)
        return row
      }
      body.append(
        colorRow('Primárna farba', 'primary'),
        colorRow('Sekundárna farba', 'secondary'),
        colorRow('Pozadie stránky', 'bg'),
        colorRow('Text', 'text'),
        colorRow('Pozadie hlavičky', 'headerBg'),
        colorRow('Text hlavičky', 'headerText'),
      )

      function fontRow(label, key) {
        const row = document.createElement('div')
        row.className = 'ed-field'
        const l = document.createElement('label'); l.textContent = label
        const sel = document.createElement('select')
        FONTS.forEach((f) => { const o = document.createElement('option'); o.value = f; o.textContent = f; if ((local[key] || '') === f) o.selected = true; sel.appendChild(o) })
        sel.onchange = () => { local[key] = sel.value; applyTheme(local, localCss) }
        row.append(l, sel)
        return row
      }
      body.append(fontRow('Základné písmo', 'font'), fontRow('Písmo nadpisov', 'headingFont'))

      function rangeRow(label, key, min, max, unit) {
        const row = document.createElement('div')
        row.className = 'ed-swatch-row'
        const l = document.createElement('label'); l.textContent = label
        const inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.value = local[key] || min
        const val = document.createElement('span'); val.className = 'ed-range-val'; val.textContent = (local[key] || min) + unit
        inp.oninput = () => { local[key] = inp.value; val.textContent = inp.value + unit; applyTheme(local, localCss) }
        row.append(l, inp, val)
        return row
      }
      body.append(rangeRow('Zaoblenie rohov', 'radius', 0, 26, 'px'), rangeRow('Šírka obsahu', 'containerWidth', 900, 1400, 'px'))

      const cssWrap = document.createElement('div')
      cssWrap.className = 'ed-field'
      cssWrap.innerHTML = '<label>Vlastné CSS</label>'
      const cssArea = document.createElement('textarea')
      cssArea.style.minHeight = '120px'
      cssArea.value = localCss
      cssArea.oninput = () => { localCss = cssArea.value; applyTheme(local, localCss) }
      cssWrap.appendChild(cssArea)
      body.appendChild(cssWrap)

      foot.append(
        mkBtn2('Zrušiť zmeny', () => { applyTheme(ctx.themeVars, ctx.customCss); close() }),
        mkBtn2('Uložiť', async () => {
          await api(`/admin/sites/${ctx.siteId}/theme`, { method: 'PUT', body: JSON.stringify({ theme_vars: local, custom_css: localCss }) }).catch((e) => toast('Chyba: ' + e.message))
          ctx.themeVars = local; ctx.customCss = localCss
          state.themeVars = local; state.customCss = localCss
          toast('Vzhľad uložený')
          close()
        }, true),
      )
    },
    onClose: () => {},
  })
}

