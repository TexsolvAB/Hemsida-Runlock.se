/* Menu, dropdowns, site search and small page helpers. Shared by every page. */
(function () {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!location.hash) { var de = document.documentElement, sb = de.style.scrollBehavior; de.style.scrollBehavior = 'auto'; window.scrollTo(0, 0); setTimeout(function () { window.scrollTo(0, 0); de.style.scrollBehavior = sb; }, 0); }
  var n = document.querySelector('.nav'), b = document.querySelector('.burger'); if (!n) return;
  var y = document.querySelector('[data-year]'); if (y) y.textContent = new Date().getFullYear();
  /* mark the current page in the menu */
  var here = location.pathname.split('/').pop() || 'index.html';
  n.querySelectorAll('.menu a').forEach(function (a) { if (a.getAttribute('href') === here) { a.setAttribute('aria-current', 'page'); var li = a.closest('.has-sub'); if (li) li.classList.add('here'); } });
  if (b) {
    b.addEventListener('click', function () { var o = n.classList.toggle('open'); b.setAttribute('aria-expanded', o ? 'true' : 'false'); if (o) closeSearch(); });
    n.querySelectorAll('.menu a').forEach(function (a) { a.addEventListener('click', function () { n.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); }); });
  }
  /* dropdowns: hover on desktop, the chevron on phones, Escape closes */
  n.querySelectorAll('.has-sub').forEach(function (li) {
    var m = li.querySelector('.more');
    if (m) m.addEventListener('click', function () { var o = li.classList.toggle('open'); m.setAttribute('aria-expanded', o ? 'true' : 'false'); n.querySelectorAll('.has-sub').forEach(function (x) { if (x !== li) { x.classList.remove('open'); var xm = x.querySelector('.more'); if (xm) xm.setAttribute('aria-expanded', 'false'); } }); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { n.querySelectorAll('.has-sub.open').forEach(function (x) { x.classList.remove('open'); }); closeSearch(); } });

  /* search: an index of every page (search.json), scored on title, description, headings and text */
  var sb2 = n.querySelector('.sbtn'), box = document.getElementById('search'), q = document.getElementById('q'), res = document.getElementById('sres'), idx = null, loading = false;
  function openSearch() { if (!box) return; box.hidden = false; if (sb2) sb2.setAttribute('aria-expanded', 'true'); n.classList.remove('open'); if (b) b.setAttribute('aria-expanded', 'false'); setTimeout(function () { q.focus(); }, 30); if (!idx && !loading) { loading = true; fetch('search.json').then(function (r) { return r.json(); }).then(function (d) { idx = d; loading = false; run(); }).catch(function () { loading = false; }); } }
  function closeSearch() { if (!box || box.hidden) return; box.hidden = true; if (sb2) sb2.setAttribute('aria-expanded', 'false'); }
  if (sb2) sb2.addEventListener('click', function () { if (box.hidden) openSearch(); else closeSearch(); });
  var sc = n.querySelector('.sclose'); if (sc) sc.addEventListener('click', closeSearch);
  var form = n.querySelector('.sform'); if (form) form.addEventListener('submit', function (e) { e.preventDefault(); var a = res.querySelector('a'); if (a) location.href = a.getAttribute('href'); });
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function run() {
    if (!q || !res) return; var t = q.value.trim().toLowerCase(); if (!idx) { res.innerHTML = t ? '<p class="shint">Loading…</p>' : ''; return; }
    if (t.length < 2) { res.innerHTML = ''; return; }
    var terms = t.split(/\s+/).filter(Boolean), out = [];
    idx.forEach(function (p) {
      var s = 0, lt = p.title.toLowerCase(), ld = p.desc.toLowerCase(), lh = p.heads.toLowerCase(), lb = p.text.toLowerCase();
      terms.forEach(function (w) { if (lt.indexOf(w) >= 0) s += 12; if (ld.indexOf(w) >= 0) s += 5; if (lh.indexOf(w) >= 0) s += 4; var c = lb.split(w).length - 1; if (c) s += Math.min(6, 1 + c); });
      if (terms.every(function (w) { return (lt + ' ' + ld + ' ' + lh + ' ' + lb).indexOf(w) >= 0; })) s += 6;
      if (s > 0) out.push([s, p]);
    });
    out.sort(function (a, b) { return b[0] - a[0]; });
    if (!out.length) { res.innerHTML = '<p class="shint">Nothing found for “' + esc(q.value.trim()) + '”. Try a size (No 8), a use (towing, dogs) or a product name.</p>'; return; }
    res.innerHTML = out.slice(0, 8).map(function (r) {
      var p = r[1], i = p.text.toLowerCase().indexOf(terms[0]), snip = i >= 0 ? p.text.slice(Math.max(0, i - 70), i + 110) : p.desc;
      snip = esc(snip); terms.forEach(function (w) { snip = snip.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); });
      return '<a class="sitem" href="' + p.url + '"><b>' + esc(p.title) + '</b><span>' + (i >= 0 && i - 70 > 0 ? '…' : '') + snip + '…</span></a>';
    }).join('');
  }
  if (q) q.addEventListener('input', run);
  document.addEventListener('keydown', function (e) { if (e.key === '/' && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); } });
})();
