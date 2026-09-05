/* Minimálny WYSIWYG editor bez závislostí (contenteditable + execCommand), rovnaký princíp ako v podhajska.
   Použitie: var ed = SBwysiwyg.create(hostEl, { onImage: fn }); ed.get(); ed.set(html); */
(function () {
  'use strict';

  function btn(label, title, on) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'wz-btn';
    b.textContent = label;
    b.title = title;
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', on);
    return b;
  }

  function create(host, opts) {
    opts = opts || {};
    host.classList.add('wz');
    var bar = document.createElement('div');
    bar.className = 'wz-bar';
    var area = document.createElement('div');
    area.className = 'wz-area';
    area.contentEditable = 'true';
    area.spellcheck = true;

    function cmd(name, val) { area.focus(); document.execCommand(name, false, val || null); }

    bar.appendChild(btn('B', 'Tučné', function () { cmd('bold'); }));
    bar.appendChild(btn('I', 'Kurzíva', function () { cmd('italic'); }));
    bar.appendChild(btn('H2', 'Nadpis 2', function () { cmd('formatBlock', 'H2'); }));
    bar.appendChild(btn('H3', 'Nadpis 3', function () { cmd('formatBlock', 'H3'); }));
    bar.appendChild(btn('¶', 'Odsek', function () { cmd('formatBlock', 'P'); }));
    bar.appendChild(btn('• Zoznam', 'Odrážky', function () { cmd('insertUnorderedList'); }));
    bar.appendChild(btn('1. Zoznam', 'Číslovaný zoznam', function () { cmd('insertOrderedList'); }));
    bar.appendChild(btn('„ "', 'Citát', function () { cmd('formatBlock', 'BLOCKQUOTE'); }));
    bar.appendChild(btn('🔗', 'Odkaz', function () {
      var url = prompt('URL odkazu:', 'https://');
      if (url) cmd('createLink', url);
    }));
    bar.appendChild(btn('✕ odkaz', 'Zrušiť odkaz', function () { cmd('unlink'); }));
    if (opts.onImage) {
      bar.appendChild(btn('🖼 Fotka', 'Vložiť obrázok z médií', function () {
        opts.onImage(function (url, alt) {
          area.focus();
          document.execCommand('insertHTML', false, '<img src="' + url + '" alt="' + (alt || '').replace(/"/g, '') + '">');
        });
      }));
    }

    host.appendChild(bar);
    host.appendChild(area);

    return {
      el: area,
      get: function () { return area.innerHTML.trim(); },
      set: function (html) { area.innerHTML = html || ''; },
      focus: function () { area.focus(); },
    };
  }

  window.SBwysiwyg = { create: create };
})();
