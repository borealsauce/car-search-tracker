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
const histTag = r => { const h = r.history || 'history unverified';
  return h.startsWith('clean') ? `<span class="tag t-clean" title="${esc(h)}">Clean history</span>` :
    r.history_bad ? `<span class="tag t-hist" title="${esc(r.history_bad)}">${esc(h)}</span>` :
    `<span class="tag t-unv" title="${esc(h)}">${h.startsWith('title clean') ? 'Clean title · accidents unverified' : 'History unverified'}</span>`; };
const srcHtml = r => `${esc(r.via || r.source)}${(r.also_on || []).length ? '<div class="small">also: ' + r.also_on.map(a => link(a.url, a.source + (a.price ? ' ' + money(a.price) : ''))).join(', ') + '</div>' : ''}`;
const driveHtml = r => `${esc(r.variant || r.drivetrain || '?')}<div class="small">${esc(r.drive_basis === 'VIN-confirmed' ? 'confirmed by VIN' : r.drive_basis === 'VIN-decoded (NHTSA)' ? 'VIN decoded (NHTSA)' : r.drive_basis === 'seller-stated' ? 'seller-stated' : 'not stated')}</div>`;
const LIST_COLS = [
  { k: 'search', label: 'Search', w: 150, get: r => r._search },
  { k: 'flags', label: 'Flags', w: 110, get: r => (r.bucket === 'maybe' ? 'b' : 'a') + (r.is_new ? 0 : 1), html: r =>
      (r.is_new ? '<span class="tag t-new">NEW</span>' : '') + (r.price_drop ? `<span class="tag t-drop">▼ ${money(r.price_drop)}</span>` : '') +
      (r.bucket === 'maybe' ? `<span class="tag t-maybe" title="${esc((r.reasons || []).join('; '))}">MAYBE</span>` : '') },
  { k: 'status', label: 'Sale status', w: 120, get: r => r.sale_status || 'unverified', html: statusTag },
  { k: 'history', label: 'History', w: 150, get: r => r.history, html: histTag },
  { k: 'source', label: 'Source', w: 150, get: r => r.via || r.source, html: srcHtml },
  { k: 'year', label: 'Year', w: 60, num: true },
  { k: 'trim_class', label: 'Trim class', w: 190, get: r => r.trim_class, html: r => tcTag(r) + (r.trim_class_evidence ? `<div class="clamp small">${esc(r.trim_class_evidence)}</div>` : '') },
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
  { k: 'reasons', label: 'Why excluded', w: 230, get: r => (r.reasons || []).join('; '), html: r => (r.reasons || []).map(x => `<span class="tag ${/PENDING|SOLD|removed|ACCIDENT|suspect/.test(x) ? 't-pend' : 't-unv'}">${esc(x)}</span>`).join('') },
  { k: 'source', label: 'Source', w: 140, get: r => r.via || r.source, html: srcHtml },
  { k: 'year', label: 'Year', w: 60, num: true },
  { k: 'trim', label: 'Trim', w: 150 },
  { k: 'drivetrain', label: 'Drivetrain', w: 130, get: r => r.variant || r.drivetrain, html: driveHtml },
  { k: 'price', label: 'Price', w: 95, num: true, html: r => money(r.price) },
  { k: 'miles', label: 'Miles', w: 80, num: true, html: r => mi(r.miles) },
  { k: 'loc', label: 'Location', w: 140, get: loc, html: r => esc(loc(r)) },
  { k: 'status', label: 'Sale status', w: 120, get: r => r.sale_status || '', html: r => r.sale_status ? statusTag(r) : '' },
  { k: 'history', label: 'History', w: 140, get: r => r.history, html: histTag },
  { k: 'link', label: 'Listing', w: 70, get: r => r.url, html: r => link(r.url, 'Open') },
  { k: 'notes', label: 'Notes', w: 240, html: r => `<div class="clamp small">${esc((r.sale_status_evidence ? '[' + r.sale_status_evidence + '] ' : '') + (r.notes || ''))}</div>` },
];
const COMP_COLS = [
  { k: 'source', label: 'Site', w: 130 },
  { k: 'result', label: 'Result', w: 110 },
  { k: 'date', label: 'Date', w: 95, get: r => { const m = String(r.date || '').match(/(\d+)\/(\d+)\/(\d+)/); return m ? +m[3] * 1e4 + +m[1] * 100 + +m[2] : r.date; }, html: r => esc(r.date) },
  { k: 'year', label: 'Year', w: 60, num: true },
  { k: 'title', label: 'Vehicle', w: 300, get: r => r.title || r.trim, html: r => esc(r.title || [r.year, r.trim].filter(Boolean).join(' ')) },
  { k: 'price', label: 'Price', w: 100, num: true, html: r => money(r.price) },
  { k: 'miles', label: 'Miles', w: 80, num: true, html: r => mi(r.miles) },
  { k: 'link', label: 'Link', w: 70, get: r => r.url, html: r => link(r.url, 'Open') },
  { k: 'notes', label: 'Notes', w: 200, html: r => `<span class="small">${esc(r.notes || '')}</span>` },
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
function tag(rows, s) { return rows.map(r => Object.assign(r, { _search: s.config.name, _cfg: s.config })); }
function renderTabs() {
  const tabs = [{ id: '__new', name: '＋ New search', n: null }].concat(DATA.searches.map(s => ({ id: s.config.id, name: s.config.name, n: s.summary.matches })));
  if (DATA.searches.length > 1 || true) tabs.push({ id: '__all', name: 'All searches', n: DATA.searches.reduce((a, s) => a + s.summary.matches, 0) });
  if (!tabs.some(t => t.id === cur)) cur = tabs[0].id;
  $('#tabs').innerHTML = tabs.map(t => `<button class="tab ${t.id === cur ? 'on' : ''}${t.id === '__new' ? ' tab-new' : ''}" data-id="${t.id}">${esc(t.name)}${t.n == null ? '' : `<span class="n">${t.n}</span>`}</button>`).join('');
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
    card('history', 'Removed: accident / branded title', sum('history_excluded'), `${sum('history_unverified')} remaining matches have unverified history`) +
    (all.some(r => r.trim_class) ? card('trimclass', 'Trim class', all.filter(r => r.trim_class).length,
      Object.entries(all.reduce((o, r) => { if (r.trim_class) o[r.trim_class] = (o[r.trim_class] || 0) + 1; return o; }, {})).map(([k, v]) => `${esc(k)}: ${v}`).join('<br>')) : '') +
    card('bysource', 'Matches by source', Object.keys(bySrc).length, Object.entries(bySrc).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)}: ${v}`).join('<br>'));
  wireCards();
}
const mkOf = r => r.make || (r._cfg || {}).make || '';
const mdOf = r => r.model || (r._cfg || {}).model || '';
const tcOf = r => r.trim_class || 'Not classified';
const tcTag = r => { if (!r.trim_class) return '';
  const c = /^premium/i.test(r.trim_class) ? 't-tcp' : /^base/i.test(r.trim_class) ? 't-tcb' : 't-tcu';
  const lbl = r.trim_class === 'Unverified' ? 'Trim unverified: check interior photos (leather = Premium)' : r.trim_class + (r.trim_class_conf === 'low' ? ' (likely, by price)' : r.trim_class_conf === 'medium' ? ' (probable)' : '');
  return `<span class="tag ${c}" title="${esc(r.trim_class_evidence || '')}">${esc(lbl)}</span>`; };
const trimOf = r => r.variant || r.trim || 'Not stated';
const driveOf = r => r.drivetrain || 'Not stated';
const srcOf = r => r.source;
const sellOf = r => r.seller_type || 'unknown';
function allRows(ss) { return ss.flatMap(s => s.listings.map(r => Object.assign(r, { _search: s.config.name, _cfg: s.config }))); }
let FILT = LS.get('filters', {});
function checksFor(id, rows, fn) {
  const el = $('#' + id); const counts = {};
  rows.forEach(r => { const v = fn(r); counts[v] = (counts[v] || 0) + 1; });
  const sel = FILT[id] || [];
  el.innerHTML = Object.keys(counts).sort().map(v => `<label class="chk"><input type="checkbox" value="${esc(v)}" ${sel.includes(v) ? 'checked' : ''}> ${esc(v)}<span class="cnt">${counts[v]}</span></label>`).join('') || '<span class="small">—</span>';
  el.querySelectorAll('input').forEach(i => i.onchange = () => { FILT[id] = [...el.querySelectorAll('input:checked')].map(x => x.value); LS.set('filters', FILT); refreshList(); });
}
function selFor(id, vals, anyLabel) {
  const el = $('#' + id); const cur = FILT[id] || '';
  el.innerHTML = `<option value="">${anyLabel}</option>` + vals.map(v => `<option ${String(v) === String(cur) ? 'selected' : ''}>${esc(v)}</option>`).join('');
  el.onchange = () => { FILT[id] = el.value; LS.set('filters', FILT); refreshList(); };
}
function buildSidebar(ss) {
  const rows = allRows(ss);
  const uniq = f => [...new Set(rows.map(f).filter(Boolean))].sort();
  selFor('fMake', uniq(mkOf), 'All makes'); selFor('fModel', uniq(mdOf), 'All models');
  const yrs = uniq(r => r.year).map(Number).sort((a, b) => a - b);
  selFor('fYearMin', yrs, 'Min'); selFor('fYearMax', yrs, 'Max');
  checksFor('fTClass', rows, tcOf); $('#fTClassGrp').hidden = !rows.some(r => r.trim_class); checksFor('fTrim', rows, trimOf); checksFor('fDrive', rows, driveOf); checksFor('fSource', rows, srcOf); checksFor('fSeller', rows, sellOf);
  ['fPriceMin', 'fPriceMax', 'fMiles', 'fDist'].forEach(id => { const el = $('#' + id); el.value = FILT[id] || ''; el.oninput = el.onchange = () => { FILT[id] = el.value; LS.set('filters', FILT); refreshList(); }; });
}
function listRows(ss) {
  const q = $('#q').value.trim().toLowerCase();
  const sm = $('#showMaybe').checked, no = $('#newOnly').checked, hu = $('#hideUnverified').checked, co = $('#cleanOnly').checked, dr = $('#dropOnly').checked;
  const F = FILT, inSet = (id, v) => !(F[id] || []).length || F[id].includes(v), n = id => F[id] ? Number(F[id]) : null;
  return allRows(ss).filter(r => (sm || r.bucket === 'match') && (!no || r.is_new) && (!dr || r.price_drop) &&
    (!hu || r.sale_status === 'active') && (!co || (r.history || '').startsWith('clean')) &&
    (!F.fMake || mkOf(r) === F.fMake) && (!F.fModel || mdOf(r) === F.fModel) &&
    (!n('fYearMin') || (r.year || 0) >= n('fYearMin')) && (!n('fYearMax') || (r.year || 9999) <= n('fYearMax')) &&
    (!n('fPriceMin') || (r.price || 0) >= n('fPriceMin')) && (!n('fPriceMax') || (r.price != null && r.price <= n('fPriceMax'))) &&
    (!n('fMiles') || (r.miles != null && r.miles <= n('fMiles'))) && (!n('fDist') || (r.distance != null && r.distance <= n('fDist'))) &&
    inSet('fTrim', trimOf(r)) && inSet('fTClass', tcOf(r)) && inSet('fDrive', driveOf(r)) && inSet('fSource', srcOf(r)) && inSet('fSeller', sellOf(r)) &&
    (!q || JSON.stringify([r.city, r.state, r.seller, r.trim, r.notes, r.via, r.vin, r.variant, r.year, r.trim_class, r.trim_class_evidence]).toLowerCase().includes(q)));
}
// card view
const SORTS = {
  newest: [(a, b) => cmp(b.first_seen, a.first_seen) || cmp(a.price, b.price)],
  price_asc: [(a, b) => cmp(a.price, b.price)], price_desc: [(a, b) => (b.price == null) - (a.price == null) || (b.price || 0) - (a.price || 0)],
  miles_asc: [(a, b) => cmp(a.miles, b.miles)], dist_asc: [(a, b) => cmp(a.distance, b.distance)], year_desc: [(a, b) => cmp(b.year, a.year) || cmp(a.price, b.price)],
};
const SORT_TO_TABLE = { newest: [{ k: 'first_seen', dir: 'desc' }], price_asc: [{ k: 'price', dir: 'asc' }], price_desc: [{ k: 'price', dir: 'desc' }],
  miles_asc: [{ k: 'miles', dir: 'asc' }], dist_asc: [{ k: 'distance', dir: 'asc' }], year_desc: [{ k: 'year', dir: 'desc' }] };
function cardHtml(r) {
  const title = `${r.year || ''} ${mkOf(r)} ${mdOf(r)}`.trim();
  const ph = r.photo ? `<img src="${esc(r.photo)}" loading="lazy" referrerpolicy="no-referrer" alt="${esc(title)}" onerror="this.remove()">` : '<span>No photo from source</span>';
  const ov = (r.is_new ? '<span class="tag t-new">NEW</span>' : '') + (r.price_drop ? `<span class="tag t-drop">▼ ${money(r.price_drop)}</span>` : '') +
    (r.bucket === 'maybe' ? `<span class="tag t-maybe" title="${esc((r.reasons || []).join('; '))}">MAYBE</span>` : '');
  const srcs = [r.via || r.source].concat((r.also_on || []).map(a => a.source)).filter((v, i, x) => x.indexOf(v) === i);
  return `<article class="lc">
    <a class="ph" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${ph}<div class="ov">${ov}</div></a>
    <div class="bd">
      <div class="ttl">${esc(title)}</div>
      <div class="trim">${esc(r.variant || r.trim || '')}${r.drive_basis === 'VIN-confirmed' ? ' · VIN-confirmed' : r.drive_basis === 'VIN-decoded (NHTSA)' ? ' · ' + esc(r.drivetrain) + ' (VIN decoded)' : r.drivetrain ? ' · ' + esc(r.drivetrain) + ' (seller-stated)' : ''}</div>
      <div class="price">${r.price ? money(r.price) : '<span class="small">Call for price</span>'}</div>
      <div class="meta">${r.miles != null ? mi(r.miles) + ' mi' : 'Miles not shown'}${r.title ? ' · ' + esc(r.title) + ' title' : ''}</div>
      <div class="loc">📍 ${esc(loc(r) || 'Location not shown')}${r.distance != null ? ` · ${mi(r.distance)} mi away` : ''}</div>
      <div class="badges">${srcs.map(s => `<span class="tag src">${esc(s)}</span>`).join('')}${statusTag(r)}${histTag(r)}</div>
      ${r.trim_class ? `<div class="tcrow">${tcTag(r)}<div class="small tcev">${esc(r.trim_class_evidence || '')}</div></div>` : ''}
      ${(r.notes || r.reasons && r.reasons.length) ? `<div class="clamp small">${esc((r.bucket === 'maybe' ? 'Maybe: ' + r.reasons.join('; ') + '. ' : '') + (r.notes || ''))}</div>` : ''}
    </div>
    <div class="ft"><span class="small">${esc(r.seller || '')}${r.seller_type ? ' · ' + esc(r.seller_type) : ''}<br>First seen ${esc(r.first_seen || '')}</span><a class="go" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">View listing</a></div>
  </article>`;
}
let VIEW = LS.get('view', 'cards');
function refreshList() {
  const ss = searchesFor(); const lr = listRows(ss);
  $('#nList').textContent = lr.length;
  const s = $('#sortSel').value; LS.set('sortSel', s);
  $('#cardView').hidden = VIEW !== 'cards'; $('#tableView').hidden = VIEW !== 'table';
  $('#viewCards').classList.toggle('on', VIEW === 'cards'); $('#viewTable').classList.toggle('on', VIEW === 'table');
  if (VIEW === 'cards') $('#cardView').innerHTML = lr.slice().sort((a, b) => { for (const f of SORTS[s]) { const x = f(a, b); if (x) return x; } return 0; }).map(cardHtml).join('') || '<p class="small">No listings match these filters.</p>';
  else { TABLES.list.render(lr); renderSortBar(); }
}
function renderAll() {
  renderTabs();
  const isNew = cur === '__new';
  $('#newSearch').hidden = !isNew; $('#board').hidden = isNew; $('#criteria').hidden = isNew;
  if (isNew) { history.replaceState(null, '', '#new'); renderPending(); return; }
  history.replaceState(null, '', '#search=' + encodeURIComponent(cur));
  const ss = searchesFor();
  $('#criteria').innerHTML = cur === '__all' ? `Showing every saved search together (${ss.length}).` : critText(ss[0].config);
  const showSearchCol = cur === '__all';
  ['list', 'ex', 'src'].forEach(id => { const t = TABLES[id]; t.order = t.order.filter(k => k !== 'search'); if (showSearchCol) t.order.unshift('search'); });
  renderCards(ss); buildSidebar(ss); refreshList();
  const cp = ss.flatMap(s => s.comps || []); TABLES.comps.render(cp); $('#nComps').textContent = cp.length;
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
    title_must_contain: list('title_must_contain').length ? list('title_must_contain').map(s => s.toLowerCase()) : [g('model').toLowerCase()], slugs: {},
    ...(g('trim_classes') ? { trim_classifier: { default: 'Unverified', hint: g('trim_hint') || 'check listing photos/window sticker',
      classes: g('trim_classes').split('\n').map(l => l.split(':')).filter(p => p.length > 1 && p[0].trim()).map(p => ({ name: p[0].trim(), keywords: p.slice(1).join(':').split(',').map(s => s.trim().toLowerCase()).filter(Boolean) })) } } : {}) };
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
// ---------------- New search (submits a request to the owner's webhook) ----------------
const TC = Object.assign({ SUBMIT_EMAIL: 'borealsauce-t0vm8s+carsearch@mail.grokbot.com', RESULTS_ETA: '~30-60 min' }, window.TRACKER_CONFIG || {});
let REQS = [];
const kwList = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 20);
function nsPayload() {
  const f = new FormData($('#nsForm')); const g = k => String(f.get(k) || '').trim(); const n = k => g(k) === '' ? null : Number(g(k));
  const make = g('make'), model = g('model'), ymin = n('year_min'), ymax = n('year_max');
  const yrs = ymin && ymax ? ' ' + (ymin === ymax ? ymin : `${ymin}-${ymax}`) : ymin ? ` ${ymin}+` : ymax ? ` up to ${ymax}` : '';
  const auto = `${make} ${model}${yrs}${n('max_miles') ? ` under ${Math.round(n('max_miles') / 1000)}K mi` : ''}${n('max_price') ? ` under $${Math.round(n('max_price') / 1000)}K` : ''}`.trim();
  const search = { name: g('name') || auto, make, model, year_min: ymin, year_max: ymax, min_price: n('min_price'), max_price: n('max_price'),
    max_miles: n('max_miles'), drivetrain_allow: f.getAll('drivetrain_allow'), include_keywords: kwList(g('include_keywords')),
    exclude_keywords: kwList(g('exclude_keywords')).map(s => s.toLowerCase()), radius: n('radius') || 0 };
  if (g('trim_classes')) search.trim_classifier = { default: 'Unverified', hint: 'check listing photos / window sticker',
    classes: g('trim_classes').split('\n').map(l => l.split(':')).filter(p => p.length > 1 && p[0].trim()).slice(0, 8)
      .map(p => ({ name: p[0].trim().slice(0, 40), keywords: kwList(p.slice(1).join(':')).map(s => s.toLowerCase()) })) };
  const rid = 'req-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '-' + Math.random().toString(36).slice(2, 8);
  return { type: 'car_search_request', version: 1, request_id: rid, submitted_at: new Date().toISOString(),
    requester: g('requester'), access_code: g('access_code'), search, page: location.origin + location.pathname };
}
function renderPending() {
  const mine = LS.get('myRequests', []); const srv = {}; REQS.forEach(r => srv[r.request_id] = r);
  const ids = new Set(DATA.searches.map(s => s.config.id));
  const rows = mine.map(m => Object.assign({}, m, srv[m.request_id] || {}))
    .concat(REQS.filter(r => !mine.some(m => m.request_id === r.request_id) && ['queued', 'running'].includes(r.status)));
  const lbl = { sent: `Sent - results usually appear within ${TC.RESULTS_ETA}`, submitted: 'Submitted, waiting for pickup', queued: 'Queued', running: 'Searching sites now', done: 'Done', rejected: 'Rejected', error: 'Error' };
  $('#nsPending').innerHTML = rows.length ? rows.slice().reverse().map(r => {
    const done = r.status === 'done' && r.search_id && ids.has(r.search_id);
    return `<div class="pend"><b>${esc(r.name)}</b><div class="small">${esc(lbl[r.status] || r.status || 'Submitted')} · ${esc(new Date(r.submitted_at).toLocaleString())}</div>
      ${r.message ? `<div class="small">${esc(r.message)}</div>` : ''}${done ? `<button class="btn ghost sm" data-go="${esc(r.search_id)}">View results</button>` : ''}</div>`;
  }).join('') : '<span class="small">None yet.</span>';
  $('#nsPending').querySelectorAll('[data-go]').forEach(b => b.onclick = () => { cur = b.dataset.go; LS.set('tab', cur); renderAll(); window.scrollTo(0, 0); });
}
function nsMsg(html, kind) { const m = $('#nsMsg'); m.hidden = false; m.className = 'ns-msg ' + (kind || ''); m.innerHTML = html; }
function nsSubmit(e) {
  e.preventDefault();
  const p = nsPayload(); const S = p.search;
  if (S.year_min && S.year_max && S.year_min > S.year_max) return nsMsg('"Year from" is after "Year to".', 'bad');
  if (S.min_price && S.max_price && S.min_price > S.max_price) return nsMsg('Min price is above max price.', 'bad');
  const json = JSON.stringify(p);
  const subject = 'Car search request: ' + S.name;
  const body = 'Just press Send.\n\n' + json + '\n';
  const href = `mailto:${TC.SUBMIT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const mine = LS.get('myRequests', []); mine.push({ request_id: p.request_id, name: S.name, submitted_at: p.submitted_at, status: 'sent' });
  LS.set('myRequests', mine.slice(-20));
  nsMsg(`<b>Your email app should open with the request filled in. Just press Send.</b> Results usually appear within ${esc(TC.RESULTS_ETA)} as a new tab called “${esc(S.name)}”.
    <div class="fallback">Email app didn't open? Send this to <b><span id="nsAddr">${esc(TC.SUBMIT_EMAIL)}</span></b> <button type="button" class="btn ghost sm" id="nsCopyAddr">Copy address</button>
    with the subject <code>${esc(subject)}</code> and the request below as the message:
    <div class="ns-actions"><button type="button" class="btn sm" id="nsCopy">Copy request</button> <a class="btn ghost sm" href="${esc(href)}">Open email again</a></div>
    <pre class="cfg" id="nsJson">${esc(json)}</pre></div>`, 'good');
  const copy = (txt, btn, lbl) => { (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => { btn.textContent = 'Copied'; setTimeout(() => btn.textContent = lbl, 1500); })
    .catch(() => { const r = document.createRange(); r.selectNodeContents($('#nsJson')); getSelection().removeAllRanges(); getSelection().addRange(r); }); };
  $('#nsCopy').onclick = () => copy(json, $('#nsCopy'), 'Copy request');
  $('#nsCopyAddr').onclick = () => copy(TC.SUBMIT_EMAIL, $('#nsCopyAddr'), 'Copy address');
  renderPending();
  window.location.href = href;
}
function wireNewSearch() {
  document.querySelectorAll('.eta').forEach(x => x.textContent = TC.RESULTS_ETA);
  $('#nsForm').addEventListener('submit', nsSubmit);
  $('#nsForm').addEventListener('reset', () => { $('#nsMsg').hidden = true; });
  const rq = LS.get('requester', ''); if (rq) $('#nsForm').requester.value = rq;
  $('#nsForm').requester.addEventListener('change', e => LS.set('requester', e.target.value));
}
async function init() {
  const v = Date.now();
  [DATA, CFG] = await Promise.all([fetch('data/data.json?v=' + v).then(r => r.json()), fetch('data/searches.json?v=' + v).then(r => r.json())]);
  REQS = await fetch('data/requests.json?v=' + v).then(r => r.ok ? r.json() : []).catch(() => []);
  const hm = location.hash.match(/^#(?:new|search=(.+))$/); if (hm) cur = hm[1] ? decodeURIComponent(hm[1]) : '__new';
  else if (cur == null) cur = '__new';
  $('#asof').textContent = `Last refresh ${DATA.generated} · distances from ${DATA.home}`;
  makeTable('list', $('#tList'), LIST_COLS); makeTable('ex', $('#tEx'), EX_COLS); makeTable('src', $('#tSrc'), SRC_COLS); makeTable('comps', $('#tComps'), COMP_COLS);
  $('#sortSel').value = LS.get('sortSel', 'price_asc');
  $('#sortSel').onchange = () => { TABLES.list.sorts = SORT_TO_TABLE[$('#sortSel').value].slice(); TABLES.list.saveSort(); refreshList(); };
  $('#viewCards').onclick = () => { VIEW = 'cards'; LS.set('view', VIEW); refreshList(); };
  $('#viewTable').onclick = () => { VIEW = 'table'; LS.set('view', VIEW); refreshList(); };
  $('#clearFilters').onclick = () => { FILT = {}; LS.set('filters', FILT); ['showMaybe'].forEach(i => $('#' + i).checked = true); ['newOnly', 'dropOnly', 'cleanOnly', 'hideUnverified'].forEach(i => $('#' + i).checked = false); $('#q').value = ''; buildSidebar(searchesFor()); refreshList(); };
  if (!LS.get('sort.list', null)) { TABLES.list.sorts = [{ k: 'price', dir: 'asc' }]; }
  ['q', 'showMaybe', 'newOnly', 'hideUnverified', 'cleanOnly', 'dropOnly'].forEach(id => $('#' + id).addEventListener('input', refreshList));
  $('#modeMulti').onclick = () => { sortMode = 'multi'; LS.set('sortMode', sortMode); renderSortBar(); };
  $('#modeSingle').onclick = () => { sortMode = 'single'; LS.set('sortMode', sortMode); Object.values(TABLES).forEach(t => { t.sorts = t.sorts.slice(0, 1); t.saveSort(); renderTable(t); }); renderSortBar(); };
  $('#clearSorts').onclick = () => { Object.values(TABLES).forEach(t => { t.sorts = []; t.saveSort(); renderTable(t); }); renderSortBar(); };
  $('#exportCsv').onclick = exportCsv;
  $('#resetLayout').onclick = () => { LS.del('layout'); LS.del('cards'); Object.keys(TABLES).forEach(id => LS.del('tbl.' + id)); location.reload(); };
  applyLayout(); wireBoxes(); wireForm(); wireNewSearch(); renderAll();
  setInterval(async () => { if (cur !== '__new') return; REQS = await fetch('data/requests.json?v=' + Date.now()).then(r => r.ok ? r.json() : REQS).catch(() => REQS); renderPending(); }, 60000);
}
init().catch(e => { document.body.insertAdjacentHTML('beforeend', `<p style="padding:20px;color:#f87171">Could not load data: ${esc(e.message)}</p>`); });
})();
