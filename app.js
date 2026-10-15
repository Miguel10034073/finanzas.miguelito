'use strict';

/* ================= Constantes y utilidades ================= */
const KEY = 'finanzas.local.v1';
const KEY_SNAP = 'finanzas.local.v1.snapshots';
const KEY_PREV = 'finanzas.local.v1.previo';
const KEY_TEMA = 'finanzas.local.tema';
const APP_ID = 'finanzas-local';
const CAT_PRESTAMO = 'Préstamo';
const TITULAR = 'Miguel'; // dueño de todo lo que no es préstamo
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const PALETA = ['#2f6fed','#e8762b','#16a34a','#c2362b','#7a4cc2','#0e9aa7','#d4a017','#db2777','#64748b','#8b5a2b','#4f46e5','#059669'];

const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const money = v => fmt.format(Math.round(v || 0));
const compact = v => { const a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + ' M' : a >= 1e3 ? Math.round(v / 1e3) + ' k' : String(Math.round(v)); };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = (arr, f = m => m.valor) => arr.reduce((a, m) => a + (Number(f(m)) || 0), 0);
const cap = s => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s ? s[0].toLocaleUpperCase('es') + s.slice(1) : s; };

function ymNow() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function hoyISO() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function addM(ym, k) { let [y, m] = ym.split('-').map(Number); m += k; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1; return y + '-' + String(m).padStart(2, '0'); }
function diffM(a, b) { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); }
function mesLabel(ym, largo) { if (!ym) return '—'; const [y, m] = ym.split('-'); return (largo ? MESES : MES_CORTO)[m - 1] + ' ' + y; }
function fechaLabel(iso) { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function rangoMeses(a, b) { const out = []; if (!a || !b || a > b) return out; for (let m = a; m <= b; m = addM(m, 1)) out.push(m); return out; }

function parseNum(s) {
  if (typeof s === 'number') return s;
  s = String(s ?? '').replace(/[^\d,.\-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');           // 2.400.000,0
  else if ((s.match(/\./g) || []).length > 1 || /^-?\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, ''); // 60.175
  return Number(s) || 0;
}
function parseMesTexto(s) {
  s = String(s || '').trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{2})/); if (m) return m[1] + '-' + m[2];
  m = s.match(/([a-záéíóú]+)\s+(?:de(?:l)?\s+)?(\d{4})/);
  if (!m) return '';
  let i = MESES.indexOf(m[1] === 'setiembre' ? 'septiembre' : m[1]);
  if (i < 0) i = MES_CORTO.indexOf(m[1].slice(0, 3));
  return i < 0 ? '' : m[2] + '-' + String(i + 1).padStart(2, '0');
}
function parseFecha(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
  return '';
}
function csvCell(v) { v = String(v ?? ''); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function descargar(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function toast(msg, tipo) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (tipo ? ' ' + tipo : ''); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 3200);
}

/* ================= Estado ================= */
function estadoVacio() {
  return { app: APP_ID, version: 2, movimientos: [], presupuestos: {}, tarjetas: [], hogar: null, meta: { ultimoRespaldo: null, cambios: 0, autoRespaldo: false, creado: new Date().toISOString() } };
}
function normalizarEstado(s) {
  return { ...estadoVacio(), ...s, movimientos: (s.movimientos || []).map(sanear), tarjetas: (s.tarjetas || []).map(sanearTarjeta), hogar: s.hogar ? sanearHogar(s.hogar) : null, meta: { ...estadoVacio().meta, ...s.meta } };
}
function cargar() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.movimientos)) return normalizarEstado(s);
  } catch (e) { /* estado corrupto o inaccesible */ }
  return estadoVacio();
}
let state = cargar();
function persistir() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('No se pudo guardar en el navegador: ' + e.message, 'error'); }
}
function commit(msg) { state.meta.cambios++; persistir(); renderAll(); if (msg) toast(msg); programarAuto(); }

// Puntos de restauración automáticos (uno por día, se guardan los últimos 7)
function snapshots() { try { return JSON.parse(localStorage.getItem(KEY_SNAP)) || []; } catch (e) { return []; } }
function snapshotDiario() {
  if (!state.movimientos.length) return;
  const snaps = snapshots(); const hoy = hoyISO();
  if (snaps.length && snaps[0].fecha === hoy) return;
  snaps.unshift({ fecha: hoy, n: state.movimientos.length, data: JSON.stringify(state) });
  try { localStorage.setItem(KEY_SNAP, JSON.stringify(snaps.slice(0, 7))); } catch (e) { /* sin espacio: se omite */ }
}

function sanear(m) {
  const cuotas = Math.max(1, parseInt(m.cuotas) || 1);
  return {
    id: String(m.id || uid()),
    nombre: String(m.nombre || 'Sin nombre').trim(),
    cuenta: String(m.cuenta || '').trim(),
    categoria: String(m.categoria || 'Sin categoría').trim(),
    persona: String(m.persona || '').trim(),
    fecha: parseFecha(m.fecha) || '',
    mes: parseMesTexto(m.mes) || (parseFecha(m.fecha) || '').slice(0, 7),
    monto: Math.abs(parseNum(m.monto)),
    cuotas,
    cuota: Math.min(cuotas, Math.max(1, parseInt(m.cuota) || 1)),
    valor: parseNum(m.valor),
    grupo: String(m.grupo || uid()),
    ok: !!m.ok,
    notas: String(m.notas || ''),
    // Préstamos: un solo movimiento (lo que pagaste) que ya implica la devolución esperada
    mesCobro: parseMesTexto(m.mesCobro) || '',
    recibido: Math.max(0, parseNum(m.recibido)),
    // Compras a cuotas con tarjeta: parte de la cuota que es interés y tasa mensual usada (%)
    interes: Math.max(0, parseNum(m.interes)),
    tasa: Math.max(0, Number(m.tasa) || 0),
  };
}
function sanearTarjeta(t) {
  const dia = v => Math.min(31, Math.max(1, parseInt(v) || 1));
  return {
    nombre: cap(t.nombre || ''), corte: dia(t.corte), pago: dia(t.pago), tasa: Math.max(0, Number(t.tasa) || 0), tipoTasa: t.tipoTasa === 'EA' ? 'EA' : 'MV',
    saldoBanco: Math.max(0, Number(t.saldoBanco) || 0), fechaSaldo: parseFecha(t.fechaSaldo) || '', // último saldo anotado de la página del banco
  };
}

/* ================= Cálculos ================= */
const esPrest = m => m.categoria === CAT_PRESTAMO;
const esPrestamo = m => esPrest(m) && m.valor < 0;                 // lo que pagaste por otra persona
const porCobrarDe = m => Math.max(0, Math.abs(m.valor) - m.recibido); // lo que falta que te devuelvan
const cobrada = m => porCobrarDe(m) < 1;
const movs = () => state.movimientos;
function mesesConDatos() { return [...new Set(movs().map(m => m.mes).filter(Boolean))].sort(); }
// Flujo del mes: lo que pagas sale en `mes`; la devolución de un préstamo entra en `mesCobro`.
function resumenMes(ym) {
  const L = movs().filter(m => m.mes === ym);
  const ing = sum(L.filter(m => !esPrest(m) && m.valor > 0));
  const gas = -sum(L.filter(m => !esPrest(m) && m.valor < 0));
  const pSal = -sum(L.filter(esPrestamo));
  const pRe = sum(movs().filter(m => esPrestamo(m) && m.mesCobro === ym), m => Math.abs(m.valor));
  return { ym, ing, gas, pSal, pRe, neto: ing - gas - pSal + pRe, n: L.length };
}

/* ================= Tarjetas de crédito ================= */
function tarjetas() { return state.tarjetas || (state.tarjetas = []); }
function tarjetaDe(cuenta) { const c = String(cuenta || '').trim().toLowerCase(); return tarjetas().find(t => t.nombre.toLowerCase() === c) || null; }
function diaEn(ym, d) { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(Math.min(d, new Date(y, m, 0).getDate())).padStart(2, '0')}`; }
// Compras antes del día de corte entran a ese extracto; desde el día de corte, al siguiente.
function cicloTarjeta(t, fechaISO) {
  const ymF = fechaISO.slice(0, 7), dia = +fechaISO.slice(8, 10);
  const ymCorte = dia < t.corte ? ymF : addM(ymF, 1);
  const ymPago = t.pago > t.corte ? ymCorte : addM(ymCorte, 1);
  return { corte: diaEn(ymCorte, t.corte), vence: diaEn(ymPago, t.pago), mes: ymPago };
}
function tasaMensual(tasa, tipo) { const r = (parseNum(tasa) || 0) / 100; return tipo === 'EA' ? Math.pow(1 + r, 1 / 12) - 1 : r; }
// Cuota fija (sistema francés), como la liquidan las tarjetas en Colombia
function amortizar(P, n, i) {
  if (n <= 1 || !i) return Array.from({ length: n }, (_, k) => ({ cuota: P / n, interes: 0, capital: P / n, saldo: P - P / n * (k + 1) }));
  const c = P * i / (1 - Math.pow(1 + i, -n));
  let saldo = P;
  return Array.from({ length: n }, () => { const int = saldo * i, capi = c - int; saldo -= capi; return { cuota: c, interes: int, capital: capi, saldo: Math.max(0, saldo) }; });
}
function pagosTarjeta(ym) {
  return tarjetas().map(t => ({ t, total: -sum(movs().filter(m => m.cuenta === t.nombre && m.mes === ym && m.valor < 0)), vence: diaEn(ym, t.pago) })).filter(p => p.total > 0);
}
function gastoPorCategoria(lista) {
  const map = new Map();
  lista.filter(m => !esPrest(m) && m.valor < 0).forEach(m => map.set(m.categoria, (map.get(m.categoria) || 0) - m.valor));
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}
function colorCat(cat) {
  const cats = [...new Set(movs().map(m => m.categoria))].sort();
  const i = cats.indexOf(cat);
  return PALETA[(i < 0 ? 0 : i) % PALETA.length];
}
function valores(campo) { return [...new Set(movs().map(m => m[campo]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')); }
function grupos() {
  const map = new Map();
  movs().forEach(m => { if (!map.has(m.grupo)) map.set(m.grupo, []); map.get(m.grupo).push(m); });
  return map;
}

/* ================= Gráficas ================= */
function chartMeses(datos) {
  if (!datos.length) return '<p class="muted">Sin datos.</p>';
  const W = 760, H = 250, L = 56, R = 10, T = 12, B = 30;
  const max = Math.max(1, ...datos.map(d => Math.max(d.ing, d.gas + d.pSal)));
  const min = Math.min(0, ...datos.map(d => d.neto));
  const y = v => T + (H - T - B) * (1 - (v - min) / (max - min));
  const gw = (W - L - R) / datos.length, bw = Math.min(22, gw * 0.32);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos, gastos y neto por mes">`;
  for (let i = 0; i <= 4; i++) {
    const v = min + (max - min) * i / 4, yy = y(v);
    s += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--border)"/>`;
    s += `<text x="${L - 6}" y="${yy + 4}" text-anchor="end">${compact(v)}</text>`;
  }
  const pts = [];
  datos.forEach((d, i) => {
    const cx = L + gw * i + gw / 2;
    const y0 = y(0);
    s += `<rect class="det" ${det(`Ingresos · ${mesLabel(d.ym, true)}`, Q.ing(d.ym))} x="${cx - bw - 1}" y="${y(d.ing)}" width="${bw}" height="${Math.max(0, y0 - y(d.ing))}" rx="3" fill="var(--pos)" opacity=".85"><title>${mesLabel(d.ym)} · Ingresos ${money(d.ing)} (clic para ver el detalle)</title></rect>`;
    s += `<rect class="det" ${det(`Gastos de ${TITULAR} · ${mesLabel(d.ym, true)}`, Q.gas(d.ym))} x="${cx + 1}" y="${y(d.gas)}" width="${bw}" height="${Math.max(0, y0 - y(d.gas))}" rx="3" fill="var(--neg)" opacity=".85"><title>${mesLabel(d.ym)} · Gastos de ${TITULAR} ${money(d.gas)} (clic para ver el detalle)</title></rect>`;
    if (d.pSal > 0) s += `<rect class="det" ${det(`Pagado por terceros · ${mesLabel(d.ym, true)}`, Q.pSal(d.ym))} x="${cx + 1}" y="${y(d.gas + d.pSal)}" width="${bw}" height="${Math.max(0, y(d.gas) - y(d.gas + d.pSal))}" rx="3" fill="var(--loan)" opacity=".7"><title>${mesLabel(d.ym)} · Pagado por terceros ${money(d.pSal)} (clic para ver el detalle)</title></rect>`;
    s += `<text x="${cx}" y="${H - 10}" text-anchor="middle">${MES_CORTO[+d.ym.slice(5) - 1]}${d.ym.slice(5) === '01' || i === 0 ? ' ' + d.ym.slice(2, 4) : ''}</text>`;
    pts.push([cx, y(d.neto), d]);
  });
  s += `<polyline fill="none" stroke="var(--accent)" stroke-width="2" points="${pts.map(p => p[0] + ',' + p[1]).join(' ')}"/>`;
  pts.forEach(([x, yy, d]) => { s += `<circle cx="${x}" cy="${yy}" r="3.5" fill="var(--accent)"><title>${mesLabel(d.ym)} · Neto ${money(d.neto)}</title></circle>`; });
  s += '</svg>';
  return `<div class="chart">${s}</div><div class="legend"><span><i style="background:var(--pos)"></i>Ingresos</span><span><i style="background:var(--neg)"></i>Gastos de ${TITULAR}</span><span><i style="background:var(--loan)"></i>Pagado por terceros</span><span><i style="background:var(--accent)"></i>Neto del mes</span></div>`;
}
function barrasCategorias(pares, presup = {}, sel = null) {
  if (!pares.length) return '<p class="muted">Sin gastos en este periodo.</p>';
  const clic = cat => sel ? `class="det" ${det(`${cat} · ${typeof sel === 'string' ? mesLabel(sel, true) : 'periodo'}`, Q.gas(sel, cat))}` : '';
  const max = Math.max(...pares.map(p => Math.max(p[1], presup[p[0]] || 0)));
  return pares.map(([cat, v]) => {
    const lim = presup[cat];
    const over = lim && v > lim;
    const hint = lim ? `<small class="${over ? 'neg' : ''}">${Math.round(v / lim * 100)}% de ${money(lim)}</small>` : '';
    return `<div class="catrow"><span class="name" title="${esc(cat)}">${esc(cat)}</span>
      <div class="bar ${over ? 'over' : ''}"><span style="width:${(v / max * 100).toFixed(1)}%;background:${colorCat(cat)}"></span></div>
      <span class="amt"><span ${clic(cat)}>${money(v)}</span>${hint}</span></div>`;
  }).join('');
}

/* ================= Render: Resumen ================= */
let mesSel = null;
function renderResumen() {
  const cont = $('#resumenBody');
  const sel = $('#mesSel');
  if (!movs().length) {
    sel.innerHTML = ''; $('#tab-resumen .toolbar').hidden = true;
    cont.innerHTML = `<div class="card empty"><h2>Aún no hay datos</h2>
      <p>Restaura tu última copia de seguridad (carpeta <code>Finanza/respaldos</code>) o empieza desde cero agregando tu primer movimiento.</p>
      <div class="btns">
        <button class="btn primary" data-act="importarJson">Restaurar copia de seguridad (.json)</button>
        <button class="btn ghost" data-act="nuevo">Agregar movimiento</button>
      </div>
      <div id="listaRespaldosVacio" style="max-width:520px;margin:20px auto 0;text-align:left"></div></div>`;
    pintarListaRespaldos('#listaRespaldosVacio');
    return;
  }
  $('#tab-resumen .toolbar').hidden = false;
  const meses = mesesConDatos(); const hoy = ymNow();
  if (!meses.includes(hoy)) meses.push(hoy), meses.sort();
  if (!mesSel || !meses.includes(mesSel)) mesSel = hoy;
  sel.innerHTML = meses.map(m => `<option value="${m}" ${m === mesSel ? 'selected' : ''}>${mesLabel(m, true)}${m === hoy ? ' (actual)' : ''}</option>`).join('');

  const r = resumenMes(mesSel);
  const tasa = r.ing ? (r.ing - r.gas) / r.ing : 0;
  const L = movs().filter(m => m.mes === mesSel);
  const serie = rangoMeses(addM(mesSel, -11), mesSel).map(m => resumenMes(m)).filter(d => d.n || d.ym >= meses[0]);

  // Próximos meses comprometidos
  const prox = [1, 2, 3].map(k => {
    const ym = addM(hoy, k), F = movs().filter(m => m.mes === ym);
    return { ym, sale: -sum(F.filter(m => m.valor < 0)), entra: sum(movs().filter(m => esPrestamo(m) && m.mesCobro === ym), porCobrarDe), tc: pagosTarjeta(ym) };
  });

  // Alertas
  const alertas = [];
  const sinCat = movs().filter(m => m.categoria === 'Sin categoría').length;
  if (sinCat) alertas.push(`${sinCat} movimiento(s) sin categoría.`);
  const sinPersona = movs().filter(m => esPrest(m) && !m.persona).length;
  if (sinPersona) alertas.push(`${sinPersona} movimiento(s) de préstamo sin persona asignada — asígnalos para que el saldo por persona sea exacto.`);
  const pendVencidos = movs().filter(m => esPrestamo(m) && !cobrada(m) && m.mesCobro < hoy);
  if (pendVencidos.length) alertas.push(`${pendVencidos.length} devolución(es) de préstamos de meses anteriores sin cobrar (${money(sum(pendVencidos, porCobrarDe))}). Revisa la pestaña Préstamos.`);
  if (state.hogar) {
    const H = hogar(), deben = H.personas.filter(p => p !== H.pagador)
      .map(p => [p, sum(H.facturas.filter(f => !partePagada(f, p)), f => parteDe(f, p))]).filter(([, v]) => v >= 1);
    if (deben.length) alertas.push(`Servicios del hogar por cobrar: ${deben.map(([p, v]) => `${p} ${money(v)}`).join(', ')}. Revisa la pestaña Servicios.`);
  }
  const sinTasa = tarjetas().filter(t => !t.tasa).map(t => t.nombre);
  if (sinTasa.length) alertas.push(`Falta la tasa de interés de: ${sinTasa.join(', ')}. Configúrala en Datos → Tarjetas de crédito.`);
  const incompletos = [...grupos().values()].filter(g => g[0].cuotas > 1 && g.length < g[0].cuotas && Math.max(...g.map(m => m.cuota)) < g[0].cuotas).length;
  if (incompletos) alertas.push(`${incompletos} compra(s) a cuotas con cuotas futuras sin registrar. Revisa “Cuotas y proyección”.`);

  cont.innerHTML = `
    <div class="grid-cards">
      <div class="card kpi"><div class="label">Ingresos</div><div class="value pos det" ${det(`Ingresos · ${mesLabel(mesSel, true)}`, Q.ing(mesSel))}>${money(r.ing)}</div><div class="hint">Sueldo y otros ingresos</div></div>
      <div class="card kpi"><div class="label">Gastos de ${TITULAR}</div><div class="value neg det" ${det(`Gastos de ${TITULAR} · ${mesLabel(mesSel, true)}`, Q.gas(mesSel))}>${money(r.gas)}</div><div class="hint">Sin contar préstamos a terceros</div></div>
      <div class="card kpi"><div class="label">Préstamos del mes</div><div class="value loan">${money(r.pSal - r.pRe)}</div><div class="hint">Pagaste <span class="det" ${det(`Pagado por terceros · ${mesLabel(mesSel, true)}`, Q.pSal(mesSel))}>${money(r.pSal)}</span> · te devuelven <span class="det" ${det(`Devoluciones esperadas · ${mesLabel(mesSel, true)}`, Q.pRe(mesSel))}>${money(r.pRe)}</span></div></div>
      <div class="card kpi"><div class="label">Queda libre</div><div class="value ${r.neto >= 0 ? 'pos' : 'neg'} det" ${det(`Queda libre · ${mesLabel(mesSel, true)}`, Q.neto(mesSel), 'Ingresos y devoluciones suman; gastos y lo pagado por terceros restan.')}>${money(r.neto)}</div><div class="hint">Ahorro sobre ingresos: ${(tasa * 100).toFixed(0)}%</div></div>
    </div>
    ${alertas.length ? `<div class="card" style="margin-bottom:18px"><h3>Pendientes por revisar</h3>${alertas.map(a => `<div class="alert">${esc(a)}</div>`).join('')}</div>` : ''}
    <div class="card" style="margin-bottom:18px"><div class="section-title"><h3>Últimos 12 meses</h3><small>Pasa el cursor sobre las barras para ver valores</small></div>${chartMeses(serie)}</div>
    <div class="two-col">
      <div class="card"><div class="section-title"><h3>Gasto por categoría · ${mesLabel(mesSel, true)}</h3><button class="btn ghost small" data-act="irPresupuestos">Presupuestos</button></div>
        ${barrasCategorias(gastoPorCategoria(L), state.presupuestos, mesSel)}</div>
      <div class="card"><h3>Lo que viene</h3>
        <ul class="list-plain">${prox.map(p => `<li><span>${mesLabel(p.ym, true)}${p.tc.map(x => `<br><small class="muted">${esc(x.t.nombre)}: <span class="det" ${det(`${x.t.nombre} · pago de ${mesLabel(p.ym, true)}`, Q.tc(x.t.nombre, p.ym), `Vence el ${fechaLabel(x.vence)}`)}>${money(x.total)}</span> · vence ${fechaLabel(x.vence)}</small>`).join('')}</span><span style="text-align:right"><span class="neg det" ${det(`Salidas registradas · ${mesLabel(p.ym, true)}`, Q.sale(p.ym))}>−${money(p.sale)}</span>${p.entra ? `<br><span class="loan det" ${det(`Devoluciones por cobrar · ${mesLabel(p.ym, true)}`, Q.porCobrar(p.ym))}>+${money(p.entra)} devoluciones</span>` : ''}</span></li>`).join('')}</ul>
        <p class="muted" style="font-size:12.5px;margin:10px 0 0">Cuotas y pagos ya registrados, con la fecha límite de cada tarjeta.</p>
        <h3 style="margin-top:18px">Movimientos más grandes del mes</h3>
        <ul class="list-plain">${L.filter(m => m.valor < 0).sort((a, b) => a.valor - b.valor).slice(0, 5).map(m => `<li><span>${esc(m.nombre)} ${m.cuotas > 1 ? `<small>(${m.cuota}/${m.cuotas})</small>` : ''}</span><span class="neg">${money(m.valor)}</span></li>`).join('') || '<li class="muted">Sin gastos</li>'}</ul>
      </div>
    </div>`;
}

