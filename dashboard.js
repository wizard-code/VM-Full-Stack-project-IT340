(() => {
    const API = '/api';   // proxy /api to the backend VM so cookies stay same-origin
    const $ = (id) => document.getElementById(id);
    const money = (n) => '$' + Number(n || 0).toFixed(2);
    let me = null, locations = [], items = [];

    // ---------- helpers ----------
    async function api(path, { method = 'GET', body } = {}) {
        const res = await fetch(API + path, {
            method,
            credentials: 'include',
            headers: body ? { 'Content-Type': 'application/json' } : {},
            body: body ? JSON.stringify(body) : undefined,
        });
        if (res.status === 401) { location.href = 'Loginpage.html'; throw new Error('Login required'); }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    }

    // Builds DOM with text nodes only (never innerHTML), so stored data can't inject scripts
    function el(tag, props = {}, ...kids) {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(props)) {
            if (k === 'class') n.className = v;
            else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
            else n.setAttribute(k, v);
        }
        for (const k of kids.flat()) n.append(k instanceof Node ? k : String(k));
        return n;
    }

    function say(text, isError = false) {
        const m = $('msg');
        m.textContent = text;
        m.className = 'msg' + (isError ? ' error' : '');
        m.hidden = !text;
    }
    const fail = (e) => say(e.message, true);

    // query string: managers filter by the location dropdown; employees are scoped by the server
    function q(extra) {
        const p = [];
        if (me.role === 'manager') p.push('location=' + encodeURIComponent($('loc').value));
        if (extra) p.push(extra);
        return p.length ? '?' + p.join('&') : '';
    }

    // ---------- charts (plain SVG, no library) ----------
    const NS = 'http://www.w3.org/2000/svg';
    function s(tag, attrs = {}, style = {}) {
        const n = document.createElementNS(NS, tag);
        for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
        Object.assign(n.style, style);
        return n;
    }
    const short = (t) => (t.length > 9 ? t.slice(0, 8) + '…' : t);

    function drawBars(host, data) {
        host.replaceChildren();
        if (!data.length) return host.append(el('p', { class: 'empty' }, 'No data yet.'));
        const W = 600, H = 240, L = 40, B = 36, T = 16;
        const max = Math.max(...data.map((d) => d.value), 1);
        const bw = (W - L) / data.length;
        const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': 'Bar chart' });
        svg.append(s('line', { x1: L, y1: H - B, x2: W, y2: H - B, class: 'axis' }));
        const top = s('text', { x: 0, y: T + 4 }); top.textContent = String(Math.round(max * 100) / 100);
        svg.append(top);
        data.forEach((d, i) => {
            const h = (d.value / max) * (H - B - T);
            const x = L + i * bw + bw * 0.15;
            const bar = s('rect', { x, y: H - B - h, width: bw * 0.7, height: h, rx: 3 },
                          { fill: d.warn ? '#B5513C' : 'var(--accent)' });
            bar.append(s('title')); bar.lastChild.textContent = `${d.label}: ${d.value}`;
            const lab = s('text', { x: x + bw * 0.35, y: H - B + 16, 'text-anchor': 'middle' });
            lab.textContent = short(d.label);
            svg.append(bar, lab);
        });
        host.append(svg);
    }

    function drawLine(host, data) {
        host.replaceChildren();
        if (!data.length) return host.append(el('p', { class: 'empty' }, 'No data yet.'));
        const W = 600, H = 240, L = 40, B = 36, T = 16;
        const max = Math.max(...data.map((d) => d.value), 1);
        const step = data.length > 1 ? (W - L - 20) / (data.length - 1) : 0;
        const pt = (d, i) => [L + 10 + i * step, H - B - (d.value / max) * (H - B - T)];
        const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': 'Line chart' });
        svg.append(s('line', { x1: L, y1: H - B, x2: W, y2: H - B, class: 'axis' }));
        const top = s('text', { x: 0, y: T + 4 }); top.textContent = String(Math.round(max * 100) / 100);
        svg.append(top);
        svg.append(s('polyline', { points: data.map((d, i) => pt(d, i).join(',')).join(' '), fill: 'none', 'stroke-width': 2.5 },
                     { stroke: 'var(--accent)' }));
        data.forEach((d, i) => {
            const [x, y] = pt(d, i);
            const c = s('circle', { cx: x, cy: y, r: 4 }, { fill: 'var(--accent)' });
            c.append(s('title')); c.lastChild.textContent = `${d.label}: ${d.value}`;
            svg.append(c);
            if (data.length <= 8 || i === 0 || i === data.length - 1) {
                const lab = s('text', { x, y: H - B + 16, 'text-anchor': 'middle' });
                lab.textContent = d.label;
                svg.append(lab);
            }
        });
        host.append(svg);
    }

    // ---------- loaders ----------
    async function loadStats() {
        const st = await api('/reports/stats' + q());
        $('sLow').textContent = st.lowStock;
        $('sPending').textContent = st.pending;
        $('sSales').textContent = money(st.sales30d);
        if (me.role === 'manager') $('sCosts').textContent = money(st.costs30d);
    }

    async function loadStock() {
        const rows = await api('/reports/stock' + q());
        drawBars($('stockChart'), rows.map((r) => ({ label: r.name, value: r.quantity, warn: r.quantity <= r.lowThreshold })));
    }

    async function loadSales() {
        const rows = await api('/reports/sales' + q('period=' + $('salesPeriod').value));
        drawLine($('salesChart'), rows.map((r) => ({ label: r.period, value: r.total })));
    }

    async function loadCosts() {
        if (me.role !== 'manager') return;
        const rows = await api('/reports/costs' + q('period=' + $('costPeriod').value));
        drawBars($('costChart'), rows.map((r) => ({ label: r.period, value: r.total })));
    }

    async function loadItems() {
        items = await api('/items' + q());
        const t = $('itemsTable');
        const mgr = me.role === 'manager';
        const num = (v, label) => el('input', { type: 'number', min: '0', step: 'any', value: v ?? '', 'aria-label': label, style: 'width:84px' });
        const head = ['Item', 'Type', 'Quantity', 'Low at', ...(mgr ? ['Cost / unit'] : []), 'Price', 'Status', ...(mgr ? [''] : [])];
        t.replaceChildren(
            el('thead', {}, el('tr', {}, head.map((h) => el('th', {}, h)))),
            el('tbody', {}, items.map((i) => {
                const low = mgr ? num(i.lowThreshold, 'Low-stock level') : null;
                const cost = mgr ? num(i.costPerUnit, 'Cost per unit') : null;
                const price = mgr && i.type === 'product' ? num(i.price, 'Price') : null;
                const save = async () => {
                    try {
                        await api('/items/' + i._id, { method: 'PATCH',
                            body: { lowThreshold: Number(low.value), costPerUnit: Number(cost.value), ...(price ? { price: Number(price.value) } : {}) } });
                        say('Saved.'); await refresh();
                    } catch (e) { fail(e); }
                };
                return el('tr', {},
                    el('td', {}, i.name),
                    el('td', {}, i.type === 'material' ? 'Raw material' : 'Product'),
                    el('td', {}, `${i.quantity} ${i.unit}`),
                    el('td', {}, mgr ? low : i.lowThreshold),
                    ...(mgr ? [el('td', {}, cost)] : []),
                    el('td', {}, mgr ? (price || '–') : (i.price != null ? money(i.price) : '–')),
                    el('td', { class: i.low ? 'low' : '' }, i.low ? 'Low stock' : 'OK'),
                    ...(mgr ? [el('td', {}, el('button', { type: 'button', class: 'ghost', onclick: save }, 'Save'))] : [])
                );
            }))
        );
        if (!items.length) t.append(el('caption', { class: 'empty' }, 'No items yet. Add one below.'));
        fillItemSelect();
    }

    function fillItemSelect() {
        // suggestions only; the person can type any name
        $('itemList').replaceChildren(...items.map((i) => el('option', { value: i.name })));
    }

    async function loadChanges() {
        const mgr = me.role === 'manager';
        $('changesTitle').textContent = mgr ? 'Changes (approvals)' : 'My submitted changes';
        const rows = await api('/changes' + q());
        const t = $('changesTable');
        const act = (id, what) => async () => {
            try { await api(`/changes/${id}/${what}`, { method: 'POST' }); say(what === 'approve' ? 'Approved and applied.' : 'Rejected.'); await refresh(); }
            catch (e) { fail(e); await refresh(); }
        };
        t.replaceChildren(
            el('thead', {}, el('tr', {}, ['Item', 'Type', 'Amount', 'By', 'Date', 'Status', ''].map((h) => el('th', {}, h)))),
            el('tbody', {}, rows.map((c) => el('tr', {},
                el('td', {}, c.itemName),
                el('td', {}, { sale: 'Sale', stock: 'Stock', item: 'New item' }[c.kind]),
                el('td', {}, c.kind === 'item' ? `${c.proposed.quantity} ${c.proposed.unit}`
                    : c.kind === 'sale' ? `−${c.qty}` : (c.delta > 0 ? `+${c.delta}` : c.delta)),
                el('td', {}, c.requestedByName),
                el('td', {}, new Date(c.createdAt).toLocaleDateString()),
                el('td', {}, c.status + (c.reason ? ` (${c.reason})` : '')),
                el('td', {}, mgr && c.status === 'pending'
                    ? [el('button', { type: 'button', onclick: act(c._id, 'approve') }, 'Approve'), ' ',
                       el('button', { type: 'button', class: 'ghost', onclick: act(c._id, 'reject') }, 'Reject')]
                    : '')
            )))
        );
        if (!rows.length) t.append(el('caption', { class: 'empty' }, 'Nothing here yet.'));
    }

    async function refresh() {
        await Promise.all([loadStats(), loadStock(), loadSales(), loadCosts(), loadItems(), loadChanges()]);
    }

    // ---------- entry rows ----------
    const MAX_ROWS = 25;
    const numOrUndef = (inp) => (inp.value === '' ? undefined : Number(inp.value));

    function dropRow(row, hostId, make) {
        row.remove();
        if (!$(hostId).children.length) $(hostId).append(make());
    }

    function changeRow() {
        const kind = el('select', { 'aria-label': 'Type' }, el('option', { value: 'stock' }, 'Stock change'), el('option', { value: 'sale' }, 'Sale'));
        const name = el('input', { type: 'text', list: 'itemList', autocomplete: 'off', maxlength: '60', placeholder: 'Item name', 'aria-label': 'Item name', class: 'grow' });
        const amount = el('input', { type: 'number', step: 'any', placeholder: '+ add / − remove', 'aria-label': 'Amount' });
        const note = el('input', { type: 'text', maxlength: '200', placeholder: 'Note (optional)', 'aria-label': 'Note', class: 'grow' });
        kind.addEventListener('change', () => { amount.placeholder = kind.value === 'sale' ? 'Qty sold' : '+ add / − remove'; });
        const row = el('div', { class: 'entry' }, kind, name, amount, note,
            el('button', { type: 'button', class: 'ghost', 'aria-label': 'Remove row', onclick: () => dropRow(row, 'changeRows', changeRow) }, 'Remove'));
        row._f = { kind, name, amount, note };
        return row;
    }

    function itemRow() {
        const name = el('input', { type: 'text', maxlength: '60', placeholder: 'Item name', 'aria-label': 'Item name', class: 'grow' });
        const type = el('select', { 'aria-label': 'Type' }, el('option', { value: 'material' }, 'Raw material'), el('option', { value: 'product' }, 'Product'));
        const unit = el('input', { type: 'text', maxlength: '20', placeholder: 'Unit (kg, pcs)', 'aria-label': 'Unit', style: 'width:110px' });
        const qty = el('input', { type: 'number', min: '0', step: 'any', placeholder: 'Start qty', 'aria-label': 'Starting quantity' });
        const cost = el('input', { type: 'number', min: '0', step: 'any', placeholder: 'Cost / unit', 'aria-label': 'Cost per unit' });
        const price = el('input', { type: 'number', min: '0', step: 'any', placeholder: 'Price', 'aria-label': 'Price' });
        price.disabled = true;
        type.addEventListener('change', () => { price.disabled = type.value !== 'product'; if (price.disabled) price.value = ''; });
        const row = el('div', { class: 'entry' }, name, type, unit, qty, cost, price,
            el('button', { type: 'button', class: 'ghost', 'aria-label': 'Remove row', onclick: () => dropRow(row, 'addRows', itemRow) }, 'Remove'));
        row._f = { name, type, unit, qty, cost, price };
        return row;
    }

    function addRow(hostId, make, btnId) {
        const host = $(hostId);
        if (host.children.length >= MAX_ROWS) return say(`Up to ${MAX_ROWS} rows at a time.`, true);
        host.append(make());
        host.lastChild._f.name.focus();
    }

    // Sends each row as its own request; rows that succeed are removed, failed rows stay with a reason
    async function submitRows(hostId, make, build) {
        const rows = [...$(hostId).children];
        let ok = 0, skipped = 0;
        const errs = [];
        for (let n = 0; n < rows.length; n++) {
            const row = rows[n];
            const built = build(row._f);
            if (built === null) { skipped++; continue; }          // blank row
            if (built.error) { errs.push(`Row ${n + 1}: ${built.error}`); continue; }
            try { await api('/changes', { method: 'POST', body: built.body }); ok++; row.remove(); }
            catch (e) { errs.push(`Row ${n + 1}: ${e.message}`); }
        }
        if (!$(hostId).children.length) $(hostId).append(make());
        if (!ok && !errs.length) return say('Nothing to submit. Fill in at least one row.', true);
        say([ok ? `${ok} submitted for manager approval.` : '', ...errs].filter(Boolean).join(' '), errs.length > 0);
        await Promise.all([loadChanges(), loadStats()]);
    }

    function buildChange(f) {
        const typed = f.name.value.trim();
        if (!typed && f.amount.value === '') return null;
        const kind = f.kind.value;
        const matches = items.filter((i) => i.name.toLowerCase() === typed.toLowerCase() && (kind !== 'sale' || i.type === 'product'));
        if (!matches.length) return { error: `no ${kind === 'sale' ? 'product' : 'item'} named "${typed}" (add it in "Add a new item")` };
        if (matches.length > 1) return { error: 'several locations have that item, pick one location first' };
        const n = Number(f.amount.value);
        if (f.amount.value === '' || !Number.isFinite(n) || n === 0) return { error: 'enter an amount' };
        const body = { kind, itemId: matches[0]._id, note: f.note.value };
        if (kind === 'stock') body.delta = n; else body.qty = n;
        return { body };
    }

    function buildItem(f) {
        const name = f.name.value.trim();
        if (!name && !f.unit.value.trim()) return null;
        if (!name) return { error: 'enter a name' };
        if (!f.unit.value.trim()) return { error: 'enter a unit' };
        if (me.role === 'manager' && $('loc').value === 'all') return { error: 'pick a specific location first' };
        const body = { kind: 'item', name, type: f.type.value, unit: f.unit.value,
                       quantity: numOrUndef(f.qty), costPerUnit: numOrUndef(f.cost) };
        if (f.type.value === 'product') body.price = numOrUndef(f.price);
        if (me.role === 'manager') body.locationId = $('loc').value;
        return { body };
    }

    // ---------- events ----------
    $('loc').addEventListener('change', () => refresh().catch(fail));
    $('salesPeriod').addEventListener('change', () => loadSales().catch(fail));
    $('costPeriod').addEventListener('change', () => loadCosts().catch(fail));
    $('addChangeRow').addEventListener('click', () => addRow('changeRows', changeRow));
    $('addItemRow').addEventListener('click', () => addRow('addRows', itemRow));
    $('changeForm').addEventListener('submit', (e) => { e.preventDefault(); submitRows('changeRows', changeRow, buildChange).catch(fail); });
    $('addForm').addEventListener('submit', (e) => { e.preventDefault(); submitRows('addRows', itemRow, buildItem).catch(fail); });
    $('changeRows').append(changeRow());
    $('addRows').append(itemRow());

    $('logout').addEventListener('click', async () => {
        try { await api('/auth/logout', { method: 'POST' }); } catch (_) { /* ignore */ }
        location.href = 'Loginpage.html';
    });

    // ---------- start ----------
    (async () => {
        try {
            me = await api('/auth/me');
            $('who').textContent = `${me.username} (${me.role})`;
            if (me.role === 'manager') {
                locations = await api('/locations');
                $('loc').replaceChildren(el('option', { value: 'all' }, 'All locations'),
                    ...locations.map((l) => el('option', { value: l._id }, l.name)));
                $('loc').hidden = false; $('locLabel').hidden = false;
                $('costCard').hidden = false; $('costPanel').hidden = false;
            } else if (!me.locationId) {
                say('No location assigned yet. Ask a manager to assign you one.', true);
            }
            await refresh();
        } catch (e) { fail(e); }
    })();
})();
