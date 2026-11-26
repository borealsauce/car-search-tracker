(() => {
'use strict';
const LS = {
  get(k, d) { try { const v = localStorage.getItem('cst.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { localStorage.setItem('cst.' + k, JSON.stringify(v)); },
  del(k) { localStorage.removeItem('cst.' + k); }
};
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => v == null || v === '' ? '' : '$' + Math.round(v).toLocaleString();
const mi = v => v == null || v === '' ? '' : Math.round(v).toLocaleString();
const link = (u, t) => u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t || 'Open')}</a>` : '';
let DATA = null, CFG = null, cur = LS.get('tab', null);
let sortMode = LS.get('sortMode', 'multi');

// ---------------- generic table: multi/single sort, drag-to-reorder columns, resizable ----------------
const TABLES = {};
function makeTable(id, el, cols) {
  const t = { id, el, cols, rows: [] };
  const st = LS.get('tbl.' + id, {});
  t.order = (st.order || []).filter(k => cols.some(c => c.k === k));
  cols.forEach(c => { if (!t.order.includes(c.k)) t.order.push(c.k); });
  t.widths = st.widths || {};
  t.sorts = LS.get('sort.' + id, []);
  t.save = () => LS.set('tbl.' + id, { order: t.order, widths: t.widths });
  t.saveSort = () => LS.set('sort.' + id, t.sorts);
  t.col = k => cols.find(c => c.k === k);
  t.render = rows => { if (rows) t.rows = rows; renderTable(t); };
  TABLES[id] = t; return t;
}
function cmp(a, b) {
  const ea = a == null || a === '', eb = b == null || b === '';
  if (ea && eb) return 0; if (ea) return 1; if (eb) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}
function sorted(t) {
  if (!t.sorts.length) return t.rows.slice();
  return t.rows.slice().sort((x, y) => {
    for (const s of t.sorts) {
      const c = t.col(s.k); if (!c) continue;
      const g = c.get || (r => r[c.k]);
      const va = g(x), vb = g(y);
      const ea = va == null || va === '', eb = vb == null || vb === '';
      if (ea !== eb) return ea ? 1 : -1;   // blanks last either direction
      const r = cmp(va, vb) * (s.dir === 'desc' ? -1 : 1);
      if (r) return r;
    }
    return 0;
  });
}
function clickSort(t, k) {
  const i = t.sorts.findIndex(s => s.k === k);
  if (sortMode === 'single') {
    t.sorts = (i === 0 && t.sorts.length === 1) ? [{ k, dir: t.sorts[0].dir === 'asc' ? 'desc' : 'asc' }] : [{ k, dir: 'asc' }];
  } else {
    if (i < 0) t.sorts.push({ k, dir: 'asc' });
    else if (t.sorts[i].dir === 'asc') t.sorts[i].dir = 'desc';
    else t.sorts.splice(i, 1);
  }
  t.saveSort(); renderTable(t); if (t.id === 'list') renderSortBar();
}
function renderTable(t) {
  const cols = t.order.map(k => t.col(k)).filter(Boolean);
  const rows = sorted(t);
  let h = '<thead><tr>';
  cols.forEach(c => {
    const si = t.sorts.findIndex(s => s.k === c.k);
    const ord = si >= 0 ? `<span class="ord">${t.sorts[si].dir === 'asc' ? '▲' : '▼'}${t.sorts.length > 1 ? si + 1 : ''}</span>` : '';
    const w = t.widths[c.k] || c.w || 110;
    h += `<th draggable="true" data-k="${c.k}" style="width:${w}px;position:sticky" title="Click to sort. Drag to move. Drag the right edge to resize.">${esc(c.label)}${ord}<span class="rz"></span></th>`;
  });
  h += '</tr></thead><tbody>';
  if (!rows.length) h += `<tr><td colspan="${cols.length}" class="small">Nothing here.</td></tr>`;
  rows.forEach(r => {
    h += '<tr>' + cols.map(c => `<td class="${c.num ? 'num' : ''}">${c.html ? c.html(r) : esc(r[c.k])}</td>`).join('') + '</tr>';
  });
  t.el.innerHTML = h + '</tbody>';
  t.el.style.width = cols.reduce((a, c) => a + (t.widths[c.k] || c.w || 110), 0) + 'px';
  t.el.querySelectorAll('th').forEach(th => {
    const k = th.dataset.k;
    th.addEventListener('click', e => { if (e.target.classList.contains('rz') || th._resized) { th._resized = false; return; } clickSort(t, k); });
    th.addEventListener('dragstart', e => { if (th._resizing) { e.preventDefault(); return; } e.dataTransfer.setData('text/col', t.id + '|' + k); e.stopPropagation(); });
    th.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/col')) { e.preventDefault(); th.classList.add('drag-over'); } });
    th.addEventListener('dragleave', () => th.classList.remove('drag-over'));
    th.addEventListener('drop', e => {
      th.classList.remove('drag-over');
      const [tid, from] = (e.dataTransfer.getData('text/col') || '').split('|');
      if (tid !== t.id || !from || from === k) return;
      e.preventDefault(); e.stopPropagation();
      const o = t.order.filter(x => x !== from); o.splice(o.indexOf(k) + (t.order.indexOf(from) < t.order.indexOf(k) ? 1 : 0), 0, from);
      t.order = o; t.save(); renderTable(t);
    });
    const rz = th.querySelector('.rz');
    rz.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation(); th._resizing = true; th.draggable = false;
      const x0 = e.clientX, w0 = th.offsetWidth;
      const mv = ev => { const w = Math.max(50, w0 + ev.clientX - x0); th.style.width = w + 'px'; t.widths[k] = w;
        t.el.style.width = t.order.reduce((a, kk) => a + (t.widths[kk] || (t.col(kk) || {}).w || 110), 0) + 'px'; };
      const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
        th._resizing = false; th._resized = true; th.draggable = true; t.save(); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
  });
}
function renderSortBar() {
  const t = TABLES.list; const bar = $('#sortBar');
  bar.innerHTML = t.sorts.map((s, i) => `<span class="chip">${i + 1}. ${esc((t.col(s.k) || {}).label || s.k)} ${s.dir === 'asc' ? '▲' : '▼'}<button data-i="${i}" title="Remove">×</button></span>`).join('');
  bar.querySelectorAll('button').forEach(b => b.onclick = () => { t.sorts.splice(+b.dataset.i, 1); t.saveSort(); renderTable(t); renderSortBar(); });
  $('#sortMode').textContent = sortMode === 'multi' ? 'Multi-sort on: each header click adds a level' : 'Single sort: a header click replaces the sort';
  $('#modeMulti').classList.toggle('on', sortMode === 'multi'); $('#modeSingle').classList.toggle('on', sortMode === 'single');
}

// ---------------- columns ----------------
const statusTag = r => {
  const s = r.sale_status || 'unverified';
  const cls = { active: 't-ok', 'active?': 't-unv', pending: 't-pend', sold: 't-pend', removed: 't-pend' }[s] || 't-unv';
  const lab = { active: 'Active', 'active?': 'Active? (Carvana)', pending: 'SALE PENDING', sold: 'SOLD', removed: 'Removed', unverified: 'Unverified' }[s] || s;
  return `<span class="tag ${cls}" title="${esc(r.sale_status_evidence || '')}">${lab}</span>`;
};
const loc = r => [r.city, r.state].filter(Boolean).join(', ');
const srcHtml = r => `${esc(r.via || r.source)}${(r.also_on || []).length ? '<div class="small">also: ' + r.also_on.map(a => link(a.url, a.source + (a.price ? ' ' + money(a.price) : ''))).join(', ') + '</div>' : ''}`;
const driveHtml = r => `${esc(r.variant || r.drivetrain || '?')}<div class="small">${esc(r.drive_basis === 'VIN-confirmed' ? 'confirmed by VIN' : r.drive_basis === 'seller-stated' ? 'seller-stated' : 'not stated')}</div>`;
const LIST_COLS = [
  { k: 'search', label: 'Search', w: 150, get: r => r._search },
  { k: 'flags', label: 'Flags', w: 110, get: r => (r.bucket === 'maybe' ? 'b' : 'a') + (r.is_new ? 0 : 1), html: r =>
      (r.is_new ? '<span class="tag t-new">NEW</span>' : '') + (r.price_drop ? `<span class="tag t-drop">▼ ${money(r.price_drop)}</span>` : '') +
      (r.bucket === 'maybe' ? `<span class="tag t-maybe" title="${esc((r.reasons || []).join('; '))}">MAYBE</span>` : '') },
  { k: 'status', label: 'Sale status', w: 120, get: r => r.sale_status || 'unverified', html: statusTag },
  { k: 'source', label: 'Source', w: 150, get: r => r.via || r.source, html: srcHtml },
  { k: 'year', label: 'Year', w: 60, num: true },
  { k: 'trim', label: 'Trim (as listed)', w: 170, get: r => r.trim },
  { k: 'drivetrain', label: 'Drivetrain', w: 140, get: r => r.variant || r.drivetrain, html: driveHtml },
  { k: 'price', label: 'Price', w: 95, num: true, html: r => r.price ? money(r.price) : '<span class="small">call</span>' },
  { k: 'miles', label: 'Miles', w: 80, num: true, html: r => mi(r.miles) },
  { k: 'loc', label: 'Location', w: 150, get: loc, html: r => esc(loc(r)) },
  { k: 'distance', label: 'Mi from home', w: 95, num: true, html: r => mi(r.distance) },
  { k: 'seller', label: 'Seller', w: 150 },
  { k: 'seller_type', label: 'Seller type', w: 95 },
  { k: 'title', label: 'Title', w: 90 },
  { k: 'vin', label: 'VIN', w: 165, html: r => r.vin ? `<span class="small">${esc(r.vin)}</span>` : '' },
  { k: 'first_seen', label: 'First seen', w: 125 },
  { k: 'link', label: 'Listing', w: 80, get: r => r.url, html: r => link(r.url, 'Open') + (r.alt_url ? `<div class="small">${link(r.alt_url, /visor\.vin/.test(r.alt_url) ? 'Visor record' : 'Dealer site')}</div>` : '') },
  { k: 'notes', label: 'Notes', w: 280, html: r => `<div class="clamp small">${esc(((r.reasons || []).length && r.bucket === 'maybe' ? 'Maybe because: ' + r.reasons.join('; ') + '. ' : '') + (r.notes || '') + (r.sale_status_evidence ? ' [Status: ' + r.sale_status_evidence + ']' : ''))}</div>` },
];
const EX_COLS = [
  { k: 'search', label: 'Search', w: 150, get: r => r._search },
  { k: 'reasons', label: 'Why excluded', w: 230, get: r => (r.reasons || []).join('; '), html: r => (r.reasons || []).map(x => `<span class="tag ${/PENDING|SOLD|removed/.test(x) ? 't-pend' : 't-unv'}">${esc(x)}</span>`).join('') },
  { k: 'source', label: 'Source', w: 140, get: r => r.via || r.source, html: srcHtml },
  { k: 'year', label: 'Year', w: 60, num: true },
  { k: 'trim', label: 'Trim', w: 150 },
  { k: 'drivetrain', label: 'Drivetrain', w: 130, get: r => r.variant || r.drivetrain, html: driveHtml },
  { k: 'price', label: 'Price', w: 95, num: true, html: r => money(r.price) },
  { k: 'miles', label: 'Miles', w: 80, num: true, html: r => mi(r.miles) },
  { k: 'loc', label: 'Location', w: 140, get: loc, html: r => esc(loc(r)) },
  { k: 'status', label: 'Sale status', w: 120, get: r => r.sale_status || '', html: r => r.sale_status ? statusTag(r) : '' },
  { k: 'link', label: 'Listing', w: 70, get: r => r.url, html: r => link(r.url, 'Open') },
  { k: 'notes', label: 'Notes', w: 240, html: r => `<div class="clamp small">${esc((r.sale_status_evidence ? '[' + r.sale_status_evidence + '] ' : '') + (r.notes || ''))}</div>` },
];
const SRC_COLS = [
  { k: 'search', label: 'Search', w: 150, get: r => r._search },
  { k: 'source', label: 'Site', w: 170, html: r => link(r.url, r.source) || esc(r.source) },
  { k: 'status', label: 'Status', w: 130, html: r => `<span class="tag ${/found|drop$/.test(r.status) && r.count ? 't-ok' : /blocked|error/.test(r.status) ? 't-pend' : 't-unv'}">${esc(r.status)}</span>` },
  { k: 'count', label: 'Rows pulled', w: 90, num: true },
  { k: 'matches', label: 'Matches', w: 80, num: true },
  { k: 'checked', label: 'Last checked (PT)', w: 140 },
  { k: 'note', label: 'Details', w: 420, html: r => `<span class="small">${esc(r.note)}</span>` },
];

// ---------------- layout: drag any box onto another to swap ----------------
function applyLayout() {
  const board = $('#board'); const ord = LS.get('layout', null);
  if (ord) ord.forEach(k => { const b = board.querySelector(`.box[data-box="${k}"]`); if (b) board.appendChild(b); });
}
function swapNodes(a, b) { const p = a.parentNode, n = a.nextSibling === b ? a : a.nextSibling; b.parentNode.insertBefore(a, b); p.insertBefore(b, n); }
function wireBoxes() {
  document.querySelectorAll('#board > .box').forEach(box => {
    const h = box.querySelector('h2');
    h.addEventListener('mousedown', () => box.draggable = true);
    box.addEventListener('dragend', () => box.draggable = false);
    box.addEventListener('dragstart', e => { if (e.target !== box) return; e.dataTransfer.setData('text/box', box.dataset.box); });
    box.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/box')) { e.preventDefault(); box.classList.add('drag-over'); } });
    box.addEventListener('dragleave', () => box.classList.remove('drag-over'));
    box.addEventListener('drop', e => {
      box.classList.remove('drag-over'); const k = e.dataTransfer.getData('text/box'); if (!k || k === box.dataset.box) return;
      e.preventDefault(); swapNodes($(`.box[data-box="${k}"]`), box);
      LS.set('layout', [...document.querySelectorAll('#board > .box')].map(b => b.dataset.box));
    });
  });
}
function wireCards() {
  const wrap = $('#cards');
  const ord = LS.get('cards', null);
  if (ord) ord.forEach(k => { const c = wrap.querySelector(`.card[data-card="${k}"]`); if (c) wrap.appendChild(c); });
  wrap.querySelectorAll('.card').forEach(c => {
    c.draggable = true;
    c.addEventListener('dragstart', e => { e.dataTransfer.setData('text/card', c.dataset.card); e.stopPropagation(); });
    c.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/card')) { e.preventDefault(); c.classList.add('drag-over'); } });
    c.addEventListener('dragleave', () => c.classList.remove('drag-over'));
    c.addEventListener('drop', e => {
      c.classList.remove('drag-over'); const k = e.dataTransfer.getData('text/card'); if (!k || k === c.dataset.card) return;
      e.preventDefault(); e.stopPropagation(); swapNodes(wrap.querySelector(`.card[data-card="${k}"]`), c);
      LS.set('cards', [...wrap.querySelectorAll('.card')].map(x => x.dataset.card));
    });
  });
}

// ---------------- page ----------------
function searchesFor() { return cur === '__all' ? DATA.searches : DATA.searches.filter(s => s.config.id === cur); }
function tag(rows, s) { return rows.map(r => Object.assign(r, { _search: s.config.name })); }
function renderTabs() {
  const tabs = DATA.searches.map(s => ({ id: s.config.id, name: s.config.name, n: s.summary.matches }));
  if (DATA.searches.length > 1 || true) tabs.push({ id: '__all', name: 'All searches', n: DATA.searches.reduce((a, s) => a + s.summary.matches, 0) });
  if (!tabs.some(t => t.id === cur)) cur = tabs[0].id;
  $('#tabs').innerHTML = tabs.map(t => `<button class="tab ${t.id === cur ? 'on' : ''}" data-id="${t.id}">${esc(t.name)}<span class="n">${t.n}</span></button>`).join('');
  $('#tabs').querySelectorAll('.tab').forEach(b => b.onclick = () => { cur = b.dataset.id; LS.set('tab', cur); renderAll(); });
}
function critText(S) {
  const p = [];
  p.push(`<b>${esc(S.make)} ${esc(S.model)}</b>`);
  if (S.year_min || S.year_max) p.push(`years <b>${S.year_min || 'any'}–${S.year_max || 'any'}</b>`);
  if (S.max_miles) p.push(`under <b>${mi(S.max_miles)} mi</b>`);
  if (S.max_price) p.push(`max <b>${money(S.max_price)}</b>`);
  if (S.min_price) p.push(`ignore under ${money(S.min_price)}`);
  if ((S.drivetrain_allow || []).length) p.push(`drivetrain <b>${S.drivetrain_allow.join('/')}</b>`);
  if ((S.exclude_keywords || []).length) p.push(`excluding <b>${esc(S.exclude_keywords.join(', '))}</b>`);
  if ((S.include_keywords || []).length) p.push(`must mention ${esc(S.include_keywords.join(', '))}`);
  p.push(S.radius ? `within ${S.radius} mi of ${esc(DATA.home)}` : `<b>nationwide</b> (distance from ${esc(DATA.home)})`);
  p.push('sale-pending / on-hold / sold listings removed');
  return p.join(' · ');
}
function card(k, label, v, sub) { return `<div class="card" data-card="${k}"><div class="k">${label}</div><div class="v">${v}</div><div class="s">${sub || ''}</div></div>`; }
function renderCards(ss) {
  const all = ss.flatMap(s => s.listings.filter(r => r.bucket === 'match'));
  const sum = k => ss.reduce((a, s) => a + (s.summary[k] || 0), 0);
  const best = (k) => all.filter(r => r[k] != null).sort((a, b) => a[k] - b[k])[0];
  const ch = best('price'), lm = best('miles'), cl = best('distance');
  const desc = r => r ? `${r.year || ''} ${esc(r.variant || r.trim || '')} · ${esc(loc(r))}<br>${link(r.url, 'Open listing')} via ${esc(r.via || r.source)}` : '';
  const bySrc = {}; all.forEach(r => (r.sources || [r.source]).forEach(s => bySrc[s] = (bySrc[s] || 0) + 1));
  $('#cards').innerHTML =
    card('total', 'Total matches', all.length, `${sum('maybes')} maybes to check`) +
    card('cheapest', 'Cheapest', ch ? money(ch.price) : '—', ch ? `${mi(ch.miles)} mi · ` + desc(ch) : '') +
    card('lowmiles', 'Lowest miles', lm ? mi(lm.miles) + ' mi' : '—', lm ? money(lm.price) + ' · ' + desc(lm) : '') +
    card('closest', 'Closest to home', cl ? mi(cl.distance) + ' mi' : '—', cl ? money(cl.price) + ' · ' + desc(cl) : '') +
    card('new', 'New since last run', sum('new'), `${sum('price_drops')} price drops`) +
    card('pending', 'Removed as pending/sold', sum('pending_excluded'), 'on hold, sale pending, sold or deleted') +
    card('bysource', 'Matches by source', Object.keys(bySrc).length, Object.entries(bySrc).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)}: ${v}`).join('<br>'));
  wireCards();
}
function listRows(ss) {
  const q = $('#q').value.trim().toLowerCase();
  const sm = $('#showMaybe').checked, no = $('#newOnly').checked, hu = $('#hideUnverified').checked;
  return ss.flatMap(s => tag(s.listings, s)).filter(r => (sm || r.bucket === 'match') && (!no || r.is_new) &&
    (!hu || ['active'].includes(r.sale_status)) &&
    (!q || JSON.stringify([r.city, r.state, r.seller, r.trim, r.notes, r.via, r.vin, r.variant, r.year]).toLowerCase().includes(q)));
}
function renderAll() {
  renderTabs();
  const ss = searchesFor();
  $('#criteria').innerHTML = cur === '__all' ? `Showing every saved search together (${ss.length}).` : critText(ss[0].config);
  const showSearchCol = cur === '__all';
  [TABLES.list, TABLES.ex, TABLES.src].forEach(t => { t.cols.find(c => c.k === 'search').hidden = !showSearchCol; });
  ['list', 'ex', 'src'].forEach(id => { const t = TABLES[id]; t.order = t.order.filter(k => k !== 'search'); if (showSearchCol) t.order.unshift('search'); });
  renderCards(ss);
  const lr = listRows(ss); TABLES.list.render(lr); $('#nList').textContent = lr.length;
  const ex = ss.flatMap(s => tag(s.excluded, s)); TABLES.ex.render(ex); $('#nEx').textContent = ex.length;
  const sr = ss.flatMap(s => s.sources.map(x => Object.assign({}, x, { _search: s.config.name }))); TABLES.src.render(sr); $('#nSrc').textContent = sr.length;
  renderSortBar();
}
function exportCsv() {
  const t = TABLES.list; const cols = t.order.map(k => t.col(k)).filter(Boolean);
  const val = (c, r) => { const v = c.k === 'loc' ? loc(r) : c.k === 'link' ? r.url : c.k === 'drivetrain' ? (r.variant || r.drivetrain || '') + ' (' + r.drive_basis + ')' : c.k === 'status' ? r.sale_status : c.k === 'flags' ? [r.is_new ? 'NEW' : '', r.price_drop ? 'PRICE DROP' : '', r.bucket === 'maybe' ? 'MAYBE' : ''].filter(Boolean).join(' ') : c.k === 'source' ? (r.via || r.source) : c.k === 'search' ? r._search : r[c.k]; return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
  const csv = [cols.map(c => '"' + c.label + '"').join(',')].concat(sorted(t).map(r => cols.map(c => val(c, r)).join(','))).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'car-search-listings.csv'; a.click();
}
function formEntry() {
  const f = new FormData($('#addForm')); const g = k => (f.get(k) || '').trim();
  const n = k => g(k) ? Number(g(k)) : null; const list = k => g(k) ? g(k).split(',').map(s => s.trim()).filter(Boolean) : [];
  const name = g('name');
  return { id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40), name, make: g('make'), model: g('model'),
    year_min: n('year_min'), year_max: n('year_max'), max_miles: n('max_miles'), max_price: n('max_price'), min_price: n('min_price'),
    drivetrain_allow: list('drivetrain_allow').map(s => s.toUpperCase()), include_keywords: list('include_keywords'),
    exclude_keywords: list('exclude_keywords').map(s => s.toLowerCase()), radius: n('radius') || 0,
    craigslist_query: g('craigslist_query') || `${g('make')} ${g('model')}`.toLowerCase(),
    title_must_contain: list('title_must_contain').length ? list('title_must_contain').map(s => s.toLowerCase()) : [g('model').toLowerCase()], slugs: {} };
}
function wireForm() {
  $('#addForm').addEventListener('submit', e => { e.preventDefault(); $('#cfgOut').textContent = JSON.stringify(formEntry(), null, 2); });
  $('#copyCfg').onclick = () => { const t = $('#cfgOut').textContent || JSON.stringify(formEntry(), null, 2); navigator.clipboard.writeText(t); $('#copyCfg').textContent = 'Copied'; setTimeout(() => $('#copyCfg').textContent = 'Copy', 1500); };
  $('#dlCfg').onclick = () => {
    if (!$('#addForm').reportValidity()) return;
    const c = JSON.parse(JSON.stringify(CFG)); const e = formEntry(); c.searches = c.searches.filter(s => s.id !== e.id).concat([e]);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' })); a.download = 'searches.json'; a.click();
  };
}
async function init() {
  const v = Date.now();
  [DATA, CFG] = await Promise.all([fetch('data/data.json?v=' + v).then(r => r.json()), fetch('data/searches.json?v=' + v).then(r => r.json())]);
  $('#asof').textContent = `Last refresh ${DATA.generated} · distances from ${DATA.home}`;
  makeTable('list', $('#tList'), LIST_COLS); makeTable('ex', $('#tEx'), EX_COLS); makeTable('src', $('#tSrc'), SRC_COLS);
  if (!LS.get('sort.list', null)) { TABLES.list.sorts = [{ k: 'price', dir: 'asc' }]; }
  ['q', 'showMaybe', 'newOnly', 'hideUnverified'].forEach(id => $('#' + id).addEventListener('input', () => { const ss = searchesFor(); const lr = listRows(ss); TABLES.list.render(lr); $('#nList').textContent = lr.length; }));
  $('#modeMulti').onclick = () => { sortMode = 'multi'; LS.set('sortMode', sortMode); renderSortBar(); };
  $('#modeSingle').onclick = () => { sortMode = 'single'; LS.set('sortMode', sortMode); Object.values(TABLES).forEach(t => { t.sorts = t.sorts.slice(0, 1); t.saveSort(); renderTable(t); }); renderSortBar(); };
  $('#clearSorts').onclick = () => { Object.values(TABLES).forEach(t => { t.sorts = []; t.saveSort(); renderTable(t); }); renderSortBar(); };
  $('#exportCsv').onclick = exportCsv;
  $('#resetLayout').onclick = () => { LS.del('layout'); LS.del('cards'); Object.keys(TABLES).forEach(id => LS.del('tbl.' + id)); location.reload(); };
  applyLayout(); wireBoxes(); wireForm(); renderAll();
}
init().catch(e => { document.body.insertAdjacentHTML('beforeend', `<p style="padding:20px;color:#f87171">Could not load data: ${esc(e.message)}</p>`); });
})();