/* ================= Render: Movimientos ================= */
const filtros = { texto: '', desde: '', hasta: '', categoria: '', cuenta: '', persona: '', signo: '', pend: false };
let orden = { campo: 'mes', dir: -1 };
const seleccion = new Set();
function movsFiltrados() {
  const t = filtros.texto.toLowerCase(), hoy = ymNow();
  return movs().filter(m =>
    (!t || m.nombre.toLowerCase().includes(t) || m.notas.toLowerCase().includes(t)) &&
    (!filtros.desde || m.mes >= filtros.desde) && (!filtros.hasta || m.mes <= filtros.hasta) &&
    (!filtros.categoria || m.categoria === filtros.categoria) && (!filtros.cuenta || m.cuenta === filtros.cuenta) &&
    (!filtros.persona || (filtros.persona === '__sin' ? esPrest(m) && !m.persona : filtros.persona === '__propio' ? !esPrest(m) : esPrest(m) && m.persona === filtros.persona)) &&
    (!filtros.signo || (filtros.signo === 'gasto' ? m.valor < 0 : m.valor > 0)) &&
    (!filtros.pend || m.mes > hoy));
}
function llenarSelect(sel, vals, primero, extra = '') {
  const actual = sel.value;
  sel.innerHTML = `<option value="">${primero}</option>` + extra + vals.map(v => `<option>${esc(v)}</option>`).join('');
  sel.value = actual;
}
function renderMovimientos() {
  llenarSelect($('#fCategoria'), valores('categoria'), 'Todas las categorías');
  llenarSelect($('#fCuenta'), valores('cuenta'), 'Todas las cuentas');
  llenarSelect($('#fPersona'), valores('persona'), 'Todas las personas', `<option value="__propio">${TITULAR} (gastos propios)</option><option value="__sin">Préstamos sin persona</option>`);
  const hoy = ymNow();
  const L = movsFiltrados().sort((a, b) => {
    const A = a[orden.campo], B = b[orden.campo];
    const c = typeof A === 'number' ? A - B : String(A).localeCompare(String(B), 'es');
    return (c || a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre)) * orden.dir;
  });
  [...seleccion].forEach(id => { if (!movs().some(m => m.id === id)) seleccion.delete(id); });
  const cols = [['mes', 'Mes pago'], ['fecha', 'Fecha'], ['nombre', 'Nombre'], ['cuota', 'Cuota'], ['categoria', 'Categoría'], ['cuenta', 'Cuenta'], ['persona', 'Persona'], ['valor', 'Valor', 'num']];
  const th = cols.map(([k, t, c]) => `<th class="sortable ${c || ''}" data-sort="${k}">${t}${orden.campo === k ? (orden.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('');
  const MAX = 600;
  const rows = L.slice(0, MAX).map(m => {
    let estado = '';
    if (esPrestamo(m)) estado = cobrada(m) ? '<span class="tag ok">cobrado</span>' : `<span class="tag pend">por cobrar · ${mesLabel(m.mesCobro)}</span>`;
    if (m.interes) estado += ` <small class="muted" title="Intereses de esta cuota">int. ${money(m.interes)}</small>`;
    return `<tr class="${m.mes > hoy ? 'futuro' : ''}" data-id="${m.id}">
      <td><input type="checkbox" data-sel="${m.id}" ${seleccion.has(m.id) ? 'checked' : ''}></td>
      <td>${mesLabel(m.mes)}</td><td>${fechaLabel(m.fecha)}</td>
      <td class="nombre">${esc(m.nombre)} ${estado}${m.notas ? ` <small title="${esc(m.notas)}">📝</small>` : ''}</td>
      <td>${m.cuotas > 1 ? m.cuota + '/' + m.cuotas : ''}</td>
      <td><span class="tag dot" style="--c:${colorCat(m.categoria)}">${esc(m.categoria)}</span></td>
      <td>${esc(m.cuenta)}</td><td>${esPrest(m) ? esc(m.persona) || '<span class="neg">sin asignar</span>' : `<span class="muted">${TITULAR}</span>`}</td>
      <td class="num ${m.valor < 0 ? 'neg' : 'pos'}">${money(m.valor)}</td>
      <td><div class="acts"><button data-edit="${m.id}" title="Editar">✎</button><button data-rep="${m.id}" title="Repetir el próximo mes">⟳</button><button data-del="${m.id}" title="Eliminar">✕</button></div></td></tr>`;
  }).join('');
  const todos = L.length && L.slice(0, MAX).every(m => seleccion.has(m.id));
  $('#tablaMovs').innerHTML = `<thead><tr><th><input type="checkbox" id="selTodos" ${todos ? 'checked' : ''}></th>${th}<th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="10" class="muted" style="text-align:center;padding:30px">No hay movimientos con estos filtros.</td></tr>'}</tbody>
    <tfoot><tr><td></td><td colspan="7">${L.length} movimiento(s)${L.length > MAX ? ` · mostrando ${MAX}` : ''} · Ingresos <span class="pos">${money(sum(L.filter(m => m.valor > 0)))}</span> · Gastos <span class="neg">${money(sum(L.filter(m => m.valor < 0)))}</span></td><td class="num">${money(sum(L))}</td><td></td></tr></tfoot>`;
  $('#bulk').hidden = !seleccion.size;
  $('#bulkCount').textContent = `${seleccion.size} seleccionado(s)`;
}

/* ================= Render: Deudas ================= */
// Una obligación es cualquier salida (valor < 0) cuya fecha límite de pago todavía no ha pasado.
// Con tarjeta, la fecha límite es su día de pago en el mes de la cuota; sin tarjeta, el último día del mes.
function venceDe(m) { const t = tarjetaDe(m.cuenta); return diaEn(m.mes, t ? t.pago : 31); }
const pendientePago = m => m.valor < 0 && venceDe(m) >= hoyISO();

function resumenObligaciones(filtro) {
  const L = movs().filter(m => pendientePago(m) && filtro(m));
  const porGrupo = new Map();
  L.forEach(m => { if (!porGrupo.has(m.grupo)) porGrupo.set(m.grupo, []); porGrupo.get(m.grupo).push(m); });
  const compras = [...porGrupo.values()].map(rows => {
    rows.sort((a, b) => a.mes.localeCompare(b.mes) || a.cuota - b.cuota);
    const saldo = -sum(rows), interes = sum(rows, m => m.interes), b = rows[0];
    return {
      rows, b, nombre: b.nombre, cuenta: b.cuenta, categoria: b.categoria, persona: b.persona, cuotas: b.cuotas,
      restantes: rows.length, desde: rows[0].cuota, hasta: rows[rows.length - 1].cuota,
      proximo: rows[0], ultimo: rows[rows.length - 1], saldo, interes, capital: saldo - interes, valorCuota: Math.abs(rows[0].valor),
    };
  }).sort((a, b) => b.saldo - a.saldo);
  const cuentas = [...new Set(L.map(m => m.cuenta))].map(c => {
    const R = L.filter(m => m.cuenta === c).sort((a, b) => a.mes.localeCompare(b.mes));
    const prox = R[0];
    return {
      cuenta: c, rows: R, total: -sum(R), interes: sum(R, m => m.interes), compras: new Set(R.map(m => m.grupo)).size,
      proxMes: prox?.mes, proxVence: prox ? venceDe(prox) : '', proxValor: prox ? -sum(R.filter(m => m.mes === prox.mes)) : 0, ultimo: R[R.length - 1]?.mes,
    };
  }).sort((a, b) => b.total - a.total);
  const meses = [...new Set(L.map(m => m.mes))].sort().map(ym => ({ ym, rows: L.filter(m => m.mes === ym), total: -sum(L.filter(m => m.mes === ym)) }));
  return { L, compras, cuentas, meses, total: -sum(L), interes: sum(L, m => m.interes) };
}

function renderDeudas() {
  const hoy = hoyISO();
  const propias = resumenObligaciones(m => !esPrest(m));
  const prest = resumenObligaciones(esPrestamo);
  // Lo que te deben: todas las cuotas de préstamos aún no cobradas (incluidas las ya pagadas a la tarjeta)
  const porCobrarL = movs().filter(m => esPrestamo(m) && !cobrada(m));
  const porCobrar = sum(porCobrarL, porCobrarDe);
  const personas = [...new Set([...prest.L, ...porCobrarL].map(m => m.persona || ''))].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b, 'es'));
  const detProp = (titulo, rows, sub) => det(titulo, itemsDe(() => rows, m => -m.valor), sub);
  const nombreP = p => p ? esc(p) : '<span class="muted">Sin asignar</span>';

  const tablaCuentas = r => `<div class="table-wrap"><table class="grid"><thead><tr><th>Cuenta / tarjeta</th><th class="num">Compras</th><th>Próximo pago</th><th class="num">Capital</th><th class="num">Intereses</th><th class="num">Total por pagar</th><th>Hasta</th></tr></thead>
    <tbody>${r.cuentas.map(c => `<tr>
      <td><b>${esc(c.cuenta || '—')}</b></td><td class="num">${c.compras}</td>
      <td>${c.proxMes ? `<span class="det" ${detProp(`${c.cuenta} · pago de ${mesLabel(c.proxMes, true)}`, c.rows.filter(m => m.mes === c.proxMes), `Vence el ${fechaLabel(c.proxVence)}`)}>${money(c.proxValor)}</span> <small class="muted">vence ${fechaLabel(c.proxVence)}</small>` : '—'}</td>
      <td class="num">${money(c.total - c.interes)}</td><td class="num">${c.interes >= 1 ? money(c.interes) : '<span class="muted">—</span>'}</td>
      <td class="num neg"><b class="det" ${detProp(`${c.cuenta} · total por pagar`, c.rows)}>${money(c.total)}</b></td><td>${mesLabel(c.ultimo)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted" style="text-align:center;padding:20px">Sin obligaciones pendientes.</td></tr>'}</tbody>
    <tfoot><tr><td>Total</td><td class="num">${r.compras.length}</td><td></td><td class="num">${money(r.total - r.interes)}</td><td class="num">${r.interes >= 1 ? money(r.interes) : ''}</td><td class="num"><span class="det" ${detProp('Total por pagar', r.L)}>${money(r.total)}</span></td><td></td></tr></tfoot></table></div>`;

  const tablaCompras = (r, conPersona) => `<div class="table-wrap"><table class="grid"><thead><tr><th>Compra</th>${conPersona ? '<th>Persona</th>' : '<th>Categoría</th>'}<th>Cuenta</th><th>Cuotas pendientes</th><th class="num">Valor cuota</th><th>Próxima</th><th>Termina</th><th class="num">Saldo</th></tr></thead>
    <tbody>${r.compras.map(c => `<tr>
      <td class="nombre"><span class="det" ${detProp(`${c.nombre} · cuotas por pagar`, c.rows)}>${esc(c.nombre)}</span><br><small class="muted">${c.b.fecha ? fechaLabel(c.b.fecha) : mesLabel(c.b.mes)}${c.b.monto ? ` · compra de ${money(c.b.monto)}` : ''}</small></td>
      <td>${conPersona ? nombreP(c.persona) : `<span class="tag dot" style="--c:${colorCat(c.categoria)}">${esc(c.categoria)}</span>`}</td>
      <td>${esc(c.cuenta)}</td>
      <td>${c.cuotas > 1 ? `${c.restantes} de ${c.cuotas} <small class="muted">(${c.desde === c.hasta ? c.desde : `${c.desde} a ${c.hasta}`})</small>` : '<span class="muted">pago único</span>'}</td>
      <td class="num">${money(c.valorCuota)}</td><td>${mesLabel(c.proximo.mes)} <small class="muted">${fechaLabel(venceDe(c.proximo))}</small></td><td>${mesLabel(c.ultimo.mes)}</td>
      <td class="num neg"><b>${money(c.saldo)}</b>${c.interes >= 1 ? `<br><small class="muted">int. ${money(c.interes)}</small>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted" style="text-align:center;padding:20px">Nada pendiente.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="7">${r.compras.length} compra(s)</td><td class="num">${money(r.total)}</td></tr></tfoot></table></div>`;

  const calendario = r => {
    const max = Math.max(1, ...r.meses.map(x => x.total));
    return r.meses.map(x => `<div class="catrow"><span class="name">${mesLabel(x.ym, true)}</span>
      <div class="bar"><span style="width:${(x.total / max * 100).toFixed(1)}%;background:var(--neg)"></span></div>
      <span class="amt"><span class="det" ${detProp(`Pagos de ${mesLabel(x.ym, true)}`, x.rows)}>${money(x.total)}</span></span></div>`).join('') || '<p class="muted">Sin pagos pendientes.</p>';
  };

  const filasPersona = personas.map(p => {
    const debo = prest.L.filter(m => (m.persona || '') === p), cobra = porCobrarL.filter(m => (m.persona || '') === p);
    const vencido = cobra.filter(m => m.mesCobro < ymNow());
    const prox = cobra.filter(m => m.mesCobro >= ymNow()).sort((a, b) => a.mesCobro.localeCompare(b.mesCobro))[0];
    const dDebo = -sum(debo), dCobra = sum(cobra, porCobrarDe);
    return `<tr><td><b>${nombreP(p)}</b></td>
      <td class="num neg">${dDebo ? `<span class="det" ${detProp(`Préstamos de ${p || 'sin asignar'} · lo que debes a la tarjeta`, debo)}>${money(dDebo)}</span>` : '<span class="muted">—</span>'}</td>
      <td class="num loan">${dCobra ? `<span class="det" ${det(`Préstamos de ${p || 'sin asignar'} · por cobrar`, itemsDe(() => cobra, porCobrarDe))}>${money(dCobra)}</span>` : '<span class="muted">—</span>'}</td>
      <td class="num ${vencido.length ? 'neg' : 'muted'}">${vencido.length ? `<span class="det" ${det(`Préstamos de ${p || 'sin asignar'} · vencido`, itemsDe(() => vencido, porCobrarDe))}>${money(sum(vencido, porCobrarDe))}</span>` : '—'}</td>
      <td>${prox ? `${mesLabel(prox.mesCobro)} · ${money(porCobrarDe(prox))}` : '—'}</td>
      <td class="num ${dCobra - dDebo >= 0 ? 'pos' : 'neg'}">${money(dCobra - dDebo)}</td></tr>`;
  }).join('');

  const totalOblig = propias.total + prest.total;
  $('#deudasBody').innerHTML = `
    <div class="grid-cards">
      <div class="card kpi destacado"><div class="label">Lo que debo (sin préstamos)</div><div class="value neg det" ${detProp('Lo que debo (sin préstamos)', propias.L, 'Todas tus obligaciones propias con fecha de pago desde hoy')}>${money(propias.total)}</div><div class="hint">${propias.compras.length} compra(s) en ${propias.cuentas.length} cuenta(s)${propias.interes >= 1 ? ` · incluye ${money(propias.interes)} de intereses` : ''}</div></div>
      <div class="card kpi"><div class="label">Deuda por préstamos a terceros</div><div class="value loan det" ${detProp('Deuda por préstamos a terceros', prest.L, 'Lo que aún debes pagar a la tarjeta por compras hechas para otras personas')}>${money(prest.total)}</div><div class="hint">${prest.compras.length} préstamo(s) con cuotas por pagar</div></div>
      <div class="card kpi"><div class="label">Total de obligaciones</div><div class="value neg det" ${detProp('Total de obligaciones', [...propias.L, ...prest.L])}>${money(totalOblig)}</div><div class="hint">Propias + préstamos</div></div>
      <div class="card kpi"><div class="label">Te deben por préstamos</div><div class="value pos det" ${det('Te deben por préstamos', itemsDe(() => porCobrarL, porCobrarDe))}>${money(porCobrar)}</div><div class="hint">Neto préstamos: <b class="${porCobrar - prest.total >= 0 ? 'pos' : 'neg'}">${money(porCobrar - prest.total)}</b></div></div>
    </div>
    <p class="muted" style="font-size:12.5px;margin:-6px 0 18px">Cuenta como pendiente toda cuota cuya fecha límite es hoy (${fechaLabel(hoy)}) o después. En tarjetas se usa su día de pago; en otras cuentas, el fin de mes.</p>

    <div class="card" style="margin-bottom:18px">
      <div class="section-title"><h3>Mis obligaciones (sin préstamos)</h3><b class="neg">${money(propias.total)}</b></div>
      <h4 class="sub">Por cuenta</h4>
      ${tablaCuentas(propias)}
      <div class="two-col" style="margin:18px 0 0">
        <div><h4 class="sub">Cuándo se paga</h4>${calendario(propias)}</div>
        <div><h4 class="sub">Por categoría</h4>${barrasCategorias(gastoPorCategoria(propias.L))}</div>
      </div>
      <h4 class="sub" style="margin-top:18px">Detalle por compra</h4>
      ${tablaCompras(propias, false)}
    </div>

    <div class="card">
      <div class="section-title"><h3>Préstamos a terceros</h3><span><b class="loan">${money(prest.total)}</b> <small class="muted">por pagar</small> · <b class="pos">${money(porCobrar)}</b> <small class="muted">por cobrar</small></span></div>
      <h4 class="sub">Por persona</h4>
      <div class="table-wrap"><table class="grid"><thead><tr><th>Persona</th><th class="num">Debes a la tarjeta</th><th class="num">Te debe</th><th class="num">Vencido</th><th>Próximo cobro</th><th class="num">Neto</th></tr></thead>
        <tbody>${filasPersona || '<tr><td colspan="6" class="muted" style="text-align:center;padding:20px">Sin préstamos pendientes.</td></tr>'}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${money(prest.total)}</td><td class="num">${money(porCobrar)}</td><td></td><td></td><td class="num">${money(porCobrar - prest.total)}</td></tr></tfoot></table></div>
      <p class="muted" style="font-size:12.5px">“Te debe” incluye cuotas que ya pagaste a la tarjeta pero la persona aún no te ha devuelto; por eso puede ser mayor que lo que debes a la tarjeta.</p>
      <h4 class="sub" style="margin-top:18px">Por cuenta</h4>
      ${tablaCuentas(prest)}
      <h4 class="sub" style="margin-top:18px">Detalle por préstamo</h4>
      ${tablaCompras(prest, true)}
    </div>`;
}

/* ================= Render: Cuotas ================= */
function infoGrupos() {
  const hoy = ymNow();
  return [...grupos().values()].filter(g => g[0].cuotas > 1).map(g => {
    g.sort((a, b) => a.cuota - b.cuota || a.mes.localeCompare(b.mes));
    const N = g[0].cuotas, maxC = Math.max(...g.map(m => m.cuota));
    const pagadas = g.filter(m => m.mes <= hoy);
    const pend = g.filter(m => m.mes > hoy);
    return {
      id: g[0].grupo, g, nombre: g[0].nombre, cuenta: g[0].cuenta, categoria: g[0].categoria, persona: g[0].persona,
      signo: Math.sign(g[0].valor), N, valorCuota: Math.abs(g[g.length - 1].valor), monto: g[0].monto, tasa: g[0].tasa,
      interes: sum(g, m => m.interes), interesPend: sum(pend, m => m.interes),
      ultimaCuotaPagada: pagadas.length ? Math.max(...pagadas.map(m => m.cuota)) : 0,
      saldo: Math.abs(sum(pend)), fin: g[g.length - 1].mes, sig: pend[0]?.mes || '',
      faltanFuturas: N - maxC, activa: g.some(m => m.mes >= hoy) || maxC < N,
    };
  });
}
function renderCuotas() {
  const hoy = ymNow();
  const G = infoGrupos();
  const deudas = G.filter(x => x.signo < 0).sort((a, b) => (b.activa - a.activa) || b.saldo - a.saldo);
  const meses = rangoMeses(hoy, addM(hoy, 6)), fin = meses[meses.length - 1];
  const proy = meses.map(ym => {
    const F = movs().filter(m => m.mes === ym);
    return {
      ym, cuotas: -sum(F.filter(m => m.valor < 0 && m.cuotas > 1)), otros: -sum(F.filter(m => m.valor < 0 && m.cuotas <= 1)),
      reemb: sum(movs().filter(m => esPrestamo(m) && m.mesCobro === ym), porCobrarDe), ing: sum(F.filter(m => !esPrest(m) && m.valor > 0)),
      tc: pagosTarjeta(ym),
    };
  });
  const totalDeuda = sum(deudas, x => x.saldo);
  const TJ = tarjetas();
  const esCuotaFutura = m => m.valor < 0 && m.cuotas > 1 && m.mes > hoy;
  const desdeHoy = ym => ym >= hoy;
  const enTarjeta = m => !!tarjetaDe(m.cuenta);
  // Totales por tarjeta para conciliar con el banco
  const TT = TJ.map(t => {
    const L = movs().filter(m => m.cuenta === t.nombre && m.valor < 0 && m.mes >= hoy);
    const total = -sum(L), interes = sum(L, m => m.interes);
    return { mostrado: sum(proy, p => p.tc.find(z => z.t === t)?.total || 0), total, interes, capital: total - interes, masAlla: -sum(L.filter(m => m.mes > fin)) };
  });
  const hayInteres = TT.some(x => x.interes >= 1);
  const netoItems = ym => () => [...Q.ing(ym)(), ...Q.porCobrar(ym)(), ...Q.sale(ym)().map(x => ({ ...x, v: -x.v }))];

  const filaMes = p => `<tr><td>${mesLabel(p.ym, true)}${p.ym === hoy ? ' <small>(actual)</small>' : ''}</td>${TJ.map(t => {
    const x = p.tc.find(z => z.t === t);
    return `<td class="num">${x ? `<span class="det" ${det(`${t.nombre} · pago de ${mesLabel(p.ym, true)}`, Q.tc(t.nombre, p.ym), `Vence el ${fechaLabel(x.vence)}`)}>${money(x.total)}</span><br><small class="muted">vence ${fechaLabel(x.vence)}</small>` : '<span class="muted">—</span>'}</td>`;
  }).join('')}<td class="num neg"><b class="det" ${det(`Todas las tarjetas · ${mesLabel(p.ym, true)}`, Q.sale(p.ym, enTarjeta))}>${money(sum(p.tc, x => x.total))}</b></td></tr>`;

  const difCelda = (t, i) => {
    if (!t.saldoBanco) return '<td class="num muted">—</td>';
    const dT = TT[i].total - t.saldoBanco, dC = TT[i].capital - t.saldoBanco;
    const ok = Math.abs(dT) < 1 || (TT[i].interes >= 1 && Math.abs(dC) < 1);
    return `<td class="num ${ok ? 'pos' : 'neg'}">${ok ? '✓ Cuadra' : money(dT)}${!ok && TT[i].interes >= 1 ? `<br><small class="muted">vs capital: ${money(dC)}</small>` : ''}</td>`;
  };

  const tablaTarjetas = !TJ.length ? '' : `<div class="card" style="margin-bottom:18px"><div class="section-title"><h3>Pagos de tarjeta</h3><small>${TJ.map(t => `${esc(t.nombre)}: corte día ${t.corte}, paga hasta el ${t.pago}`).join(' · ')}</small></div>
    <div class="table-wrap"><table class="grid conciliar"><thead><tr><th>Mes</th>${TJ.map(t => `<th class="num">${esc(t.nombre)}</th>`).join('')}<th class="num">Total tarjetas</th></tr></thead>
    <tbody>${proy.map(filaMes).join('')}</tbody>
    <tfoot>
      <tr><td>Total ${mesLabel(hoy)} – ${mesLabel(fin)}</td>${TJ.map((t, i) => `<td class="num"><span class="det" ${det(`${t.nombre} · ${mesLabel(hoy, true)} a ${mesLabel(fin, true)}`, Q.tc(t.nombre, entre(hoy, fin)))}>${money(TT[i].mostrado)}</span></td>`).join('')}<td class="num"><span class="det" ${det(`Todas las tarjetas · ${mesLabel(hoy, true)} a ${mesLabel(fin, true)}`, Q.sale(entre(hoy, fin), enTarjeta))}>${money(sum(TT, x => x.mostrado))}</span></td></tr>
      <tr class="fila-saldo"><td>Saldo total por pagar<br><small class="muted">desde ${mesLabel(hoy)}, todas las cuotas</small></td>${TJ.map((t, i) => `<td class="num"><span class="det" ${det(`${t.nombre} · saldo total por pagar`, Q.tc(t.nombre, desdeHoy), `Todas las cuotas desde ${mesLabel(hoy, true)}${TT[i].masAlla ? `; incluye ${money(TT[i].masAlla)} después de ${mesLabel(fin, true)}` : ''}`)}>${money(TT[i].total)}</span>${TT[i].masAlla ? `<br><small class="muted">${money(TT[i].masAlla)} después de ${mesLabel(fin)}</small>` : ''}</td>`).join('')}<td class="num"><span class="det" ${det('Todas las tarjetas · saldo total por pagar', Q.sale(desdeHoy, enTarjeta))}>${money(sum(TT, x => x.total))}</span></td></tr>
      ${hayInteres ? `<tr><td>Capital (sin intereses futuros)<br><small class="muted">comparable con la deuda que muestra el banco</small></td>${TT.map(x => `<td class="num">${money(x.capital)}${x.interes >= 1 ? `<br><small class="muted">+ ${money(x.interes)} int.</small>` : ''}</td>`).join('')}<td class="num">${money(sum(TT, x => x.capital))}</td></tr>` : ''}
      <tr class="fila-banco"><td>Según el banco<br><small class="muted">escribe el saldo que muestra la página del banco</small></td>${TJ.map(t => `<td class="num"><input class="in-banco" data-banco="${esc(t.nombre)}" inputmode="decimal" value="${t.saldoBanco ? Math.round(t.saldoBanco).toLocaleString('es-CO') : ''}" placeholder="$ 0">${t.fechaSaldo ? `<br><small class="muted">anotado ${fechaLabel(t.fechaSaldo)}</small>` : ''}</td>`).join('')}<td class="num">${TJ.some(t => t.saldoBanco) ? money(sum(TJ, t => t.saldoBanco || 0)) : ''}</td></tr>
      <tr class="fila-dif"><td>Diferencia (app − banco)</td>${TJ.map(difCelda).join('')}<td></td></tr>
    </tfoot></table></div>
    <p class="muted" style="font-size:12.5px">Para conciliar, compara el <b>pago del mes</b> con el “pago total” del extracto, y el <b>saldo total por pagar</b> (o el capital) con la “deuda total” de la página del banco. Haz clic en cualquier valor para ver de qué movimientos sale.</p>
  </div>`;

  const filaProy = p => {
    const n = p.ing + p.reemb - p.cuotas - p.otros, L = mesLabel(p.ym, true);
    return `<tr><td>${L}${p.ym === hoy ? ' <small>(actual)</small>' : ''}</td>
      <td class="num neg"><span class="det" ${det(`Cuotas diferidas · ${L}`, Q.sale(p.ym, m => m.cuotas > 1))}>${money(p.cuotas)}</span></td>
      <td class="num neg"><span class="det" ${det(`Otros gastos · ${L}`, Q.sale(p.ym, m => m.cuotas <= 1))}>${money(p.otros)}</span></td>
      <td class="num loan"><span class="det" ${det(`Devoluciones por cobrar · ${L}`, Q.porCobrar(p.ym))}>${money(p.reemb)}</span></td>
      <td class="num pos"><span class="det" ${det(`Ingresos · ${L}`, Q.ing(p.ym))}>${money(p.ing)}</span></td>
      <td class="num ${n >= 0 ? 'pos' : 'neg'}"><span class="det" ${det(`Neto proyectado · ${L}`, netoItems(p.ym), 'Ingresos y devoluciones suman; todas las salidas restan.')}>${money(n)}</span></td></tr>`;
  };

  const filaCompra = x => `<tr class="${x.activa ? '' : 'futuro'}">
    <td class="nombre"><span class="det" ${det(`${x.nombre} · todas las cuotas`, itemsDe(() => movs().filter(m => m.grupo === x.id), m => -m.valor))}>${esc(x.nombre)}</span><br><small>${money(x.monto)}${x.tasa ? ` · ${x.tasa.toFixed(2)}% MV` : ''} · <span class="tag dot" style="--c:${colorCat(x.categoria)}">${esc(x.categoria)}</span></small></td>
    <td>${esc(x.cuenta)}</td><td>${esc(x.persona)}</td><td class="num">${money(x.valorCuota)}</td>
    <td class="num">${x.interes ? money(x.interes) : x.valorCuota * x.N > x.monto + x.N ? `<small class="muted" title="Estimado: cuotas × valor − monto">≈ ${money(x.valorCuota * x.N - x.monto)}</small>` : '<span class="muted">—</span>'}</td>
    <td><div style="display:flex;gap:8px;align-items:center"><div class="progress"><span style="width:${(x.ultimaCuotaPagada / x.N * 100).toFixed(0)}%"></span></div><small>${x.ultimaCuotaPagada}/${x.N}</small></div></td>
    <td class="num neg"><span class="det" ${det(`${x.nombre} · cuotas pendientes`, itemsDe(() => movs().filter(m => m.grupo === x.id && m.mes > hoy), m => -m.valor))}>${money(x.saldo)}</span></td><td>${x.sig ? mesLabel(x.sig) : '—'}</td><td>${mesLabel(addM(x.fin, x.faltanFuturas))}</td>
    <td>${x.faltanFuturas > 0 ? `<button class="btn small" data-completar="${x.id}" title="Agrega las cuotas que faltan después de la última registrada">Completar ${x.faltanFuturas}</button>` : ''}</td></tr>`;

  $('#cuotasBody').innerHTML = `
    <div class="grid-cards">
      <div class="card kpi"><div class="label">Saldo en cuotas por pagar</div><div class="value neg det" ${det('Saldo en cuotas por pagar', itemsDe(() => movs().filter(esCuotaFutura), m => -m.valor), `Cuotas desde ${mesLabel(addM(hoy, 1), true)} en adelante`)}>${money(totalDeuda)}</div><div class="hint">Desde ${mesLabel(addM(hoy, 1))} en adelante</div></div>
      <div class="card kpi"><div class="label">Intereses por pagar</div><div class="value neg det" ${det('Intereses por pagar', itemsDe(() => movs().filter(m => esCuotaFutura(m) && m.interes), m => m.interes), 'Solo la parte de interés de cada cuota')}>${money(sum(deudas, x => x.interesPend))}</div><div class="hint">De compras con tasa registrada</div></div>
      <div class="card kpi"><div class="label">Compras a cuotas activas</div><div class="value">${deudas.filter(x => x.activa).length}</div><div class="hint">de ${deudas.length} registradas</div></div>
      <div class="card kpi"><div class="label">Cuota mensual el próximo mes</div><div class="value det" ${det(`Cuotas diferidas · ${mesLabel(addM(hoy, 1), true)}`, Q.sale(addM(hoy, 1), m => m.cuotas > 1))}>${money(proy[1]?.cuotas || 0)}</div><div class="hint">Solo compras diferidas</div></div>
    </div>
    ${tablaTarjetas}
    <div class="card" style="margin-bottom:18px"><h3>Proyección de los próximos meses</h3>
      <div class="table-wrap"><table class="grid"><thead><tr><th>Mes</th><th class="num">Cuotas diferidas</th><th class="num">Otros gastos registrados</th><th class="num">Devoluciones esperadas</th><th class="num">Ingresos registrados</th><th class="num">Neto</th></tr></thead>
      <tbody>${proy.map(filaProy).join('')}</tbody></table></div>
      <p class="muted" style="font-size:12.5px">El sueldo futuro solo aparece si ya está registrado. Usa ⟳ en Movimientos para repetir un ingreso o gasto fijo al mes siguiente.</p>
    </div>
    <div class="card"><h3>Compras a cuotas</h3>
      <div class="table-wrap"><table class="grid"><thead><tr><th>Compra</th><th>Cuenta</th><th>Persona</th><th class="num">Valor cuota</th><th class="num">Intereses</th><th>Avance</th><th class="num">Saldo pendiente</th><th>Próxima</th><th>Termina</th><th></th></tr></thead>
      <tbody>${deudas.map(filaCompra).join('') || '<tr><td colspan="10" class="muted">No hay compras a cuotas.</td></tr>'}</tbody></table></div>
    </div>`;
}
function completarCuotas(grupoId) {
  const g = movs().filter(m => m.grupo === grupoId).sort((a, b) => a.cuota - b.cuota);
  if (!g.length) return;
  const ult = g[g.length - 1], N = ult.cuotas;
  const nuevos = [];
  for (let c = ult.cuota + 1; c <= N; c++) nuevos.push({ ...ult, id: uid(), cuota: c, mes: addM(ult.mes, c - ult.cuota), mesCobro: ult.mesCobro ? addM(ult.mesCobro, c - ult.cuota) : '', recibido: 0, ok: false });
  confirmar('Completar cuotas', `<p>Se agregarán ${nuevos.length} cuota(s) de <b>${esc(ult.nombre)}</b> por ${money(Math.abs(ult.valor))} cada una, de ${mesLabel(nuevos[0].mes)} a ${mesLabel(nuevos[nuevos.length - 1].mes)}.</p>`, 'Agregar', () => {
    state.movimientos.push(...nuevos); commit('Cuotas agregadas');
  });
}

/* ================= Préstamos ================= */
// Un préstamo es lo que pagaste por otra persona (categoría Préstamo, valor < 0). Cada cuota
// lleva el mes en que esperas que te la devuelvan (`mesCobro`) y cuánto ya te devolvieron (`recibido`).
// Las cuotas de una misma compra comparten `grupo`.
const CUENTA_DEV = 'Devolución';
// desde/hasta: fecha del préstamo (día). cDesde/cHasta: mes de las cuotas, según cSegun:
// 'mesCobro' = mes en que te pagan la cuota, 'mes' = mes en que tú pagas la cuota a la tarjeta.
const FILTRO_P_VACIO = { persona: '', estado: '', texto: '', desde: '', hasta: '', cDesde: '', cHasta: '', cSegun: 'mesCobro' };
const prestFiltro = { ...FILTRO_P_VACIO, estado: 'porcobrar' };
const MAPA_FILTRO_P = { pfPersona: 'persona', pfDesde: 'desde', pfHasta: 'hasta', pfCDesde: 'cDesde', pfCHasta: 'cHasta', pfCSegun: 'cSegun' };
const ESTADOS_P = { vencido: ['Vencido', 'neg'], porcobrar: ['Por cobrar', 'pend'], cobrado: ['Cobrado', 'ok'] };

// filaOk (opcional) limita las cuotas que cuentan; los préstamos sin cuotas en el rango se omiten.
function prestamos(filaOk) {
  const hoy = ymNow(), map = new Map(), nTotal = new Map();
  movs().filter(esPrestamo).forEach(m => {
    nTotal.set(m.grupo, (nTotal.get(m.grupo) || 0) + 1);
    if (filaOk && !filaOk(m)) return;
    if (!map.has(m.grupo)) map.set(m.grupo, []); map.get(m.grupo).push(m);
  });
  return [...map.entries()].map(([k, rows]) => {
    rows.sort((a, b) => a.cuota - b.cuota || a.mes.localeCompare(b.mes));
    const total = sum(rows, m => Math.abs(m.valor));
    const cobrado = sum(rows, m => Math.min(m.recibido, Math.abs(m.valor)));
    const pend = rows.filter(m => !cobrada(m)).sort((a, b) => a.mesCobro.localeCompare(b.mesCobro));
    const estado = !pend.length ? 'cobrado' : pend.some(m => m.mesCobro < hoy) ? 'vencido' : 'porcobrar';
    const b = rows[0];
    return {
      k, rows, pend, estado, total, cobrado, porCobrar: total - cobrado,
      persona: rows.find(m => m.persona)?.persona || '', nombre: b.nombre, fecha: b.fecha, mesIni: b.mes,
      monto: b.monto, cuotas: b.cuotas, cuenta: b.cuenta, interes: sum(rows, m => m.interes),
      proxima: pend[0] || null, vencido: sum(pend.filter(m => m.mesCobro < hoy), porCobrarDe),
      nTotal: nTotal.get(k), parcial: rows.length < nTotal.get(k),
    };
  });
}
function filtroCuotasActivo() { return !!(prestFiltro.cDesde || prestFiltro.cHasta); }
function filaEnRango(m) {
  const f = prestFiltro, v = m[f.cSegun] || m.mes;
  return (!f.cDesde || v >= f.cDesde) && (!f.cHasta || v <= f.cHasta);
}
function filtrarPrestamos(lista, ignorarEstado) {
  const f = prestFiltro, t = f.texto.toLowerCase();
  const fechaP = p => p.fecha || p.mesIni + '-01';
  // Acepta filtros guardados como mes (AAAA-MM) o como día (AAAA-MM-DD)
  const desde = f.desde && f.desde.length === 7 ? f.desde + '-01' : f.desde;
  const hasta = f.hasta && f.hasta.length === 7 ? f.hasta + '-31' : f.hasta;
  return lista.filter(p =>
    (!f.persona || (f.persona === '__sin' ? !p.persona : p.persona === f.persona)) &&
    (ignorarEstado || !f.estado || (f.estado === 'porcobrar' ? p.estado !== 'cobrado' : p.estado === f.estado)) &&
    (!t || p.nombre.toLowerCase().includes(t) || p.rows.some(m => m.notas.toLowerCase().includes(t))) &&
    (!desde || fechaP(p) >= desde) && (!hasta || fechaP(p) <= hasta));
}
function tagEstadoP(e) { const [t, c] = ESTADOS_P[e]; return `<span class="tag ${c}">${t}</span>`; }
const barraAvance = (a, b) => `<div class="progress"><span style="width:${b ? Math.min(100, a / b * 100).toFixed(0) : 0}%;background:var(--pos)"></span></div>`;

function renderPrestamos() {
  const porCuotas = filtroCuotasActivo();
  const todos = prestamos(porCuotas ? filaEnRango : null);
  const base = filtrarPrestamos(todos, true);          // respeta persona/fechas/texto, no el estado
  const lista = filtrarPrestamos(todos, false).sort((a, b) => (b.fecha || b.mesIni).localeCompare(a.fecha || a.mesIni));
  const T = k => sum(base, p => p[k]);
  const filasDe = (L, f) => () => L.flatMap(p => p.rows).map(m => ({ m, v: f(m) }));
  const filasBase = f => filasDe(base, f);
  const personas =[...new Set(todos.map(p => p.persona).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const sinPersona = todos.filter(p => !p.persona).length;

  const tarjetasP = [...personas, ...(sinPersona ? [''] : [])].map(per => {
    const L = base.filter(p => p.persona === per);
    if (!L.length) return '';
    const tot = sum(L, p => p.total), cob = sum(L, p => p.cobrado), pc = sum(L, p => p.porCobrar), venc = sum(L, p => p.vencido);
    const prox = L.map(p => p.proxima).filter(Boolean).sort((a, b) => a.mesCobro.localeCompare(b.mesCobro))[0];
    const val = per || '__sin';
    return `<button class="card persona-card ${prestFiltro.persona === val ? 'sel' : ''}" data-pfpersona="${esc(val)}">
      <div class="section-title"><h3>${per ? esc(per) : '<span class="muted">Sin asignar</span>'}</h3><small>${L.length} préstamo(s)</small></div>
      ${barraAvance(cob, tot)}
      <div class="pc-nums"><span><small>Prestado</small>${money(tot)}</span><span><small>Cobrado</small><b class="pos">${money(cob)}</b></span><span><small>Por cobrar</small><b class="loan">${money(pc)}</b></span></div>
      <small class="muted">${venc ? `<span class="neg">Vencido ${money(venc)}</span> · ` : ''}${prox ? `Próxima: ${mesLabel(prox.mesCobro)} · ${money(porCobrarDe(prox))}` : 'Todo cobrado'}</small>
    </button>`;
  }).join('');

  const cuenta = e => base.filter(p => e === 'porcobrar' ? p.estado !== 'cobrado' : e ? p.estado === e : true).length;
  const chips = [['', 'Todos'], ['porcobrar', 'Por cobrar'], ['vencido', 'Vencidos'], ['cobrado', 'Cobrados']]
    .map(([v, t]) => `<button class="chip ${prestFiltro.estado === v ? 'sel' : ''}" data-pfestado="${v}">${t} <b>${cuenta(v)}</b></button>`).join('');

  $('#prestamosBody').innerHTML = `
    <div class="grid-cards">
      <div class="card kpi"><div class="label">Total prestado</div><div class="value det" ${det('Préstamos · total prestado', filasBase(m => Math.abs(m.valor)))}>${money(T('total'))}</div><div class="hint">${base.length} préstamo(s)</div></div>
      <div class="card kpi"><div class="label">Ya cobrado</div><div class="value pos det" ${det('Préstamos · ya cobrado', filasBase(m => Math.min(m.recibido, Math.abs(m.valor))))}>${money(T('cobrado'))}</div><div class="hint">${T('total') ? (T('cobrado') / T('total') * 100).toFixed(0) : 0}% del total</div></div>
      <div class="card kpi"><div class="label">Por cobrar</div><div class="value loan det" ${det('Préstamos · por cobrar', filasBase(porCobrarDe))}>${money(T('porCobrar'))}</div><div class="hint">${base.filter(p => p.porCobrar > 0).length} préstamo(s) con saldo</div></div>
      <div class="card kpi"><div class="label">Vencido</div><div class="value ${T('vencido') ? 'neg' : ''} det" ${det('Préstamos · vencido', filasBase(m => !cobrada(m) && m.mesCobro < ymNow() ? porCobrarDe(m) : 0))}>${money(T('vencido'))}</div><div class="hint">Devoluciones de meses pasados sin cobrar</div></div>
    </div>
    ${sinPersona ? `<div class="alert">${sinPersona} préstamo(s) sin persona asignada. Ábrelos y asígnales la persona.</div>` : ''}
    <div class="persona-grid">${tarjetasP}</div>
    <div class="card">
      <div class="filters">
        <input type="search" id="pfTexto" placeholder="Buscar préstamo…" value="${esc(prestFiltro.texto)}">
        <select id="pfPersona"><option value="">Todas las personas</option>${personas.map(p => `<option ${prestFiltro.persona === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}${sinPersona ? `<option value="__sin" ${prestFiltro.persona === '__sin' ? 'selected' : ''}>(Sin asignar)</option>` : ''}</select>
        <button class="btn ghost small" data-act="pfLimpiar">Limpiar filtros</button>
        <span class="spacer"></span>
        <button class="btn small" data-act="pCerrarHasta" title="Marca como cobrado todo lo anterior a un mes">Dar por cobrado hasta…</button>
      </div>
      <div class="filtro-grupos">
        <fieldset class="filtro-grupo ${prestFiltro.desde || prestFiltro.hasta ? 'activo' : ''}"><legend>Fecha del préstamo</legend>
          <label>Desde <input type="date" id="pfDesde" value="${prestFiltro.desde.length === 10 ? prestFiltro.desde : ''}"></label>
          <label>Hasta <input type="date" id="pfHasta" value="${prestFiltro.hasta.length === 10 ? prestFiltro.hasta : ''}"></label>
        </fieldset>
        <fieldset class="filtro-grupo ${porCuotas ? 'activo' : ''}"><legend>Mes de pago de las cuotas</legend>
          <select id="pfCSegun" title="Qué mes de la cuota se compara">
            <option value="mesCobro" ${prestFiltro.cSegun === 'mesCobro' ? 'selected' : ''}>Cuando te pagan</option>
            <option value="mes" ${prestFiltro.cSegun === 'mes' ? 'selected' : ''}>Cuando pagas tú (tarjeta)</option>
          </select>
          <label>Desde <input type="month" id="pfCDesde" value="${prestFiltro.cDesde}"></label>
          <label>Hasta <input type="month" id="pfCHasta" value="${prestFiltro.cHasta}"></label>
        </fieldset>
      </div>
      ${porCuotas ? `<div class="alert info">Mostrando solo las cuotas ${prestFiltro.cSegun === 'mes' ? 'que pagas' : 'que te pagan'} ${prestFiltro.cDesde && prestFiltro.cDesde === prestFiltro.cHasta ? `en ${mesLabel(prestFiltro.cDesde, true)}` : prestFiltro.cDesde && prestFiltro.cHasta ? `entre ${mesLabel(prestFiltro.cDesde, true)} y ${mesLabel(prestFiltro.cHasta, true)}` : prestFiltro.cDesde ? `desde ${mesLabel(prestFiltro.cDesde, true)}` : `hasta ${mesLabel(prestFiltro.cHasta, true)}`}. Los totales suman solo esas cuotas.</div>` : ''}
      <div class="chips">${chips}</div>
      <div class="table-wrap"><table class="grid clickable"><thead><tr><th>Préstamo</th><th>Persona</th><th class="num">Prestado</th><th class="num">Cobrado</th><th class="num">Por cobrar</th><th>Avance</th><th>Próxima devolución</th><th>Estado</th></tr></thead>
      <tbody>${lista.map(p => `<tr data-prestamo="${esc(p.k)}" title="Ver detalle">
        <td class="nombre"><b>${esc(p.nombre)}</b><br><small>${p.fecha ? fechaLabel(p.fecha) : mesLabel(p.mesIni)} · ${esc(p.cuenta)}${p.cuotas > 1 ? ` · ${p.cuotas} cuotas` : ''}${p.parcial ? ` · <span class="loan">${p.rows.length} de ${p.nTotal} en el rango (${p.rows.map(m => m.cuota).join(', ')})</span>` : ''}</small></td>
        <td>${p.persona ? esc(p.persona) : '<span class="muted">—</span>'}</td>
        <td class="num">${money(p.total)}</td><td class="num pos">${money(p.cobrado)}</td><td class="num loan">${money(p.porCobrar)}</td>
        <td><div style="display:flex;gap:8px;align-items:center">${barraAvance(p.cobrado, p.total)}<small>${p.rows.filter(cobrada).length}/${p.rows.length}</small></div></td>
        <td>${p.proxima ? `${mesLabel(p.proxima.mesCobro)} · ${money(porCobrarDe(p.proxima))}` : '—'}</td>
        <td>${tagEstadoP(p.estado)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted" style="text-align:center;padding:30px">No hay préstamos con estos filtros.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="2">${lista.length} préstamo(s)</td><td class="num"><span class="det" ${det('Préstamos listados · prestado', filasDe(lista, m => Math.abs(m.valor)))}>${money(sum(lista, p => p.total))}</span></td><td class="num"><span class="det" ${det('Préstamos listados · cobrado', filasDe(lista, m => Math.min(m.recibido, Math.abs(m.valor))))}>${money(sum(lista, p => p.cobrado))}</span></td><td class="num"><span class="det" ${det('Préstamos listados · por cobrar', filasDe(lista, porCobrarDe))}>${money(sum(lista, p => p.porCobrar))}</span></td><td colspan="3"></td></tr></tfoot></table></div>
      <p class="muted" style="font-size:12.5px">Haz clic en un préstamo para ver sus cuotas, marcar lo cobrado, cambiar el mes de cobro o registrar un abono.</p>
    </div>`;
}

// ---- Detalle de un préstamo ----
let prestAbierto = null;
function abrirPrestamo(k) {
  prestAbierto = k;
  pintarPrestamo();
  if (!$('#dlgPrestamo').open) $('#dlgPrestamo').showModal();
}
function prestamoActual() { return prestamos().find(x => x.k === prestAbierto); }
function pintarPrestamo() {
  const p = prestamoActual();
  if (!p) { $('#dlgPrestamo').close(); return; }
  const hoy = ymNow();
  const filas = p.rows.map(m => {
    const pc = porCobrarDe(m), ok = cobrada(m), venc = !ok && m.mesCobro < hoy;
    return `<tr class="${!ok && m.mesCobro > hoy ? 'futuro' : ''}">
      <td>${m.cuotas > 1 ? `${m.cuota}/${m.cuotas}` : '—'}</td>
      <td>${mesLabel(m.mes)}</td>
      <td class="num">${money(Math.abs(m.valor))}${m.interes ? `<br><small class="muted">int. ${money(m.interes)}</small>` : ''}</td>
      <td><input type="month" data-pmes="${m.id}" value="${m.mesCobro}" style="width:185px"> ${m.mesCobro < m.mes ? '<span class="tag adel">adelantada</span>' : ''}</td>
      <td class="num ${m.recibido ? 'pos' : 'muted'}">${money(Math.min(m.recibido, Math.abs(m.valor)))}${!ok && m.recibido ? `<br><small class="loan">faltan ${money(pc)}</small>` : ''}</td>
      <td><label class="chk"><input type="checkbox" data-pok="${m.id}" ${ok ? 'checked' : ''}> ${ok ? '<span class="tag ok">cobrado</span>' : venc ? '<span class="tag neg-tag">vencido</span>' : '<span class="tag pend">por cobrar</span>'}</label></td>
      <td><div class="acts"><button data-edit="${m.id}" title="Editar">✎</button></div></td></tr>`;
  }).join('');
  $('#pTitulo').textContent = p.nombre;
  $('#pCuerpo').innerHTML = `
    <p class="muted" style="margin:0">${p.persona ? `Prestado a <b>${esc(p.persona)}</b>` : '<b class="neg">Sin persona asignada</b>'} · ${p.fecha ? fechaLabel(p.fecha) : mesLabel(p.mesIni)} · pagado con ${esc(p.cuenta || '—')}${p.cuotas > 1 ? ` · ${p.cuotas} cuotas` : ''} · ${tagEstadoP(p.estado)}</p>
    <div class="mini-kpis">
      <div><small>Prestado</small><b>${money(p.total)}</b>${p.interes ? `<small>incluye ${money(p.interes)} de intereses</small>` : ''}</div>
      <div><small>Cobrado</small><b class="pos">${money(p.cobrado)}</b></div>
      <div><small>Por cobrar</small><b class="loan">${money(p.porCobrar)}</b></div>
    </div>
    ${barraAvance(p.cobrado, p.total)}
    <div class="table-wrap" style="max-height:340px;overflow:auto"><table class="grid"><thead><tr><th>Cuota</th><th>Tú pagas</th><th class="num">Valor</th><th>Te devuelven en</th><th class="num">Recibido</th><th>Estado</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>
    <div class="form-grid">
      <label>Persona <input id="pPersona" list="dlPersonas" value="${esc(p.persona)}" placeholder="¿A quién le prestaste?"></label>
      <div style="display:flex;align-items:flex-end;gap:8px"><button type="button" class="btn small" data-act="pGuardarPersona">Guardar persona</button></div>
    </div>
    <fieldset><legend>Registrar un abono (pago parcial)</legend>
      <div class="form-grid">
        <label>Valor recibido <input id="pAbonoValor" inputmode="decimal" placeholder="0"></label>
        <div style="display:flex;align-items:flex-end"><button type="button" class="btn small primary" data-act="pAbono">Aplicar abono</button></div>
      </div>
      <small class="muted">Se abona a las cuotas pendientes en orden, empezando por la más antigua.</small>
    </fieldset>`;
  $('#pAcciones').innerHTML = `${p.pend.length ? '<button type="button" class="btn" data-act="pCobrarTodo">Marcar todo como cobrado</button>' : ''}<span class="spacer"></span><button type="button" class="btn primary" data-close>Cerrar</button>`;
}
const accionesPrestamo = {
  pGuardarPersona: () => {
    const p = prestamoActual(); if (!p) return;
    const v = cap($('#pPersona').value);
    p.rows.forEach(m => (m.persona = v));
    commit(v ? `Préstamo asignado a ${v}` : 'Persona quitada');
  },
  pCobrarTodo: () => {
    const p = prestamoActual(); if (!p) return;
    p.rows.forEach(m => (m.recibido = Math.abs(m.valor)));
    commit('Préstamo cobrado completo');
  },
  pAbono: () => {
    const p = prestamoActual(); if (!p) return;
    let v = Math.abs(parseNum($('#pAbonoValor').value));
    if (!v) return toast('Escribe el valor del abono', 'error');
    const total = v;
    for (const m of p.pend) { if (v <= 0) break; const a = Math.min(v, porCobrarDe(m)); m.recibido += a; v -= a; }
    const nota = `Abono ${fechaLabel(hoyISO())}: ${money(total - v)}`;
    p.rows[0].notas = p.rows[0].notas ? p.rows[0].notas + ' · ' + nota : nota;
    commit(v > 0 ? `Abono aplicado; sobran ${money(v)} (el préstamo quedó cobrado)` : `Abono de ${money(total)} aplicado`);
  },
  pCerrarHasta: () => mensaje('Dar por cobrado', `<p>Toda devolución esperada <b>antes</b> del mes que elijas quedará como cobrada.</p><label>Primer mes que sigue pendiente <input type="month" id="mInput" value="${ymNow()}"></label>`,
    [['Cancelar', 'ghost'], ['Aplicar', 'primary', () => { const ym = $('#mInput').value; if (!ym) return; const n = cerrarHasta(ym); commit(n ? `${n} cuota(s) marcadas como cobradas antes de ${mesLabel(ym, true)}` : 'No había nada pendiente antes de esa fecha'); }]]),
  pfLimpiar: () => { Object.assign(prestFiltro, FILTRO_P_VACIO); renderPrestamos(); },
};
// Marca como cobrado todo préstamo cuya devolución esperada es anterior al mes `ym` (AAAA-MM)
function cerrarHasta(ym) {
  const L = movs().filter(m => esPrestamo(m) && !cobrada(m) && m.mesCobro < ym);
  L.forEach(m => (m.recibido = Math.abs(m.valor)));
  return L.length;
}

/* ================= Migraciones de datos ================= */
// Se aplican al abrir la app y al importar una copia antigua; cada paso depende de los datos, no de banderas.
const claveP = m => [m.nombre.trim().toLowerCase(), Math.round(m.monto), m.fecha || ''].join('|');
const claveLarga = m => [m.nombre.trim().toLowerCase(), Math.round(m.monto)].join('|');
function aplicarMigraciones() {
  let n = 0;
  const legado = movs().some(m => esPrest(m) && m.valor > 0);
  // 1. Notion: banco "Prestamo" = devoluciones de Marta, "Prestamo E" = Erika, "Prestamo Omar" = Omar
  movs().forEach(m => {
    if (m.cuenta === 'Reembolso') { m.cuenta = CUENTA_DEV; if (!m.persona) m.persona = 'Marta'; n++; }
    if (esPrest(m) && m.persona === 'E') { m.persona = 'Erika'; n++; }
  });
  if (legado) {
    const porClave = new Map();
    movs().filter(m => esPrest(m) && m.persona).forEach(m => { porClave.set(claveP(m), m.persona); if (!porClave.has(claveLarga(m))) porClave.set(claveLarga(m), m.persona); });
    movs().filter(m => esPrest(m) && !m.persona).forEach(m => { const p = porClave.get(claveP(m)) || porClave.get(claveLarga(m)); if (p) { m.persona = p; n++; } });
  }
  // 2. Lo que no es préstamo es del titular: no lleva persona
  movs().filter(m => !esPrest(m) && m.persona).forEach(m => { m.persona = ''; n++; });
  // 3. Un préstamo = un solo movimiento: las devoluciones (valor > 0) se funden en su cuota pagada
  movs().filter(m => esPrestamo(m) && !m.mesCobro).forEach(m => { m.mesCobro = m.mes; n++; });
  if (legado) {
    const map = new Map();
    movs().filter(esPrest).forEach(m => { const k = claveP(m); if (!map.has(k)) map.set(k, []); map.get(k).push(m); });
    const entradas = [...map.values()];
    const soloSal = entradas.filter(r => r.every(m => m.valor < 0));
    entradas.filter(r => r.every(m => m.valor > 0)).forEach(r => {
      const dest = soloSal.find(s => s.length && claveLarga(s[0]) === claveLarga(r[0]));
      if (dest) { dest.push(...r.splice(0)); }
    });
    const quitar = new Set();
    entradas.forEach(rows => {
      const sal = rows.filter(m => m.valor < 0).sort((a, b) => a.cuota - b.cuota || a.mes.localeCompare(b.mes));
      const dev = rows.filter(m => m.valor > 0).sort((a, b) => a.cuota - b.cuota || a.mes.localeCompare(b.mes));
      const usados = new Set();
      dev.forEach(d => {
        const s = sal.find(x => !usados.has(x) && x.cuota === d.cuota && x.cuotas === d.cuotas) || sal.find(x => !usados.has(x));
        if (s) {
          usados.add(s); quitar.add(d.id);
          s.mesCobro = d.mes;
          s.recibido = d.ok ? Math.abs(s.valor) : Math.min(s.recibido, Math.abs(s.valor));
          if (!s.persona) s.persona = d.persona;
          if (d.notas && !/^Cobrado \(cierre/.test(d.notas) && !s.notas.includes(d.notas)) s.notas = s.notas ? s.notas + ' · ' + d.notas : d.notas;
        } else if (sal.length) {
          // Devolución extra (abono): se reparte en lo pendiente
          quitar.add(d.id);
          let v = d.ok ? d.valor : 0;
          sal.forEach(x => { const a = Math.min(v, porCobrarDe(x)); x.recibido += a; v -= a; });
        } else {
          // Devolución sin compra registrada como préstamo: queda como ingreso
          d.notas = [d.notas, `Devolución de ${d.persona || 'un tercero'}`].filter(Boolean).join(' · ');
          d.categoria = 'Otros ingresos'; d.persona = '';
        }
        n++;
      });
    });
    state.movimientos = movs().filter(m => !quitar.has(m.id));
    // 4. Según Miguel, todo lo anterior al 1 de septiembre de 2026 ya fue pagado y cobrado
    n += cerrarHasta('2026-09');
  }
  // 6. Servicios del hogar: se cargan una vez con los datos del Excel "Cuentas servicio" (jul–sep 2026)
  if (!state.hogar && movs().length) { state.hogar = hogarInicial(); n++; }
  // 5. Tarjetas de crédito conocidas
  if (!tarjetas().length) {
    const cuentas = valores('cuenta');
    [['Banco Falabella', 15, 30], ['Rappi', 5, 15]].forEach(([nombre, corte, pago]) => {
      if (cuentas.includes(nombre)) { tarjetas().push(sanearTarjeta({ nombre, corte, pago })); n++; }
    });
  }
  return n;
}

/* ================= Render: Reportes ================= */
function renderReporte() {
  const meses = mesesConDatos(); const hoy = ymNow();
  if (!$('#rHasta').value) $('#rHasta').value = hoy;
  if (!$('#rDesde').value) $('#rDesde').value = addM(hoy, -5);
  const d = $('#rDesde').value, h = $('#rHasta').value;
  const R = rangoMeses(d, h);
  if (!R.length || !meses.length) { $('#reporteBody').innerHTML = '<p class="muted">Elige un rango válido.</p>'; return; }
  const L = movs().filter(m => m.mes >= d && m.mes <= h);
  const serie = R.map(m => resumenMes(m));
  const ing = sum(serie, s => s.ing), gas = sum(serie, s => s.gas), pSal = sum(serie, s => s.pSal), pRe = sum(serie, s => s.pRe);
  const cats = gastoPorCategoria(L).map(c => c[0]);
  const matriz = cats.map(c => R.map(ym => -sum(L.filter(m => m.mes === ym && m.categoria === c && !esPrest(m) && m.valor < 0))));
  const porCuenta = [...new Set(L.filter(m => m.valor < 0).map(m => m.cuenta))].map(c => [c, -sum(L.filter(m => m.cuenta === c && m.valor < 0))]).sort((a, b) => b[1] - a[1]);
  const top = L.filter(m => !esPrest(m) && m.valor < 0).sort((a, b) => a.valor - b.valor).slice(0, 10);
  const mesesActivos = serie.filter(s => s.n).length || 1;
  const pres = state.presupuestos;
  const per = entre(d, h), perTxt = `${mesLabel(d, true)} – ${mesLabel(h, true)}`;
  const ahorroItems = () => [...Q.ing(per)(), ...Q.gas(per)().map(x => ({ ...x, v: -x.v }))];
  const prestNetoItems = () => [...Q.pSal(per)(), ...Q.pRe(per)().map(x => ({ ...x, v: -x.v }))];

  $('#reporteBody').innerHTML = `
    <div class="card" style="margin-bottom:18px"><h2>Reporte financiero · ${perTxt}</h2><small>Generado el ${fechaLabel(hoyISO())} · ${L.length} movimientos · haz clic en cualquier valor para ver su detalle</small></div>
    <div class="grid-cards">
      <div class="card kpi"><div class="label">Ingresos</div><div class="value pos det" ${det(`Ingresos · ${perTxt}`, Q.ing(per))}>${money(ing)}</div></div>
      <div class="card kpi"><div class="label">Gastos de ${TITULAR}</div><div class="value neg det" ${det(`Gastos de ${TITULAR} · ${perTxt}`, Q.gas(per))}>${money(gas)}</div><div class="hint">Promedio ${money(gas / mesesActivos)}/mes</div></div>
      <div class="card kpi"><div class="label">Ahorro</div><div class="value ${ing - gas >= 0 ? 'pos' : 'neg'} det" ${det(`Ahorro · ${perTxt}`, ahorroItems, 'Ingresos suman; gastos restan.')}>${money(ing - gas)}</div><div class="hint">${ing ? ((ing - gas) / ing * 100).toFixed(1) : 0}% de los ingresos</div></div>
      <div class="card kpi"><div class="label">Préstamos netos</div><div class="value loan det" ${det(`Préstamos netos · ${perTxt}`, prestNetoItems, 'Lo que pagaste por terceros suma; las devoluciones del periodo restan.')}>${money(pSal - pRe)}</div><div class="hint">Pagaste <span class="det" ${det(`Pagado por terceros · ${perTxt}`, Q.pSal(per))}>${money(pSal)}</span> · devoluciones <span class="det" ${det(`Devoluciones · ${perTxt}`, Q.pRe(per))}>${money(pRe)}</span></div></div>
    </div>
    <div class="card" style="margin-bottom:18px"><h3>Evolución mensual</h3>${chartMeses(serie)}</div>
    <div class="card" style="margin-bottom:18px"><h3>Gastos de ${TITULAR} por categoría y mes</h3>
      <div class="table-wrap"><table class="grid"><thead><tr><th>Categoría</th>${R.map(m => `<th class="num">${mesLabel(m)}</th>`).join('')}<th class="num">Total</th><th class="num">Prom./mes</th><th class="num">%</th></tr></thead>
      <tbody>${cats.map((c, i) => { const t = matriz[i].reduce((a, b) => a + b, 0); const prom = t / R.length; const over = pres[c] && prom > pres[c];
        return `<tr><td><span class="tag dot" style="--c:${colorCat(c)}">${esc(c)}</span></td>${matriz[i].map((v, j) => `<td class="num">${v ? `<span class="det" ${det(`${c} · ${mesLabel(R[j], true)}`, Q.gas(R[j], c))}>${money(v)}</span>` : '<span class="muted">—</span>'}</td>`).join('')}<td class="num"><b class="det" ${det(`${c} · ${perTxt}`, Q.gas(per, c))}>${money(t)}</b></td><td class="num ${over ? 'neg' : ''}" title="${pres[c] ? 'Presupuesto ' + money(pres[c]) : ''}">${money(prom)}</td><td class="num">${gas ? (t / gas * 100).toFixed(1) : 0}%</td></tr>`; }).join('')}</tbody>
      <tfoot><tr><td>Total</td>${R.map((m, j) => `<td class="num"><span class="det" ${det(`Gastos de ${TITULAR} · ${mesLabel(m, true)}`, Q.gas(m))}>${money(matriz.reduce((a, r) => a + r[j], 0))}</span></td>`).join('')}<td class="num"><span class="det" ${det(`Gastos de ${TITULAR} · ${perTxt}`, Q.gas(per))}>${money(gas)}</span></td><td class="num">${money(gas / R.length)}</td><td class="num">100%</td></tr></tfoot></table></div>
    </div>
    <div class="two-col">
      <div class="card"><h3>Top 10 gastos</h3><ul class="list-plain">${top.map(m => `<li><span>${esc(m.nombre)} <small>· ${mesLabel(m.mes)}${m.cuotas > 1 ? ` · cuota ${m.cuota}/${m.cuotas}` : ''}</small></span><span class="neg">${money(m.valor)}</span></li>`).join('') || '<li class="muted">Sin gastos</li>'}</ul></div>
      <div class="card"><h3>Salidas por cuenta / medio de pago</h3><ul class="list-plain">${porCuenta.map(([c, v]) => `<li><span>${esc(c)}</span><span class="det" ${det(`Salidas por ${c} · ${perTxt}`, Q.sale(per, m => m.cuenta === c))}>${money(v)}</span></li>`).join('') || '<li class="muted">—</li>'}</ul>
        <p class="muted" style="font-size:12.5px">Incluye lo pagado por terceros.</p></div>
    </div>`;
}
function exportarReporteCSV() {
  const d = $('#rDesde').value, h = $('#rHasta').value;
  const L = movs().filter(m => m.mes >= d && m.mes <= h).sort((a, b) => a.mes.localeCompare(b.mes) || a.fecha.localeCompare(b.fecha));
  descargar(`reporte-finanzas_${d}_a_${h}.csv`, csvMovimientos(L), 'text/csv;charset=utf-8');
}
function csvMovimientos(L) {
  const cab = ['Mes de pago', 'Fecha', 'Nombre', 'Categoría', 'Cuenta', 'Persona', 'Cuota', 'Total cuotas', 'Monto total', 'Valor', 'Interés', 'Tasa MV %', 'Mes de cobro', 'Recibido', 'Notas'];
  const filas = L.map(m => [m.mes, fechaLabel(m.fecha), m.nombre, m.categoria, m.cuenta, esPrest(m) ? m.persona : TITULAR, m.cuota, m.cuotas,
    Math.round(m.monto), Math.round(m.valor), Math.round(m.interes), m.tasa ? String(m.tasa).replace('.', ',') : '',
    esPrestamo(m) ? m.mesCobro : '', esPrestamo(m) ? Math.round(m.recibido) : '', m.notas]);
  return '﻿' + [cab, ...filas].map(r => r.map(csvCell).join(';')).join('\r\n');
}

/* ================= Render: Datos ================= */
function renderDatos() {
  const m = state.meta;
  const ult = m.ultimoRespaldo ? new Date(m.ultimoRespaldo) : null;
  const snaps = snapshots();
  const prev = localStorage.getItem(KEY_PREV);
  const cats = valores('categoria').filter(c => c !== CAT_PRESTAMO && movs().some(x => x.categoria === c && x.valor < 0));
  $('#datosBody').innerHTML = `
    <div class="datos-grid">
      <div class="card"><h3>Copias de seguridad</h3>
        ${SOPORTA_CARPETA ? `
          <p>Conecta la carpeta <code>Finanza/respaldos</code> una sola vez. Desde ahí la app guarda las copias directamente (OneDrive las sincroniza).</p>
          <p><b>Carpeta:</b> ${dirHandle ? `${esc(dirHandle.name)} ${dirPermiso === 'granted' ? '<span class="tag ok">conectada</span>' : '<span class="tag pend">falta dar permiso</span>'}` : '<span class="tag pend">sin conectar</span>'}</p>
          <label class="chk"><input type="checkbox" id="autoResp" ${m.autoRespaldo ? 'checked' : ''} ${dirHandle ? '' : 'disabled'}> Respaldo automático cada vez que haya cambios</label>
          <p class="muted" style="font-size:12.5px">El automático guarda un archivo por día (<code>finanzas-respaldo_AAAA-MM-DD_auto.json</code>), que se actualiza con cada cambio de ese día. El botón “Guardar respaldo ahora” crea además una copia con fecha y hora.</p>`
        : `<p>Este navegador no permite guardar directamente en una carpeta (usa Chrome o Edge para eso). Las copias se descargarán; muévelas a <code>Finanza/respaldos</code>.</p>`}
        <p><b>Último respaldo:</b> ${ult ? ult.toLocaleString('es-CO') : 'nunca'}<br><b>Cambios sin respaldar:</b> ${m.cambios}</p>
        <div class="btns">
          <button class="btn primary" data-act="exportarJson">Guardar respaldo ahora</button>
          ${SOPORTA_CARPETA ? `<button class="btn" data-act="${dirHandle && dirPermiso !== 'granted' ? 'permitirCarpeta' : 'conectarCarpeta'}">${dirHandle ? (dirPermiso === 'granted' ? 'Cambiar carpeta' : 'Dar permiso a la carpeta') : 'Conectar carpeta de respaldos'}</button>` : ''}
          <button class="btn" data-act="importarJson">Importar copia…</button>
        </div>
      </div>
      <div class="card"><h3>Respaldos guardados</h3>
        <div id="listaRespaldos"></div>
      </div>
      <div class="card"><h3>Exportar a Excel</h3>
        <p>Descarga todos los movimientos en CSV (separado por “;”), listo para abrir en Excel.</p>
        <div class="btns"><button class="btn" data-act="exportarCsv">Exportar CSV</button></div>
      </div>
      <div class="card"><h3>Puntos de restauración automáticos</h3>
        <p>La app guarda una copia interna por día (últimos 7) por si algo sale mal. No reemplaza a las copias de seguridad en archivo.</p>
        <ul class="list-plain">${snaps.map((s, i) => `<li><span>${fechaLabel(s.fecha)} · ${s.n} movimientos</span><button class="btn small" data-snap="${i}">Restaurar</button></li>`).join('') || '<li class="muted">Aún no hay puntos.</li>'}</ul>
        ${prev ? '<div class="btns" style="margin-top:10px"><button class="btn small" data-act="deshacerImport">Deshacer la última importación</button></div>' : ''}
      </div>
      <div class="card" id="tarjetasCfg"><h3>Tarjetas de crédito</h3>
        <p>Con el día de corte, la app calcula en qué mes pagas cada compra. Con la tasa, calcula la cuota y los intereses al diferir. El nombre debe ser igual al de la cuenta en tus movimientos.</p>
        <div class="table-wrap"><table class="grid tj-grid"><thead><tr><th>Tarjeta</th><th>Día de corte</th><th>Pago hasta el día</th><th>Tasa</th><th>Tipo</th><th></th></tr></thead><tbody>
        ${tarjetas().map((t, i) => `<tr>
          <td><input data-tj="${i}" data-campo="nombre" list="dlCuentas" value="${esc(t.nombre)}"></td>
          <td><input data-tj="${i}" data-campo="corte" type="number" min="1" max="31" value="${t.corte}"></td>
          <td><input data-tj="${i}" data-campo="pago" type="number" min="1" max="31" value="${t.pago}"></td>
          <td><input data-tj="${i}" data-campo="tasa" inputmode="decimal" value="${t.tasa ? String(t.tasa).replace('.', ',') : ''}" placeholder="Ej. 1,89"></td>
          <td><select data-tj="${i}" data-campo="tipoTasa"><option value="MV" ${t.tipoTasa === 'MV' ? 'selected' : ''}>% MV</option><option value="EA" ${t.tipoTasa === 'EA' ? 'selected' : ''}>% EA</option></select></td>
          <td><button class="btn ghost small" data-act="quitarTarjeta" data-i="${i}" title="Quitar">✕</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Aún no hay tarjetas.</td></tr>'}
        </tbody></table></div>
        <div class="btns" style="margin-top:10px"><button class="btn small" data-act="agregarTarjeta">+ Agregar tarjeta</button><button class="btn primary small" data-act="guardarTarjetas">Guardar tarjetas</button></div>
      </div>
      <div class="card" id="presupuestos"><h3>Presupuesto mensual por categoría</h3>
        <p>Deja vacío para no usar presupuesto. Se muestra en el Resumen y en los Reportes.</p>
        ${cats.map(c => `<div class="budget-row"><span class="tag dot" style="--c:${colorCat(c)}">${esc(c)}</span><input inputmode="numeric" data-pres="${esc(c)}" value="${state.presupuestos[c] ? Math.round(state.presupuestos[c]) : ''}" placeholder="Sin límite"></div>`).join('') || '<p class="muted">Aún no hay categorías.</p>'}
        <div class="btns"><button class="btn primary small" data-act="guardarPres">Guardar presupuestos</button></div>
      </div>
      <div class="card"><h3>Zona de peligro</h3>
        <p>Borra todos los datos de este navegador. Descarga antes una copia de seguridad.</p>
        <div class="btns"><button class="btn danger" data-act="borrarTodo">Borrar todos los datos</button></div>
      </div>
    </div>`;
  pintarListaRespaldos('#listaRespaldos');
}

/* ================= Respaldos ================= */
// Carpeta de respaldos con File System Access API (Chrome / Edge). El permiso se guarda
// en IndexedDB; el navegador vuelve a pedir confirmación en cada sesión nueva.
const SOPORTA_CARPETA = !!window.showDirectoryPicker;
let dirHandle = null, dirPermiso = 'none';
let tAuto = null;

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('finanzas-local', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function idbSet(k, v) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }

async function iniciarCarpeta() {
  if (!SOPORTA_CARPETA) return;
  try {
    dirHandle = (await idbGet('dirRespaldos')) || null;
    if (dirHandle) dirPermiso = await dirHandle.queryPermission({ mode: 'readwrite' });
  } catch (e) { dirHandle = null; }
  renderAll();
}
async function conectarCarpeta() {
  try {
    const h = await window.showDirectoryPicker({ id: 'respaldos-finanzas', mode: 'readwrite', startIn: 'documents' });
    dirHandle = h; dirPermiso = 'granted';
    await idbSet('dirRespaldos', h);
    state.meta.autoRespaldo = true; persistir();
    toast(`Carpeta conectada: ${h.name}`);
    if (movs().length) await respaldarEnCarpeta('manual'); else refrescarRespaldoUI();
  } catch (e) { if (e.name !== 'AbortError') toast('No se pudo conectar la carpeta: ' + e.message, 'error'); }
}
async function asegurarPermiso(pedir) {
  if (!dirHandle) return false;
  if (dirPermiso === 'granted') return true;
  if (!pedir) return false;
  try { dirPermiso = await dirHandle.requestPermission({ mode: 'readwrite' }); } catch (e) { dirPermiso = 'denied'; }
  refrescarRespaldoUI();
  return dirPermiso === 'granted';
}
async function permitirCarpeta() {
  if (await asegurarPermiso(true)) {
    toast('Permiso concedido: respaldo automático activo');
    if (state.meta.cambios > 0 && movs().length) respaldarEnCarpeta('auto');
  } else toast('Sin permiso para escribir en la carpeta', 'error');
}
function textoRespaldo() { return JSON.stringify({ ...state, meta: { ...state.meta, exportado: new Date().toISOString() } }, null, 2); }
function nombreRespaldo() { const d = new Date(); return `finanzas-respaldo_${hoyISO()}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.json`; }
function marcarRespaldado() { state.meta.ultimoRespaldo = new Date().toISOString(); state.meta.cambios = 0; persistir(); }
function refrescarRespaldoUI() { renderBanner(); if (tabActual === 'datos') renderDatos(); else if (!movs().length && tabActual === 'resumen') renderResumen(); }

async function respaldarEnCarpeta(tipo) {
  if (!movs().length) return false;
  if (!(await asegurarPermiso(tipo === 'manual'))) return false;
  const nombre = tipo === 'auto' ? `finanzas-respaldo_${hoyISO()}_auto.json` : nombreRespaldo();
  try {
    const fh = await dirHandle.getFileHandle(nombre, { create: true });
    const w = await fh.createWritable(); await w.write(textoRespaldo()); await w.close();
    marcarRespaldado();
    if (tipo === 'manual') toast(`Respaldo guardado: ${dirHandle.name}/${nombre}`);
    refrescarRespaldoUI();
    return true;
  } catch (e) {
    toast('No se pudo escribir el respaldo: ' + e.message, 'error');
    return false;
  }
}
function programarAuto() {
  if (!state.meta.autoRespaldo || !dirHandle || dirPermiso !== 'granted') return;
  clearTimeout(tAuto);
  tAuto = setTimeout(() => respaldarEnCarpeta('auto'), 1500);
}
async function exportarJson() {
  if (dirHandle && await respaldarEnCarpeta('manual')) return;
  const nombre = nombreRespaldo(), texto = textoRespaldo();
  let guardado = false;
  if (window.showSaveFilePicker) {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: nombre, types: [{ description: 'Respaldo de finanzas', accept: { 'application/json': ['.json'] } }] });
      const w = await h.createWritable(); await w.write(texto); await w.close(); guardado = true;
    } catch (e) { if (e.name === 'AbortError') return; }
  }
  if (!guardado) descargar(nombre, texto, 'application/json');
  marcarRespaldado(); renderAll(); toast('Copia de seguridad guardada');
}
async function pintarListaRespaldos(sel) {
  const cont = $(sel); if (!cont) return;
  if (!dirHandle) { cont.innerHTML = SOPORTA_CARPETA && movs().length ? '<p class="muted">Conecta la carpeta de respaldos para verlos aquí y restaurarlos con un clic.</p>' : ''; return; }
  if (dirPermiso !== 'granted') { cont.innerHTML = `<p class="muted">Da permiso a la carpeta <b>${esc(dirHandle.name)}</b> para ver los respaldos.</p><button class="btn small" data-act="permitirCarpeta">Dar permiso</button>`; return; }
  try {
    const lista = [];
    for await (const [nombre, h] of dirHandle.entries()) {
      if (h.kind === 'file' && /\.json$/i.test(nombre)) { const f = await h.getFile(); lista.push({ nombre, fecha: f.lastModified, kb: Math.round(f.size / 1024) }); }
    }
    lista.sort((a, b) => b.fecha - a.fecha);
    pintarListaRespaldos.cache = lista;
    cont.innerHTML = lista.length
      ? `<ul class="list-plain">${lista.slice(0, 12).map(r => `<li><span>${esc(r.nombre)}<br><small>${new Date(r.fecha).toLocaleString('es-CO')} · ${r.kb} KB</small></span><button class="btn small" data-restaurar="${esc(r.nombre)}">Restaurar</button></li>`).join('')}</ul>${lista.length > 12 ? `<p class="muted" style="font-size:12.5px">y ${lista.length - 12} más en la carpeta.</p>` : ''}`
      : '<p class="muted">La carpeta aún no tiene respaldos.</p>';
  } catch (e) { cont.innerHTML = `<p class="muted">No se pudo leer la carpeta: ${esc(e.message)}</p>`; }
}
async function restaurarDeCarpeta(nombre) {
  try {
    const fh = await dirHandle.getFileHandle(nombre);
    importarJsonTexto(await (await fh.getFile()).text(), nombre);
  } catch (e) { toast('No se pudo abrir el respaldo: ' + e.message, 'error'); }
}
function guardarPrevio() { try { localStorage.setItem(KEY_PREV, JSON.stringify(state)); } catch (e) { /* sin espacio */ } }
function aplicarImport(lista, modo, extra = {}) {
  guardarPrevio();
  if (modo === 'reemplazar') {
    state.movimientos = lista;
    if (Array.isArray(extra.tarjetas)) state.tarjetas = extra.tarjetas.map(sanearTarjeta);
    if (extra.hogar) state.hogar = sanearHogar(extra.hogar);
    if (extra.presupuestos) state.presupuestos = extra.presupuestos;
  } else {
    const ids = new Map(state.movimientos.map((m, i) => [m.id, i]));
    lista.forEach(m => { if (ids.has(m.id)) state.movimientos[ids.get(m.id)] = m; else state.movimientos.push(m); });
    if (extra.presupuestos) state.presupuestos = { ...state.presupuestos, ...extra.presupuestos };
  }
  if (modo !== 'reemplazar' && Array.isArray(extra.tarjetas)) extra.tarjetas.map(sanearTarjeta).forEach(t => { if (!tarjetaDe(t.nombre)) tarjetas().push(t); });
  aplicarMigraciones();
  commit(`Importados ${lista.length} movimientos`);
}
function importarJsonTexto(texto, nombreArchivo) {
  let obj;
  try { obj = JSON.parse(texto); } catch (e) { return toast('El archivo no es un JSON válido', 'error'); }
  if (!obj || !Array.isArray(obj.movimientos)) return toast('El archivo no es una copia de seguridad de esta app', 'error');
  const lista = obj.movimientos.map(sanear);
  const exp = obj.meta?.exportado ? new Date(obj.meta.exportado).toLocaleString('es-CO') : 'desconocida';
  const meses = lista.map(m => m.mes).filter(Boolean).sort();
  mensaje('Importar copia de seguridad', `<p><b>${esc(nombreArchivo)}</b><br>Creada: ${exp}<br>${lista.length} movimientos${meses.length ? ` · ${mesLabel(meses[0])} a ${mesLabel(meses[meses.length - 1])}` : ''}</p>
    <p class="muted">Ahora tienes ${movs().length} movimientos. <b>Reemplazar</b> deja exactamente lo de la copia. <b>Combinar</b> agrega lo nuevo y actualiza lo que coincida.</p>`,
    [['Cancelar', 'ghost'], ['Combinar', '', () => aplicarImport(lista, 'combinar', obj)], ['Reemplazar todo', 'primary', () => {
      aplicarImport(lista, 'reemplazar', obj);
      // Lo que hay ahora es idéntico a la copia: cuenta como respaldado
      state.meta.ultimoRespaldo = obj.meta?.exportado || new Date().toISOString(); state.meta.cambios = 0;
      clearTimeout(tAuto); persistir(); renderBanner(); if (tabActual === 'datos') renderDatos();
    }]]);
}

/* ================= Servicios del hogar ================= */
// Facturas de servicios (energía, agua, gas, internet…) repartidas por porcentaje entre las personas del hogar.
// Quien paga la factura (el "pagador", por defecto Miguel) cobra a los demás su parte.
// Un "cargo no compartido" (p. ej. el crédito que viene en la factura del gas) no se reparte.
function hogarVacio() { return { personas: [], pagador: TITULAR, servicios: [], facturas: [] }; }
function hogar() { return state.hogar || (state.hogar = hogarVacio()); }
function sanearReparto(r) {
  const o = {};
  Object.entries(r || {}).forEach(([k, v]) => { const n = Number(v); if (String(k).trim() && n > 0) o[cap(k)] = n; });
  return o;
}
function sanearFactura(f) {
  return {
    id: String(f.id || uid()), servicio: cap(f.servicio || ''), mes: parseMesTexto(f.mes) || '',
    total: Math.abs(parseNum(f.total)), cargos: Math.abs(parseNum(f.cargos)), cargosNota: String(f.cargosNota || ''),
    vence: parseFecha(f.vence) || '', pagada: !!f.pagada, reparto: sanearReparto(f.reparto),
    pagos: Object.fromEntries(Object.entries(f.pagos || {}).map(([k, v]) => [cap(k), !!v])), notas: String(f.notas || ''),
  };
}
function sanearHogar(h) {
  h = h || {};
  return {
    personas: [...new Set((h.personas || []).map(cap).filter(Boolean))],
    pagador: cap(h.pagador) || TITULAR,
    servicios: (h.servicios || []).map(s => ({ nombre: cap(s.nombre), reparto: sanearReparto(s.reparto) })).filter(s => s.nombre),
    facturas: (h.facturas || []).map(sanearFactura).filter(f => f.servicio && f.mes),
  };
}
const repartible = f => Math.max(0, f.total - f.cargos);
const parteDe = (f, p) => repartible(f) * (f.reparto[p] || 0) / 100;
const partePagada = (f, p) => p === hogar().pagador || !!f.pagos[p];
const ORDEN_SERV = s => { const i = hogar().servicios.findIndex(x => x.nombre === s); return i < 0 ? 99 : i; };
const porServicio = (a, b) => ORDEN_SERV(a.servicio) - ORDEN_SERV(b.servicio) || a.servicio.localeCompare(b.servicio, 'es');

// Datos del Excel "Cuentas servicio.xlsx" (Hoja1 y Hoja2)
function hogarInicial() {
  const P = ['Omar', 'Miguel', 'Marta'];
  const r50 = { Omar: 50, Miguel: 25, Marta: 25 }, r3 = { Omar: 100 / 3, Miguel: 100 / 3, Marta: 100 / 3 };
  const f = (servicio, mes, total, reparto, extra = {}) => sanearFactura({ servicio, mes, total, reparto, pagada: mes < '2026-09', ...extra });
  const gas = (mes, total, credito, reparto) => f('Gas', mes, total, reparto, { cargos: credito, cargosNota: 'Crédito en la factura del gas' });
  const facturas = [
    f('Energía', '2026-07', 435940, r50), f('Agua', '2026-07', 69331, r3), gas('2026-07', 192662, 175262, r3), f('Internet', '2026-07', 65000, r3),
    f('Energía', '2026-08', 469640, r50), f('Agua', '2026-08', 63781, r50), gas('2026-08', 193130, 175662, r50), f('Internet', '2026-08', 65000, r50),
    f('Energía', '2026-09', 438640, r50), f('Agua', '2026-09', 66906, r50), gas('2026-09', 194155, 175200, r50), f('Internet', '2026-09', 65000, r50),
  ];
  // Hoja2: Omar ya pagó los servicios de agosto
  facturas.filter(x => x.mes === '2026-08').forEach(x => (x.pagos.Omar = true));
  return {
    personas: P, pagador: TITULAR, facturas,
    servicios: ['Energía', 'Agua', 'Gas', 'Internet'].map(nombre => ({ nombre, reparto: { ...r50 } })),
  };
}

// Filas "virtuales" para la ventana de detalle
const filaServ = (f, p) => ({
  _serv: true, id: 'sv-' + f.id + (p ? '-' + p : ''), mes: f.mes, fecha: f.vence, nombre: f.servicio + (p ? ` · ${Math.round((f.reparto[p] || 0) * 100) / 100}%` : ''),
  categoria: 'Servicios hogar', cuenta: p ? '' : (f.pagada ? 'Pagada' : 'Sin pagar'), persona: p || '', cuotas: 1, cuota: 1,
  valor: -(p ? parteDe(f, p) : f.total), interes: 0, grupo: '', notas: f.cargos && !p ? `${f.cargosNota || 'No compartido'}: ${money(f.cargos)}` : '',
});
const detServ = (titulo, lista, p, sub) => det(titulo, () => lista().map(f => { const m = filaServ(f, p); return { m, v: -m.valor }; }), sub);

let mesServ = null;
function renderServicios() {
  const H = hogar(), F = H.facturas, hoy = ymNow();
  const cont = $('#serviciosBody');
  const meses = [...new Set(F.map(f => f.mes))].sort();
  if (!mesServ) mesServ = meses.includes(hoy) ? hoy : (meses[meses.length - 1] || hoy);
  const otros = H.personas.filter(p => p !== H.pagador);
  const FM = F.filter(f => f.mes === mesServ).sort(porServicio);
  const pend = (p, lista = F) => lista.filter(f => parteDe(f, p) >= 0.5 && !partePagada(f, p));
  const totalPend = sum(otros, p => sum(pend(p), f => parteDe(f, p)));
  const sinPagar = F.filter(f => !f.pagada);
  const pct = n => (Math.round(n * 100) / 100).toLocaleString('es-CO');
  const m$ = v => money(v).replace(',00', '');

  if (!H.personas.length) {
    cont.innerHTML = `<div class="card empty"><h2>Servicios del hogar</h2><p>Configura las personas del hogar y los servicios para empezar.</p><div class="btns"><button class="btn primary" data-act="svConfig">Configurar</button></div></div>`;
    return;
  }

  // Estado de cuenta por persona: solo servicios (los préstamos se manejan en su propia pestaña)
  const estadoCuenta = p => {
    const porMes = [...new Set(F.filter(f => parteDe(f, p) >= 0.5).map(f => f.mes))].sort();
    const filasMes = porMes.map(ym => {
      const L = F.filter(f => f.mes === ym && parteDe(f, p) >= 0.5);
      const v = sum(L, f => parteDe(f, p)), pagado = L.every(f => partePagada(f, p));
      return `<li class="${pagado ? 'pagado' : ''}"><span><span class="det" ${detServ(`Servicios ${mesLabel(ym, true)} · parte de ${p}`, () => L, p)}>Servicios ${mesLabel(ym, true)}</span></span>
        <span>${m$(v)} ${pagado ? `<span class="tag ok">pagado</span> <button class="btn ghost small" data-svmes="${esc(p)}|${ym}|0" title="Marcar como pendiente">↺</button>` : `<button class="btn small" data-svmes="${esc(p)}|${ym}|1">Marcar pagado</button>`}</span></li>`;
    });
    const servPend = sum(pend(p), f => parteDe(f, p));
    return `<div class="card">
      <div class="section-title"><h3>${esc(p)}</h3><small class="muted">debe a ${esc(H.pagador)}</small></div>
      <ul class="list-plain estado-cuenta">${filasMes.join('') || '<li class="muted">Sin servicios registrados.</li>'}</ul>
      <div class="ec-total"><span class="grande">Servicios por pagar <b class="loan det" ${detServ(`Servicios pendientes · ${p}`, () => pend(p), p)}>${m$(servPend)}</b></span></div>
    </div>`;
  };

  // Resumen por mes (como la tabla de la Hoja1)
  const resumen = meses.map(ym => {
    const L = F.filter(f => f.mes === ym);
    return `<tr><td>${mesLabel(ym, true)}</td>${H.personas.map(p => { const v = sum(L, f => parteDe(f, p)); return `<td class="num">${v ? `<span class="det" ${detServ(`${p} · servicios ${mesLabel(ym, true)}`, () => L, p)}>${m$(v)}</span>${p !== H.pagador ? (L.every(f => partePagada(f, p)) ? ' <span class="dot-ok" title="Pagado">●</span>' : ' <span class="dot-pend" title="Pendiente">●</span>') : ''}` : '—'}</td>`; }).join('')}
      <td class="num"><b class="det" ${detServ(`Servicios ${mesLabel(ym, true)} · a repartir`, () => L.map(f => ({ ...f, total: repartible(f) })))}>${m$(sum(L, repartible))}</b></td>
      <td class="num muted">${sum(L, f => f.cargos) ? m$(sum(L, f => f.cargos)) : '—'}</td>
      <td class="num"><span class="det" ${detServ(`Facturas ${mesLabel(ym, true)}`, () => L)}>${m$(sum(L, f => f.total))}</span></td></tr>`;
  }).join('');

  // Histórico por servicio
  const nombresServ = [...new Set([...H.servicios.map(s => s.nombre), ...F.map(f => f.servicio)])];
  const ultimos = meses.slice(-6);
  const historico = nombresServ.map(s => {
    const vals = ultimos.map(ym => sum(F.filter(f => f.servicio === s && f.mes === ym), repartible));
    const conDato = vals.filter(Boolean), prom = conDato.length ? sum(conDato, v => v) / conDato.length : 0;
    const [a, b] = vals.slice(-2), varia = a && b ? (b - a) / a * 100 : null;
    return `<tr><td>${esc(s)}</td>${vals.map((v, i) => `<td class="num">${v ? `<span class="det" ${detServ(`${s} · ${mesLabel(ultimos[i], true)}`, () => F.filter(f => f.servicio === s && f.mes === ultimos[i]))}>${m$(v)}</span>` : '—'}</td>`).join('')}<td class="num">${m$(prom)}</td><td class="num ${varia == null ? 'muted' : varia > 0 ? 'neg' : 'pos'}">${varia == null ? '—' : (varia > 0 ? '▲ ' : '▼ ') + Math.abs(varia).toFixed(1) + '%'}</td></tr>`;
  }).join('');

  const totMes = sum(FM, f => f.total);
  cont.innerHTML = `
    <div class="toolbar">
      <label>Mes <select id="svMes">${[...new Set([...meses, hoy])].sort().map(m => `<option value="${m}" ${m === mesServ ? 'selected' : ''}>${mesLabel(m, true)}</option>`).join('')}</select></label>
      <button class="btn ghost small" data-act="svMesPrev">‹</button><button class="btn ghost small" data-act="svMesNext">›</button>
      <span class="spacer"></span>
      <button class="btn small" data-act="svConfig">Configurar</button>
      <button class="btn small" data-act="svFactura">+ Factura</button>
      <button class="btn small primary" data-act="svNuevoMes">+ Registrar mes</button>
    </div>
    <div class="grid-cards">
      <div class="card kpi"><div class="label">Servicios de ${mesLabel(mesServ, true)}</div><div class="value det" ${detServ(`Facturas ${mesLabel(mesServ, true)}`, () => FM)}>${m$(totMes)}</div><div class="hint">${FM.length} factura(s)${sum(FM, f => f.cargos) ? ` · ${m$(sum(FM, f => f.cargos))} no compartido` : ''}</div></div>
      <div class="card kpi"><div class="label">Parte de ${esc(H.pagador)} (${mesLabel(mesServ)})</div><div class="value neg det" ${detServ(`${H.pagador} · servicios ${mesLabel(mesServ, true)}`, () => FM, H.pagador)}>${m$(sum(FM, f => parteDe(f, H.pagador)))}</div><div class="hint">Lo que te corresponde pagar</div></div>
      <div class="card kpi"><div class="label">Te deben de servicios</div><div class="value loan det" ${det('Servicios pendientes de cobro', () => otros.flatMap(p => pend(p).map(f => { const m = filaServ(f, p); return { m, v: -m.valor }; })))}>${m$(totalPend)}</div><div class="hint">${otros.map(p => `${esc(p)} ${m$(sum(pend(p), f => parteDe(f, p)))}`).join(' · ')}</div></div>
      <div class="card kpi"><div class="label">Facturas sin pagar</div><div class="value ${sinPagar.length ? 'neg' : ''} det" ${detServ('Facturas sin pagar a la empresa', () => sinPagar)}>${m$(sum(sinPagar, f => f.total))}</div><div class="hint">${sinPagar.length} factura(s) por pagar a la empresa</div></div>
    </div>

    <div class="card" style="margin-bottom:18px">
      <div class="section-title"><h3>Facturas de ${mesLabel(mesServ, true)}</h3><small class="muted">Marca quién ya pagó su parte</small></div>
      <div class="table-wrap"><table class="grid"><thead><tr><th>Servicio</th><th class="num">Factura</th><th class="num">No compartido</th><th class="num">A repartir</th>${H.personas.map(p => `<th class="num">${esc(p)}${p === H.pagador ? ' <small class="muted">(paga)</small>' : ''}</th>`).join('')}<th>Factura pagada</th><th></th></tr></thead>
      <tbody>${FM.map(f => `<tr>
        <td><b>${esc(f.servicio)}</b>${f.vence ? `<br><small class="muted">vence ${fechaLabel(f.vence)}</small>` : ''}${f.notas ? `<br><small class="muted">${esc(f.notas)}</small>` : ''}</td>
        <td class="num">${m$(f.total)}</td>
        <td class="num">${f.cargos ? `${m$(f.cargos)}<br><small class="muted">${esc(f.cargosNota || '')}</small>` : '<span class="muted">—</span>'}</td>
        <td class="num"><b>${m$(repartible(f))}</b></td>
        ${H.personas.map(p => { const v = parteDe(f, p); if (v < 0.5) return '<td class="num muted">—</td>'; return `<td class="num">${m$(v)}<br><small class="muted">${pct(f.reparto[p])}%</small>${p === H.pagador ? '' : `<br><label class="chk mini"><input type="checkbox" data-svpago="${f.id}|${esc(p)}" ${f.pagos[p] ? 'checked' : ''}> ${f.pagos[p] ? 'pagó' : 'debe'}</label>`}</td>`; }).join('')}
        <td><label class="chk"><input type="checkbox" data-svpagada="${f.id}" ${f.pagada ? 'checked' : ''}> ${f.pagada ? '<span class="tag ok">pagada</span>' : '<span class="tag pend">por pagar</span>'}</label></td>
        <td><div class="acts"><button data-act="svEditar" data-id="${f.id}" title="Editar">✎</button><button data-act="svBorrar" data-id="${f.id}" title="Eliminar">✕</button></div></td></tr>`).join('') || `<tr><td colspan="${6 + H.personas.length}" class="muted" style="text-align:center;padding:24px">No hay facturas en ${mesLabel(mesServ, true)}. Usa “+ Registrar mes”.</td></tr>`}</tbody>
      ${FM.length ? `<tfoot><tr><td>Total</td><td class="num">${m$(totMes)}</td><td class="num">${m$(sum(FM, f => f.cargos))}</td><td class="num">${m$(sum(FM, repartible))}</td>${H.personas.map(p => `<td class="num">${m$(sum(FM, f => parteDe(f, p)))}</td>`).join('')}<td colspan="2"></td></tr></tfoot>` : ''}</table></div>
    </div>

    <h3 style="margin:0 0 10px">Estado de cuenta</h3>
    <div class="two-col">${otros.map(estadoCuenta).join('')}</div>

    <div class="card" style="margin-bottom:18px"><h3>Resumen por mes</h3>
      <div class="table-wrap"><table class="grid"><thead><tr><th>Mes</th>${H.personas.map(p => `<th class="num">${esc(p)}</th>`).join('')}<th class="num">A repartir</th><th class="num">No compartido</th><th class="num">Facturas</th></tr></thead>
      <tbody>${resumen || '<tr><td colspan="9" class="muted">Sin datos.</td></tr>'}</tbody></table></div>
      <p class="muted" style="font-size:12.5px"><span class="dot-ok">●</span> pagado · <span class="dot-pend">●</span> pendiente</p>
    </div>

    <div class="card"><h3>Histórico por servicio <small class="muted">(valor a repartir)</small></h3>
      <div class="table-wrap"><table class="grid"><thead><tr><th>Servicio</th>${ultimos.map(m => `<th class="num">${mesLabel(m)}</th>`).join('')}<th class="num">Promedio</th><th class="num">Último cambio</th></tr></thead>
      <tbody>${historico}</tbody></table></div>
    </div>`;
}

// ---- Formularios ----
function formFactura(f) {
  const H = hogar(), nuevo = !f;
  f = f || { servicio: '', mes: mesServ || ymNow(), total: '', cargos: '', cargosNota: '', vence: '', pagada: false, reparto: {}, pagos: {}, notas: '' };
  const rep = Object.keys(f.reparto).length ? f.reparto : (H.servicios[0]?.reparto || {});
  mensaje(nuevo ? 'Nueva factura' : `Editar factura · ${f.servicio}`, `
    <div class="form-grid" id="svForm" data-id="${f.id || ''}">
      <label>Servicio <input id="svServ" list="dlServicios" value="${esc(f.servicio)}" required><datalist id="dlServicios">${H.servicios.map(s => `<option value="${esc(s.nombre)}">`).join('')}</datalist></label>
      <label>Mes <input type="month" id="svFMes" value="${f.mes}"></label>
      <label>Valor total de la factura <input id="svTotal" inputmode="decimal" value="${f.total ? Math.round(f.total).toLocaleString('es-CO') : ''}"></label>
      <label>Vence <input type="date" id="svVence" value="${f.vence}"></label>
      <label>Cargo no compartido <input id="svCargos" inputmode="decimal" value="${f.cargos ? Math.round(f.cargos).toLocaleString('es-CO') : ''}" placeholder="Ej. crédito en la factura"></label>
      <label>¿Qué es? <input id="svCargosNota" value="${esc(f.cargosNota)}" placeholder="Crédito, seguro…"></label>
      <fieldset class="span2"><legend>Reparto (%) <button type="button" class="btn ghost small" data-act="svIguales">Partes iguales</button></legend>
        <div class="reparto-grid">${H.personas.map(p => `<label>${esc(p)} <input data-pct="${esc(p)}" inputmode="decimal" value="${rep[p] ? pct2(rep[p]) : ''}"></label>`).join('')}</div>
        <p class="preview" id="svPrev"></p>
      </fieldset>
      <label class="chk span2"><input type="checkbox" id="svPagada" ${f.pagada ? 'checked' : ''}> La factura ya se pagó a la empresa</label>
      ${H.personas.filter(p => p !== H.pagador).map(p => `<label class="chk"><input type="checkbox" data-svya="${esc(p)}" ${f.pagos[p] ? 'checked' : ''}> ${esc(p)} ya pagó su parte</label>`).join('')}
      <label class="span2">Notas <input id="svNotas" value="${esc(f.notas)}"></label>
    </div>`, [['Cancelar', 'ghost'], [nuevo ? 'Registrar' : 'Guardar', 'primary', () => guardarFactura(f.id)]]);
  // Al elegir un servicio conocido se propone su reparto habitual
  $('#svServ').addEventListener('change', e => {
    const s = H.servicios.find(x => x.nombre.toLowerCase() === e.target.value.trim().toLowerCase());
    if (s && nuevo) $$('[data-pct]').forEach(i => (i.value = s.reparto[i.dataset.pct] ? pct2(s.reparto[i.dataset.pct]) : ''));
    previewFactura();
  });
  previewFactura();
}
const pct2 = n => String(Math.round(n * 100) / 100).replace('.', ',');
function leerReparto() {
  const r = {};
  $$('[data-pct]').forEach(i => { const v = parseNum(i.value); if (v > 0) r[i.dataset.pct] = v; });
  // Si suman ~100 con tercios redondeados (33,33 ×3) se normaliza para que el reparto sea exacto
  const s = sum(Object.values(r), v => v);
  if (s && Math.abs(s - 100) <= 0.05) Object.keys(r).forEach(k => (r[k] = r[k] * 100 / s));
  return { r, s };
}
function previewFactura() {
  const prev = $('#svPrev'); if (!prev) return;
  const total = Math.abs(parseNum($('#svTotal').value)), cargos = Math.abs(parseNum($('#svCargos').value));
  const { r, s } = leerReparto(), base = Math.max(0, total - cargos);
  prev.innerHTML = `${Math.abs(s - 100) > 0.05 ? `<b class="neg">El reparto suma ${pct2(s)}%, debe sumar 100%.</b><br>` : ''}A repartir: <b>${money(base)}</b>${Object.keys(r).length ? ' → ' + Object.entries(r).map(([p, v]) => `${esc(p)} ${money(base * v / 100)}`).join(' · ') : ''}`;
}
function guardarFactura(id) {
  const H = hogar();
  const servicio = cap($('#svServ').value), mes = $('#svFMes').value, total = Math.abs(parseNum($('#svTotal').value));
  const { r, s } = leerReparto();
  if (!servicio || !mes || !total) { toast('Falta el servicio, el mes o el valor', 'error'); return false; }
  if (Math.abs(s - 100) > 0.05) { toast(`El reparto suma ${pct2(s)}%; debe sumar 100%`, 'error'); return false; }
  const pagos = {}; $$('[data-svya]').forEach(i => { if (i.checked) pagos[i.dataset.svya] = true; });
  const datos = sanearFactura({ id: id || uid(), servicio, mes, total, cargos: $('#svCargos').value, cargosNota: $('#svCargosNota').value, vence: $('#svVence').value, pagada: $('#svPagada').checked, reparto: r, pagos, notas: $('#svNotas').value });
  const i = H.facturas.findIndex(f => f.id === datos.id);
  if (i >= 0) H.facturas[i] = datos; else H.facturas.push(datos);
  recordarServicio(servicio, r);
  mesServ = mes;
  commit(i >= 0 ? 'Factura actualizada' : `Factura de ${servicio} registrada`);
}
function recordarServicio(nombre, reparto) {
  const H = hogar(), s = H.servicios.find(x => x.nombre.toLowerCase() === nombre.toLowerCase());
  if (s) s.reparto = { ...reparto }; else H.servicios.push({ nombre, reparto: { ...reparto } });
}
function formNuevoMes() {
  const H = hogar();
  const ultimoMes = [...new Set(H.facturas.map(f => f.mes))].sort().pop();
  const sig = ultimoMes ? addM(ultimoMes, 1) : ymNow();
  const ultima = s => H.facturas.filter(f => f.servicio === s).sort((a, b) => b.mes.localeCompare(a.mes))[0];
  mensaje('Registrar servicios del mes', `
    <label>Mes <input type="month" id="svNMes" value="${sig}"></label>
    <div class="table-wrap" style="margin-top:12px"><table class="grid"><thead><tr><th>Servicio</th><th class="num">Valor factura</th><th class="num">No compartido</th><th>Reparto</th></tr></thead><tbody>
    ${H.servicios.map((s, i) => { const u = ultima(s.nombre); return `<tr><td><b>${esc(s.nombre)}</b>${u ? `<br><small class="muted">anterior ${money(u.total)}</small>` : ''}</td>
      <td class="num"><input data-nm="${i}" data-campo="total" inputmode="decimal" style="width:130px" placeholder="0"></td>
      <td class="num"><input data-nm="${i}" data-campo="cargos" inputmode="decimal" style="width:120px" placeholder="${u?.cargos ? Math.round(u.cargos).toLocaleString('es-CO') : '0'}" title="${esc(u?.cargosNota || '')}"></td>
      <td><small>${Object.entries(s.reparto).map(([p, v]) => `${esc(p)} ${pct2(v)}%`).join(' · ') || '<span class="neg">sin reparto</span>'}</small></td></tr>`; }).join('')}
    </tbody></table></div>
    <label class="chk" style="margin-top:10px"><input type="checkbox" id="svNPagada"> Ya pagué estas facturas a la empresa</label>
    <p class="muted" style="font-size:12.5px">Se usa el reparto habitual de cada servicio. Para cambiarlo en una factura, edítala después con ✎. Los servicios sin valor no se registran.</p>`,
    [['Cancelar', 'ghost'], ['Registrar', 'primary', () => {
      const mes = $('#svNMes').value; if (!mes) { toast('Elige el mes', 'error'); return false; }
      let n = 0;
      H.servicios.forEach((s, i) => {
        const total = Math.abs(parseNum($(`[data-nm="${i}"][data-campo="total"]`).value)); if (!total) return;
        const u = ultima(s.nombre);
        const cargosTxt = $(`[data-nm="${i}"][data-campo="cargos"]`).value;
        const datos = sanearFactura({ servicio: s.nombre, mes, total, cargos: cargosTxt, cargosNota: parseNum(cargosTxt) ? (u?.cargosNota || '') : '', reparto: s.reparto, pagada: $('#svNPagada').checked });
        const ex = H.facturas.findIndex(f => f.servicio === s.nombre && f.mes === mes);
        if (ex >= 0) H.facturas[ex] = { ...datos, id: H.facturas[ex].id, pagos: H.facturas[ex].pagos }; else H.facturas.push(datos);
        n++;
      });
      if (!n) { toast('No escribiste ningún valor', 'error'); return false; }
      mesServ = mes; commit(`${n} factura(s) de ${mesLabel(mes, true)} registradas`);
    }]]);
}
function formConfigHogar() {
  const H = hogar();
  mensaje('Configurar servicios del hogar', `
    <div class="form-grid">
      <label class="span2">Personas del hogar <input id="cfPersonas" value="${esc(H.personas.join(', '))}" placeholder="Omar, Miguel, Marta"><small>Separadas por coma</small></label>
      <label>Quién paga las facturas <input id="cfPagador" value="${esc(H.pagador)}"></label>
      <label>Servicios <input id="cfServicios" value="${esc(H.servicios.map(s => s.nombre).join(', '))}"><small>Separados por coma, en el orden en que quieres verlos</small></label>
    </div>`, [['Cancelar', 'ghost'], ['Guardar', 'primary', () => {
      const personas = $('#cfPersonas').value.split(',').map(cap).filter(Boolean);
      const nombres = $('#cfServicios').value.split(',').map(cap).filter(Boolean);
      if (!personas.length) { toast('Escribe al menos una persona', 'error'); return false; }
      H.personas = [...new Set(personas)];
      H.pagador = cap($('#cfPagador').value) || TITULAR;
      if (!H.personas.includes(H.pagador)) H.personas.unshift(H.pagador);
      H.servicios = nombres.map(n => H.servicios.find(s => s.nombre === n) || { nombre: n, reparto: Object.fromEntries(H.personas.map(p => [p, 100 / H.personas.length])) });
      commit('Configuración guardada');
    }]]);
}
const accionesServicios = {
  svFactura: () => formFactura(null),
  svEditar: el => { const f = hogar().facturas.find(x => x.id === el.dataset.id); if (f) formFactura(JSON.parse(JSON.stringify(f))); },
  svBorrar: el => { const H = hogar(), f = H.facturas.find(x => x.id === el.dataset.id); if (!f) return; confirmar('Eliminar factura', `<p>¿Eliminar la factura de <b>${esc(f.servicio)}</b> de ${mesLabel(f.mes, true)} (${money(f.total)})?</p>`, 'Eliminar', () => { H.facturas = H.facturas.filter(x => x.id !== f.id); commit('Factura eliminada'); }, true); },
  svNuevoMes: formNuevoMes,
  svConfig: formConfigHogar,
  svIguales: () => { const I = $$('[data-pct]'); I.forEach(i => (i.value = pct2(100 / I.length))); previewFactura(); },
  svMesPrev: () => { mesServ = addM(mesServ || ymNow(), -1); renderServicios(); },
  svMesNext: () => { mesServ = addM(mesServ || ymNow(), 1); renderServicios(); },
};
document.addEventListener('input', e => { if (e.target.closest('#svForm')) previewFactura(); });
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'svMes') { mesServ = t.value; renderServicios(); }
  else if (t.dataset.svpago) { const [id, p] = t.dataset.svpago.split('|'); const f = hogar().facturas.find(x => x.id === id); if (f) { f.pagos[p] = t.checked; commit(t.checked ? `${p} pagó ${f.servicio}` : `${f.servicio}: ${p} queda debiendo`); } }
  else if (t.dataset.svpagada) { const f = hogar().facturas.find(x => x.id === t.dataset.svpagada); if (f) { f.pagada = t.checked; commit(t.checked ? `Factura de ${f.servicio} pagada` : `Factura de ${f.servicio} por pagar`); } }
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-svmes]'); if (!b) return;
  const [p, ym, v] = b.dataset.svmes.split('|');
  hogar().facturas.filter(f => f.mes === ym).forEach(f => (f.pagos[p] = v === '1'));
  commit(v === '1' ? `${p}: servicios de ${mesLabel(ym, true)} pagados` : `${p}: servicios de ${mesLabel(ym, true)} pendientes`);
});

/* ================= Detalle de valores agrupados ================= */
// Cada valor agrupado de la app lleva data-det="<id>". El id apunta a una función que devuelve
// los movimientos que lo componen ({ m, v }), donde v es lo que aporta cada uno al total mostrado.
const detReg = new Map();
let detN = 0, detActual = null;
function det(titulo, items, sub = '') {
  if (detReg.size > 4000) detReg.clear();
  const id = 'd' + (++detN);
  detReg.set(id, { titulo, items, sub });
  return `data-det="${id}"`;
}
// Atajo: lista de movimientos + función de valor
const itemsDe = (L, f = m => m.valor) => () => (typeof L === 'function' ? L() : L).map(m => ({ m, v: f(m) }));
// Consultas de detalle. `sel` es un mes (AAAA-MM) o una función que decide si un mes entra.
const enSel = (sel, ym) => typeof sel === 'function' ? sel(ym) : sel === ym;
const entre = (a, b) => ym => ym >= a && ym <= b;
const Q = {
  ing: sel => itemsDe(() => movs().filter(m => enSel(sel, m.mes) && !esPrest(m) && m.valor > 0)),
  gas: (sel, cat) => itemsDe(() => movs().filter(m => enSel(sel, m.mes) && !esPrest(m) && m.valor < 0 && (!cat || m.categoria === cat)), m => -m.valor),
  pSal: sel => itemsDe(() => movs().filter(m => enSel(sel, m.mes) && esPrestamo(m)), m => -m.valor),
  pRe: sel => itemsDe(() => movs().filter(m => esPrestamo(m) && enSel(sel, m.mesCobro)), m => Math.abs(m.valor)),
  porCobrar: sel => itemsDe(() => movs().filter(m => esPrestamo(m) && enSel(sel, m.mesCobro) && !cobrada(m)), porCobrarDe),
  neto: sel => () => [...Q.ing(sel)(), ...Q.gas(sel)().map(x => ({ ...x, v: -x.v })), ...Q.pSal(sel)().map(x => ({ ...x, v: -x.v })), ...Q.pRe(sel)()],
  sale: (sel, filtro = () => true) => itemsDe(() => movs().filter(m => enSel(sel, m.mes) && m.valor < 0 && filtro(m)), m => -m.valor),
  tc: (cta, sel) => itemsDe(() => movs().filter(m => m.cuenta === cta && enSel(sel, m.mes) && m.valor < 0), m => -m.valor),
};
function abrirDetalle(id) {
  const d = detReg.get(id); if (!d) return;
  detActual = d; pintarDetalle();
  if (!$('#dlgDetalle').open) $('#dlgDetalle').showModal();
}
function pintarDetalle() {
  const d = detActual; if (!d) return;
  const lista = d.items().filter(x => Math.abs(x.v) >= 0.5)
    .sort((a, b) => a.m.mes.localeCompare(b.m.mes) || (a.m.fecha || '').localeCompare(b.m.fecha || '') || a.m.nombre.localeCompare(b.m.nombre, 'es'));
  const total = sum(lista, x => x.v), interes = sum(lista, x => x.m.interes && Math.abs(x.v) >= Math.abs(x.m.valor) - 1 ? x.m.interes : 0);
  const agrupa = key => {
    const mp = new Map();
    lista.forEach(x => { const k = key(x.m) || '—'; mp.set(k, (mp.get(k) || 0) + x.v); });
    return [...mp].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  };
  const chips = (tit, pares) => pares.length > 1 ? `<div class="det-grupo"><small class="muted">${tit}:</small> ${pares.map(([k, v]) => `<span class="tag">${esc(k)} <b>${money(v)}</b></span>`).join(' ')}</div>` : '';
  const quien = m => m._serv ? (m.persona ? esc(m.persona) : '<span class="muted">—</span>') : esPrest(m) ? (m.persona || '<span class="neg">sin asignar</span>') : `<span class="muted">${TITULAR}</span>`;
  $('#dTitulo').textContent = d.titulo;
  $('#dCuerpo').innerHTML = `
    ${d.sub ? `<p class="muted" style="margin:0">${d.sub}</p>` : ''}
    <div class="mini-kpis">
      <div><small>Total</small><b class="${total < 0 ? 'neg' : ''}">${money(total)}</b></div>
      <div><small>Movimientos</small><b>${lista.length}</b></div>
      ${interes >= 1 ? `<div><small>Capital / intereses</small><b>${money(total - interes)}</b><small class="neg">+ ${money(interes)} de intereses</small></div>` : ''}
    </div>
    ${chips('Por categoría', agrupa(m => m.categoria))}
    ${chips('Por cuenta', agrupa(m => m.cuenta))}
    <div class="table-wrap" style="max-height:55vh;overflow:auto"><table class="grid"><thead><tr><th>Mes</th><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Cuenta</th><th>Persona</th><th class="num">Valor</th><th></th></tr></thead>
      <tbody>${lista.map(({ m, v }) => `<tr>
        <td>${mesLabel(m.mes)}</td><td>${fechaLabel(m.fecha)}</td>
        <td class="nombre">${esc(m.nombre)}${m.cuotas > 1 ? ` <small class="muted">cuota ${m.cuota}/${m.cuotas}</small>` : ''}${m.interes ? ` <small class="muted">· int. ${money(m.interes)}</small>` : ''}${m.notas ? `<br><small class="muted">${esc(m.notas)}</small>` : ''}</td>
        <td><span class="tag dot" style="--c:${colorCat(m.categoria)}">${esc(m.categoria)}</span></td>
        <td>${esc(m.cuenta)}</td><td>${quien(m)}</td>
        <td class="num ${v < 0 ? 'neg' : ''}">${money(v)}</td>
        <td>${m._serv ? '' : `<div class="acts"><button data-edit="${m.id}" title="Editar">✎</button></div>`}</td></tr>`).join('') || '<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">No hay movimientos.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="6">Total (${lista.length})</td><td class="num">${money(total)}</td><td></td></tr></tfoot></table></div>`;
}
function exportarDetalle() {
  if (!detActual) return;
  const lista = detActual.items().filter(x => Math.abs(x.v) >= 0.5).sort((a, b) => a.m.mes.localeCompare(b.m.mes) || (a.m.fecha || '').localeCompare(b.m.fecha || ''));
  const cab = ['Mes', 'Fecha', 'Concepto', 'Cuota', 'Categoría', 'Cuenta', 'Persona', 'Valor', 'Interés', 'Notas'];
  const filas = lista.map(({ m, v }) => [m.mes, fechaLabel(m.fecha), m.nombre, m.cuotas > 1 ? `${m.cuota}/${m.cuotas}` : '', m.categoria, m.cuenta, m._serv ? m.persona : esPrest(m) ? m.persona : TITULAR, Math.round(v), Math.round(m.interes), m.notas]);
  filas.push(['', '', 'TOTAL', '', '', '', '', Math.round(sum(lista, x => x.v)), '', '']);
  const nombre = 'detalle_' + detActual.titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.csv';
  descargar(nombre, '﻿' + [cab, ...filas].map(r => r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}

/* ================= Diálogos ================= */
function mensaje(titulo, html, acciones) {
  const d = $('#dlgMsg');
  $('#mTitulo').textContent = titulo; $('#mCuerpo').innerHTML = html;
  const cont = $('#mAcciones'); cont.innerHTML = '';
  acciones.forEach(([txt, cls, fn]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (cls || ''); b.textContent = txt;
    // Si la acción devuelve false (p. ej. un formulario con errores) el diálogo se vuelve a abrir con lo escrito
    b.onclick = () => { d.close(); if (fn && fn() === false && !d.open) d.showModal(); }; cont.appendChild(b);
  });
  d.showModal();
}
function confirmar(titulo, html, txt, fn, peligro) { mensaje(titulo, html, [['Cancelar', 'ghost'], [txt, peligro ? 'danger' : 'primary', fn]]); }
function pedir(titulo, etiqueta, lista, fn) {
  mensaje(titulo, `<label>${esc(etiqueta)} <input id="mInput" list="${lista}" autocomplete="off"></label>`, [['Cancelar', 'ghost'], ['Aplicar', 'primary', () => fn($('#mInput').value.trim())]]);
  setTimeout(() => $('#mInput')?.focus(), 30);
}

function llenarDatalists() {
  const set = (id, vals) => { $(id).innerHTML = vals.map(v => `<option value="${esc(v)}">`).join(''); };
  set('#dlCuentas', valores('cuenta'));
  set('#dlCategorias', [...new Set([...valores('categoria'), CAT_PRESTAMO, 'Sueldo'])]);
  set('#dlPersonas', valores('persona'));
  set('#dlNombres', valores('nombre'));
}

// ---- Nuevo movimiento ----
function abrirNuevo() {
  const f = $('#formNuevo'); f.reset();
  f.fecha.value = hoyISO(); f.cuotas.value = 1;
  f.cuenta.value = valores('cuenta').includes('Banco Falabella') ? 'Banco Falabella' : '';
  f.valorCuota.dataset.manual = ''; f.mes.dataset.manual = ''; f.tasa.dataset.manual = '';
  actualizarNuevo();
  $('#dlgNuevo').showModal(); f.nombre.focus();
}
// Calcula cuotas, intereses y meses de pago según la tarjeta y la tasa
function planNuevo() {
  const f = $('#formNuevo');
  const monto = Math.abs(parseNum(f.monto.value)), n = Math.max(1, parseInt(f.cuotas.value) || 1);
  const t = tarjetaDe(f.cuenta.value);
  const ciclo = t && f.fecha.value ? cicloTarjeta(t, f.fecha.value) : null;
  const i = n > 1 ? tasaMensual(f.tasa.value, f.tipoTasa.value) : 0;
  let filas = monto ? amortizar(monto, n, i) : [];
  const manual = f.valorCuota.dataset.manual && parseNum(f.valorCuota.value);
  if (manual && monto) { // valor de cuota dado por el banco: el excedente sobre el capital es interés
    const vc = Math.abs(parseNum(f.valorCuota.value));
    filas = filas.map(x => ({ cuota: vc, capital: monto / n, interes: Math.max(0, vc - monto / n) }));
  }
  return { f, monto, n, t, ciclo, i, filas, mes: f.mes.value };
}
function actualizarNuevo() {
  const { f, monto, n, t, ciclo, i, filas, mes } = planNuevo(), clase = f.clase.value;
  $$('.solo-prestamo', f).forEach(e => (e.style.display = clase === 'prestamo' ? '' : 'none'));
  $$('.solo-cuotas', f).forEach(e => (e.style.display = n > 1 ? '' : 'none'));
  if (clase === 'prestamo') f.categoria.value = CAT_PRESTAMO;
  else if (f.categoria.value === CAT_PRESTAMO) f.categoria.value = '';
  if (clase === 'ingreso' && !f.categoria.value) f.categoria.value = 'Sueldo';
  // Tasa por defecto de la tarjeta
  if (t && t.tasa && !f.tasa.dataset.manual) { f.tasa.value = String(t.tasa).replace('.', ','); f.tipoTasa.value = t.tipoTasa; }
  // Mes de pago según el corte de la tarjeta (o el mes de la compra)
  if (!f.mes.dataset.manual) f.mes.value = ciclo ? ciclo.mes : (f.fecha.value || hoyISO()).slice(0, 7);
  $('#nMesHint').textContent = ciclo && f.mes.value === ciclo.mes ? `Según el corte de ${t.nombre}` : '';
  $('#nTarjeta').innerHTML = t
    ? `💳 <b>${esc(t.nombre)}</b>: corte el día ${t.corte}, pago hasta el ${t.pago}.${ciclo ? ` Esta compra entra al corte del <b>${fechaLabel(ciclo.corte)}</b> y se paga hasta el <b>${fechaLabel(ciclo.vence)}</b>.` : ''}`
    : (f.cuenta.value && clase !== 'ingreso' ? `<span class="muted">Si “${esc(f.cuenta.value)}” es una tarjeta de crédito, configura su corte y tasa en Datos → Tarjetas de crédito.</span>` : '');
  $('#nTarjeta').style.display = $('#nTarjeta').innerHTML ? '' : 'none';
  if (!f.valorCuota.dataset.manual) f.valorCuota.value = filas.length ? Math.round(filas[0].cuota) : '';

  let html = '';
  if (monto && mes) {
    const totalPagar = sum(filas, x => x.cuota), intereses = sum(filas, x => x.interes);
    if (n > 1) {
      html = `<b>${n} cuotas de ${money(filas[0].cuota)}</b> · ${mesLabel(mes)} a ${mesLabel(addM(mes, n - 1))} · Total a pagar <b>${money(totalPagar)}</b>` +
        (intereses >= 1 ? ` · Intereses <b class="neg">${money(intereses)}</b>` : (n > 1 && !parseNum(f.tasa.value) ? ' · <span class="muted">sin tasa: se asume 0% de interés</span>' : '')) +
        (i ? ` <small class="muted">(${(i * 100).toFixed(3)}% mensual)</small>` : '');
      html += `<details style="margin-top:6px"><summary>Ver tabla de cuotas</summary><table class="grid" style="margin-top:6px"><thead><tr><th>#</th><th>Mes</th><th class="num">Cuota</th><th class="num">Interés</th><th class="num">Capital</th>${clase === 'prestamo' ? '<th>Te devuelven</th>' : ''}</tr></thead><tbody>` +
        filas.map((x, k) => `<tr><td>${k + 1}</td><td>${mesLabel(addM(mes, k))}${t ? ` <small class="muted">vence ${fechaLabel(diaEn(addM(mes, k), t.pago))}</small>` : ''}</td><td class="num">${money(x.cuota)}</td><td class="num">${money(x.interes)}</td><td class="num">${money(x.capital)}</td>${clase === 'prestamo' ? `<td>${mesLabel(addM(mes, k + +f.desfase.value))}</td>` : ''}</tr>`).join('') +
        '</tbody></table></details>';
    } else {
      html = `Se registrará ${clase === 'ingreso' ? 'un ingreso' : clase === 'prestamo' ? 'un préstamo' : 'un gasto'} de <b>${money(monto)}</b> en ${mesLabel(mes, true)}${t && ciclo && mes === ciclo.mes ? ` (vence ${fechaLabel(ciclo.vence)})` : ''}.`;
    }
    if (clase === 'prestamo') html += `<br>Esperas que ${f.persona.value ? esc(cap(f.persona.value)) : 'la persona'} te devuelva <b>${money(totalPagar)}</b> desde ${mesLabel(addM(mes, +f.desfase.value), true)}.`;
  }
  $('#nPreview').innerHTML = html;
}
function guardarNuevo() {
  const { f, monto, n, t, i, filas, mes } = planNuevo(), clase = f.clase.value;
  if (!monto || !mes) return toast('Falta el valor o el mes de pago', 'error');
  const dz = +f.desfase.value, g = uid();
  const base = {
    nombre: cap(f.nombre.value), cuenta: cap(f.cuenta.value), categoria: cap(f.categoria.value) || 'Sin categoría',
    persona: clase === 'prestamo' ? cap(f.persona.value) : '', fecha: f.fecha.value, monto, cuotas: n, notas: f.notas.value.trim(),
    tasa: n > 1 && i ? +(i * 100).toFixed(4) : 0,
  };
  const nuevos = filas.map((x, k) => sanear({
    ...base, id: uid(), grupo: g, cuota: k + 1, mes: addM(mes, k),
    valor: clase === 'ingreso' ? Math.round(x.cuota) : -Math.round(x.cuota), interes: Math.round(x.interes),
    mesCobro: clase === 'prestamo' ? addM(mes, k + dz) : '',
  }));
  // La tasa usada queda como predeterminada de la tarjeta
  if (t && n > 1 && parseNum(f.tasa.value)) { t.tasa = parseNum(f.tasa.value); t.tipoTasa = f.tipoTasa.value; }
  state.movimientos.push(...nuevos);
  $('#dlgNuevo').close();
  commit(n > 1 ? `Guardadas ${n} cuotas de ${money(Math.abs(nuevos[0].valor))}` : 'Movimiento guardado');
}

// ---- Editar ----
let editId = null;
function abrirEditar(id) {
  const m = movs().find(x => x.id === id); if (!m) return;
  editId = id;
  const f = $('#formEditar');
  f.nombre.value = m.nombre; f.fecha.value = m.fecha; f.mes.value = m.mes; f.cuenta.value = m.cuenta;
  f.categoria.value = m.categoria; f.persona.value = m.persona; f.signo.value = m.valor < 0 ? '-1' : '1';
  f.valor.value = Math.abs(m.valor); f.monto.value = m.monto; f.cuota.value = m.cuota; f.cuotas.value = m.cuotas;
  f.notas.value = m.notas;
  f.mesCobro.value = m.mesCobro || m.mes; f.recibido.value = Math.round(m.recibido); f.ok.checked = esPrestamo(m) && cobrada(m);
  const actualizarPrest = () => $$('.e-prest', f).forEach(e => (e.style.display = /^pr[eé]stamo$/i.test(f.categoria.value.trim()) && f.signo.value === '-1' ? '' : 'none'));
  f.categoria.oninput = f.signo.onchange = actualizarPrest; actualizarPrest();
  const n = movs().filter(x => x.grupo === m.grupo).length;
  $('#eGrupoWrap').style.display = n > 1 ? '' : 'none';
  f.grupo.checked = n > 1;
  $('#eGrupoTxt').textContent = `Aplicar nombre, cuenta, categoría, persona y fecha a las ${n} cuotas de esta compra`;
  $('#dlgEditar').showModal();
}
function guardarEditar() {
  const m = movs().find(x => x.id === editId); if (!m) return;
  const f = $('#formEditar');
  const comunes = { nombre: cap(f.nombre.value), cuenta: cap(f.cuenta.value), categoria: cap(f.categoria.value) || 'Sin categoría', persona: cap(f.persona.value), fecha: f.fecha.value };
  if (/^pr[eé]stamo$/i.test(comunes.categoria)) comunes.categoria = CAT_PRESTAMO;
  if (comunes.categoria !== CAT_PRESTAMO) comunes.persona = ''; // lo que no es préstamo es del titular
  const propio = sanear({ ...m, ...comunes, mes: f.mes.value, valor: +f.signo.value * Math.abs(parseNum(f.valor.value)), monto: f.monto.value, cuota: f.cuota.value, cuotas: f.cuotas.value, notas: f.notas.value, interes: m.interes });
  if (esPrestamo(propio)) {
    propio.mesCobro = f.mesCobro.value || propio.mes;
    const recibido = Math.min(Math.abs(propio.valor), Math.abs(parseNum(f.recibido.value)));
    propio.recibido = f.ok.checked ? Math.abs(propio.valor) : (cobrada(m) && recibido >= Math.abs(propio.valor) ? 0 : recibido);
  } else { propio.mesCobro = ''; propio.recibido = 0; }
  if (f.grupo.checked) state.movimientos.filter(x => x.grupo === m.grupo && x.id !== m.id).forEach(x => Object.assign(x, comunes, { cuotas: propio.cuotas }));
  Object.assign(m, propio);
  $('#dlgEditar').close();
  commit('Cambios guardados');
}
function borrar(ids) {
  const set = new Set(ids);
  state.movimientos = state.movimientos.filter(m => !set.has(m.id));
  ids.forEach(id => seleccion.delete(id));
  commit(`${ids.length} movimiento(s) eliminado(s)`);
}
function repetir(id) {
  const m = movs().find(x => x.id === id); if (!m) return;
  const nuevo = { ...m, id: uid(), grupo: uid(), mes: addM(m.mes, 1), mesCobro: m.mesCobro ? addM(m.mesCobro, 1) : '', recibido: 0, interes: 0, fecha: m.fecha ? addM(m.fecha.slice(0, 7), 1) + m.fecha.slice(7) : '', cuotas: 1, cuota: 1, ok: false, monto: Math.abs(m.valor) };
  nuevo.nombre = nuevo.nombre.replace(new RegExp(`\\b(${MESES.join('|')})\\b`, 'i'), (w) => { const i = MESES.indexOf(w.toLowerCase()); const s = MESES[(i + 1) % 12]; return w[0] === w[0].toUpperCase() ? cap(s) : s; });
  if (nuevo.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(nuevo.fecha)) nuevo.fecha = '';
  if (nuevo.fecha) { const [y, mo] = nuevo.fecha.split('-').map(Number); const ultimo = new Date(y, mo, 0).getDate(); if (+nuevo.fecha.slice(8) > ultimo) nuevo.fecha = nuevo.fecha.slice(0, 8) + String(ultimo).padStart(2, '0'); }
  state.movimientos.push(sanear(nuevo));
  commit(`Copiado a ${mesLabel(nuevo.mes, true)}: ${nuevo.nombre}`);
}

/* ================= Render general ================= */
let tabActual = 'resumen';
function renderBanner() {
  const b = $('#banner'), m = state.meta;
  const dias = m.ultimoRespaldo ? (Date.now() - new Date(m.ultimoRespaldo)) / 864e5 : Infinity;
  const autoActivo = m.autoRespaldo && dirHandle && dirPermiso === 'granted';
  let html = '';
  if (movs().length && m.autoRespaldo && dirHandle && dirPermiso !== 'granted') {
    html = `<span>⏸ Respaldo automático en pausa: el navegador necesita que confirmes el permiso para la carpeta “${esc(dirHandle.name)}”.</span><button class="btn small" data-act="permitirCarpeta">Activar respaldo automático</button>`;
  } else if (movs().length && m.cambios > 0 && !autoActivo && (SOPORTA_CARPETA ? !dirHandle || dias >= 1 : dias >= 7)) {
    html = `<span>⚠ ${m.ultimoRespaldo ? `Tienes ${m.cambios} cambio(s) sin respaldar (último respaldo hace ${dias < 1 ? 'menos de un día' : Math.floor(dias) + ' día(s)'})` : 'Aún no has hecho ninguna copia de seguridad'}.</span><button class="btn small" data-act="exportarJson">Guardar respaldo ahora</button>${SOPORTA_CARPETA && !dirHandle ? '<button class="btn small" data-act="conectarCarpeta">Conectar carpeta (automático)</button>' : ''}`;
  }
  b.hidden = !html; b.innerHTML = html;
  const estado = autoActivo ? ` · respaldo automático en “${dirHandle.name}”` : '';
  $('#subtitulo').textContent = (movs().length ? `${movs().length} movimientos · guardado en este navegador` : 'Datos guardados en este navegador') + estado;
}
function renderAll() {
  llenarDatalists();
  renderBanner();
  ({ resumen: renderResumen, movimientos: renderMovimientos, deudas: renderDeudas, cuotas: renderCuotas, prestamos: renderPrestamos, servicios: renderServicios, reportes: renderReporte, datos: renderDatos })[tabActual]();
  if ($('#dlgPrestamo').open) pintarPrestamo();
  if ($('#dlgDetalle').open) pintarDetalle();
}
function irTab(t) {
  tabActual = t;
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  $$('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + t));
  renderAll();
}

/* ================= Eventos ================= */
const acciones = {
  nuevo: abrirNuevo,
  exportarJson,
  ...accionesServicios,
  exportarDetalle,
  ...accionesPrestamo,
  conectarCarpeta,
  permitirCarpeta,
  importarJson: () => $('#fileJson').click(),
  exportarCsv: () => descargar(`finanzas-movimientos_${hoyISO()}.csv`, csvMovimientos([...movs()].sort((a, b) => a.mes.localeCompare(b.mes))), 'text/csv;charset=utf-8'),
  guardarTarjetas: () => {
    const lista = tarjetas().map(t => ({ ...t }));
    $$('[data-tj]').forEach(el => { const t = lista[+el.dataset.tj]; if (t) t[el.dataset.campo] = el.dataset.campo === 'tasa' ? parseNum(el.value) : el.value; });
    state.tarjetas = lista.filter(t => String(t.nombre).trim()).map(sanearTarjeta);
    commit('Tarjetas guardadas');
  },
  agregarTarjeta: () => { acciones.guardarTarjetasSinAviso(); tarjetas().push(sanearTarjeta({ nombre: '', corte: 1, pago: 15 })); renderDatos(); $('#tarjetasCfg')?.scrollIntoView({ block: 'center' }); },
  guardarTarjetasSinAviso: () => { $$('[data-tj]').forEach(el => { const t = tarjetas()[+el.dataset.tj]; if (t) t[el.dataset.campo] = el.dataset.campo === 'tasa' ? parseNum(el.value) : el.value; }); },
  quitarTarjeta: el => { acciones.guardarTarjetasSinAviso(); tarjetas().splice(+el.dataset.i, 1); commit('Tarjeta quitada'); },
  irPresupuestos: () => { irTab('datos'); $('#presupuestos')?.scrollIntoView({ behavior: 'smooth' }); },
  guardarPres: () => {
    const p = {};
    $$('[data-pres]').forEach(i => { const v = parseNum(i.value); if (v > 0) p[i.dataset.pres] = v; });
    state.presupuestos = p; commit('Presupuestos guardados');
  },
  deshacerImport: () => confirmar('Deshacer importación', '<p>Vuelve al estado anterior a la última importación.</p>', 'Deshacer', () => {
    try { const prev = JSON.parse(localStorage.getItem(KEY_PREV)); if (prev?.movimientos) { state = normalizarEstado(prev); localStorage.removeItem(KEY_PREV); aplicarMigraciones(); commit('Importación deshecha'); } } catch (e) { toast('No se pudo deshacer', 'error'); }
  }),
  borrarTodo: () => mensaje('Borrar todos los datos', `<p>Se eliminarán <b>${movs().length}</b> movimientos de este navegador. Escribe <b>BORRAR</b> para confirmar.</p><input id="mInput" autocomplete="off">`,
    [['Cancelar', 'ghost'], ['Borrar', 'danger', () => { if ($('#mInput').value.trim().toUpperCase() !== 'BORRAR') return toast('No se borró nada'); guardarPrevio(); state = estadoVacio(); commit('Datos borrados'); }]]),
};

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-tab],[data-edit],[data-del],[data-rep],[data-sort],[data-completar],[data-snap],[data-bulk],[data-rango],[data-restaurar],[data-prestamo],[data-pfpersona],[data-pfestado],[data-det],[data-close]');
  if (!t) return;
  const d = t.dataset;
  if (d.act) acciones[d.act]?.(t);
  else if (d.tab) irTab(d.tab);
  else if (d.edit) abrirEditar(d.edit);
  else if (d.rep) repetir(d.rep);
  else if (d.del) { const m = movs().find(x => x.id === d.del); confirmar('Eliminar movimiento', `<p>¿Eliminar <b>${esc(m?.nombre)}</b> (${mesLabel(m?.mes)}, ${money(m?.valor)})?</p>`, 'Eliminar', () => borrar([d.del]), true); }
  else if (d.sort) { orden = { campo: d.sort, dir: orden.campo === d.sort ? -orden.dir : (d.sort === 'nombre' ? 1 : -1) }; renderMovimientos(); }
  else if (d.completar) completarCuotas(d.completar);
  else if (d.snap) {
    const s = snapshots()[+d.snap];
    confirmar('Restaurar punto', `<p>Volver al estado del ${fechaLabel(s.fecha)} (${s.n} movimientos). Lo actual se guarda para poder deshacer.</p>`, 'Restaurar', () => { guardarPrevio(); state = normalizarEstado(JSON.parse(s.data)); aplicarMigraciones(); commit('Punto restaurado'); });
  }
  else if (d.rango) { const h = $('#rHasta').value || ymNow(); $('#rDesde').value = addM(h, -(+d.rango - 1)); renderReporte(); }
  else if (d.bulk) {
    const ids = [...seleccion]; if (!ids.length) return;
    const sel = () => state.movimientos.filter(m => seleccion.has(m.id));
    if (d.bulk === 'borrar') confirmar('Eliminar', `<p>¿Eliminar ${ids.length} movimiento(s)?</p>`, 'Eliminar', () => borrar(ids), true);
    else if (d.bulk === 'categoria') pedir('Cambiar categoría', 'Nueva categoría', 'dlCategorias', v => { if (v) { sel().forEach(m => (m.categoria = cap(v))); commit('Categoría actualizada'); } });
    else if (d.bulk === 'persona') pedir('Asignar persona', 'Persona', 'dlPersonas', v => { const L = sel().filter(esPrest); L.forEach(m => (m.persona = cap(v))); commit(L.length ? `Persona asignada a ${L.length} préstamo(s)` : `Solo los préstamos llevan persona; lo demás es de ${TITULAR}`); });
    else if (d.bulk === 'ok') { const L = sel().filter(esPrestamo); L.forEach(m => (m.recibido = Math.abs(m.valor))); commit(L.length ? `${L.length} préstamo(s) marcados como cobrados` : 'Solo aplica a préstamos'); }
  }
  else if (d.restaurar) restaurarDeCarpeta(d.restaurar);
  else if (d.det) abrirDetalle(d.det);
  else if (d.prestamo) abrirPrestamo(d.prestamo);
  else if (d.pfpersona !== undefined) { prestFiltro.persona = prestFiltro.persona === d.pfpersona ? '' : d.pfpersona; renderPrestamos(); }
  else if (d.pfestado !== undefined) { prestFiltro.estado = d.pfestado; renderPrestamos(); }
  else if ('close' in d) t.closest('dialog').close();
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'autoResp') { state.meta.autoRespaldo = t.checked; persistir(); if (t.checked) { if (dirPermiso === 'granted') { if (state.meta.cambios) respaldarEnCarpeta('auto'); } else permitirCarpeta(); } renderBanner(); toast(t.checked ? 'Respaldo automático activado' : 'Respaldo automático desactivado'); }
  else if (t.dataset.sel) { t.checked ? seleccion.add(t.dataset.sel) : seleccion.delete(t.dataset.sel); renderMovimientos(); }
  else if (t.id === 'selTodos') { movsFiltrados().slice(0, 600).forEach(m => t.checked ? seleccion.add(m.id) : seleccion.delete(m.id)); renderMovimientos(); }
  else if (t.dataset.pok) { const m = movs().find(x => x.id === t.dataset.pok); if (m) { m.recibido = t.checked ? Math.abs(m.valor) : 0; commit(t.checked ? `Cobrado: ${m.nombre} ${money(Math.abs(m.valor))}` : 'Marcado como por cobrar'); } }
  else if (t.dataset.pmes) { const m = movs().find(x => x.id === t.dataset.pmes); if (m && t.value) { m.mesCobro = t.value; commit(`Se cobra en ${mesLabel(t.value, true)}`); } }
  else if (t.dataset.banco) { const tj = tarjetaDe(t.dataset.banco); if (tj) { tj.saldoBanco = Math.abs(parseNum(t.value)); tj.fechaSaldo = tj.saldoBanco ? hoyISO() : ''; commit(tj.saldoBanco ? `Saldo del banco anotado para ${tj.nombre}` : 'Saldo del banco borrado'); } }
  else if (t.id in MAPA_FILTRO_P) { prestFiltro[MAPA_FILTRO_P[t.id]] = t.value; renderPrestamos(); }
});

$('#mesSel').addEventListener('change', e => { mesSel = e.target.value; renderResumen(); });
$('#mesPrev').onclick = () => { const o = [...$('#mesSel').options].map(x => x.value), i = o.indexOf(mesSel); if (i > 0) { mesSel = o[i - 1]; renderResumen(); } };
$('#mesNext').onclick = () => { const o = [...$('#mesSel').options].map(x => x.value), i = o.indexOf(mesSel); if (i < o.length - 1) { mesSel = o[i + 1]; renderResumen(); } };

const mapaFiltros = { fTexto: 'texto', fDesde: 'desde', fHasta: 'hasta', fCategoria: 'categoria', fCuenta: 'cuenta', fPersona: 'persona', fSigno: 'signo' };
Object.entries(mapaFiltros).forEach(([id, k]) => $('#' + id).addEventListener('input', e => { filtros[k] = e.target.value; renderMovimientos(); }));
$('#fPend').addEventListener('change', e => { filtros.pend = e.target.checked; renderMovimientos(); });
$('#fLimpiar').onclick = () => { Object.keys(filtros).forEach(k => (filtros[k] = k === 'pend' ? false : '')); Object.keys(mapaFiltros).forEach(id => ($('#' + id).value = '')); $('#fPend').checked = false; renderMovimientos(); };

$('#rDesde').addEventListener('change', renderReporte);
$('#rHasta').addEventListener('change', renderReporte);
$('#rPrint').onclick = () => window.print();
$('#rCsv').onclick = exportarReporteCSV;
$('#btnNuevo').onclick = abrirNuevo;

const fNuevo = $('#formNuevo');
fNuevo.addEventListener('input', e => {
  const n = e.target.name;
  if (n === 'valorCuota') e.target.dataset.manual = e.target.value ? '1' : '';
  if (n === 'mes') e.target.dataset.manual = '1';
  if (n === 'tasa') e.target.dataset.manual = '1';
  if (['monto', 'cuotas', 'tasa', 'tipoTasa'].includes(n)) fNuevo.valorCuota.dataset.manual = '';
  if (n === 'cuenta' || n === 'fecha') { fNuevo.mes.dataset.manual = ''; fNuevo.tasa.dataset.manual = ''; }
  actualizarNuevo();
});
fNuevo.addEventListener('change', actualizarNuevo);
fNuevo.addEventListener('submit', e => { e.preventDefault(); guardarNuevo(); });
fNuevo.nombre.addEventListener('change', () => {
  // Autocompletar con el último movimiento del mismo nombre
  const prev = [...movs()].reverse().find(m => m.nombre.toLowerCase() === fNuevo.nombre.value.trim().toLowerCase());
  if (!prev) return;
  if (!fNuevo.cuenta.value || fNuevo.cuenta.value === 'Banco Falabella') fNuevo.cuenta.value = prev.cuenta === CUENTA_DEV ? fNuevo.cuenta.value : prev.cuenta;
  if (!fNuevo.categoria.value && prev.categoria !== CAT_PRESTAMO) fNuevo.categoria.value = prev.categoria;
  actualizarNuevo();
});
$('#formEditar').addEventListener('submit', e => { e.preventDefault(); guardarEditar(); });
$('#eBorrar').onclick = () => { const id = editId; $('#dlgEditar').close(); const m = movs().find(x => x.id === id); confirmar('Eliminar movimiento', `<p>¿Eliminar <b>${esc(m?.nombre)}</b>?</p>`, 'Eliminar', () => borrar([id]), true); };

$('#fileJson').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) importarJsonTexto(await f.text(), f.name); });

// Tema
function aplicarTema(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
let tema = null; try { tema = localStorage.getItem(KEY_TEMA); } catch (e) { /* sin acceso */ }
aplicarTema(tema);
$('#btnTema').onclick = () => {
  const oscuro = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  tema = oscuro ? 'light' : 'dark'; aplicarTema(tema); try { localStorage.setItem(KEY_TEMA, tema); } catch (e) { /* sin acceso */ }
};

// Otras pestañas del navegador con la app abierta
window.addEventListener('storage', e => { if (e.key === KEY) { state = cargar(); renderAll(); } });

snapshotDiario();
renderAll();
iniciarCarpeta();

// Búsqueda en préstamos (se redibuja la tabla y se conserva el foco del campo)
document.addEventListener('input', e => {
  if (e.target.id !== 'pfTexto') return;
  prestFiltro.texto = e.target.value;
  const pos = e.target.selectionStart;
  renderPrestamos();
  const i = $('#pfTexto'); i.focus(); i.setSelectionRange(pos, pos);
});
{
  const n = aplicarMigraciones();
  if (n) { commit(); toast('Datos actualizados al nuevo modelo de préstamos y tarjetas'); } else renderAll();
}
