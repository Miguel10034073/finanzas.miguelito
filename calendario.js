'use strict';
/* Calendario emergente en español para todos los campos <input type="date"> y <input type="month">.
   Funciona también con los campos que se crean después (delegación de eventos). Al elegir una fecha
   escribe el valor ISO en el campo y dispara 'input' y 'change', así el resto de la app reacciona igual. */
(function () {
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MES_C = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const pad = n => String(n).padStart(2, '0');
  const hoy = new Date();
  const hoyISO = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;

  let pop = null, campo = null, vista = null; // vista = { y, m, modo: 'dias' | 'meses' | 'anios' }

  // Se lee el atributo declarado y no `el.type`: en Firefox y Safari antiguos un <input type="month">
  // no está soportado y `el.type` devuelve "text", lo que impedía abrir el calendario.
  const tipoDecl = el => (el.dataset.cal || el.getAttribute('type') || '').toLowerCase();
  const esCampo = el => el && el.tagName === 'INPUT' && ['date', 'month'].includes(tipoDecl(el));
  const tipoDe = el => tipoDecl(el) === 'month' ? 'month' : 'date';

  function abrir(input) {
    if (input.disabled || input.readOnly) return;
    cerrar();
    campo = input;
    const tipo = tipoDe(input);
    const v = input.value;
    const base = /^\d{4}-\d{2}/.test(v) ? v : hoyISO;
    vista = { y: +base.slice(0, 4), m: +base.slice(5, 7) - 1, modo: tipo === 'month' ? 'meses' : 'dias' };
    pop = document.createElement('div');
    pop.className = 'cal-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', tipo === 'month' ? 'Elegir mes' : 'Elegir fecha');
    pop.addEventListener('mousedown', e => e.preventDefault()); // no quitar el foco del campo
    pop.addEventListener('click', clicPop);
    (input.closest('dialog') || document.body).appendChild(pop);
    pintar();
    posicionar();
  }
  function cerrar() { if (pop) pop.remove(); pop = null; campo = null; }

  function posicionar() {
    if (!pop || !campo) return;
    const r = campo.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = Math.min(r.left, window.innerWidth - pw - 8);
    let top = r.bottom + 6;
    if (top + ph > window.innerHeight - 8 && r.top - ph - 6 > 8) top = r.top - ph - 6;
    pop.style.left = Math.max(8, left) + 'px';
    pop.style.top = Math.max(8, top) + 'px';
  }

  function pintar() {
    const tipo = tipoDe(campo), { y, m, modo } = vista, val = campo.value;
    let cab, cuerpo;
    if (modo === 'dias') {
      cab = `<button type="button" class="cal-nav" data-c="prev" aria-label="Mes anterior">‹</button>
        <button type="button" class="cal-tit" data-c="meses">${MESES[m]} ${y}</button>
        <button type="button" class="cal-nav" data-c="next" aria-label="Mes siguiente">›</button>`;
      const primero = (new Date(y, m, 1).getDay() + 6) % 7; // lunes = 0
      const dias = new Date(y, m + 1, 0).getDate();
      let celdas = DIAS.map(d => `<span class="cal-dow">${d}</span>`).join('');
      for (let i = 0; i < primero; i++) celdas += '<span></span>';
      for (let d = 1; d <= dias; d++) {
        const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
        celdas += `<button type="button" class="cal-dia${iso === val ? ' sel' : ''}${iso === hoyISO ? ' hoy' : ''}" data-d="${iso}">${d}</button>`;
      }
      cuerpo = `<div class="cal-grid">${celdas}</div>`;
    } else if (modo === 'meses') {
      cab = `<button type="button" class="cal-nav" data-c="prevY" aria-label="Año anterior">‹</button>
        <button type="button" class="cal-tit" data-c="anios">${y}</button>
        <button type="button" class="cal-nav" data-c="nextY" aria-label="Año siguiente">›</button>`;
      const selYM = val.slice(0, 7), hoyYM = hoyISO.slice(0, 7);
      cuerpo = `<div class="cal-meses">${MES_C.map((t, i) => { const ym = `${y}-${pad(i + 1)}`; return `<button type="button" class="cal-mes${ym === selYM ? ' sel' : ''}${ym === hoyYM ? ' hoy' : ''}" data-mes="${i}">${t}</button>`; }).join('')}</div>`;
    } else {
      const ini = y - (y % 12);
      cab = `<button type="button" class="cal-nav" data-c="prevD" aria-label="Años anteriores">‹</button>
        <span class="cal-tit">${ini} – ${ini + 11}</span>
        <button type="button" class="cal-nav" data-c="nextD" aria-label="Años siguientes">›</button>`;
      cuerpo = `<div class="cal-meses">${Array.from({ length: 12 }, (_, k) => ini + k).map(a => `<button type="button" class="cal-mes${a === +val.slice(0, 4) ? ' sel' : ''}${a === hoy.getFullYear() ? ' hoy' : ''}" data-anio="${a}">${a}</button>`).join('')}</div>`;
    }
    const pie = tipo === 'month'
      ? `<button type="button" data-c="hoy">Este mes</button>`
      : `<button type="button" data-c="hoy">Hoy</button>`;
    pop.innerHTML = `<div class="cal-cab">${cab}</div>${cuerpo}<div class="cal-pie">${pie}${campo.required ? '' : '<button type="button" data-c="borrar">Borrar</button>'}<button type="button" data-c="cerrar">Cerrar</button></div>`;
  }

  function elegir(valor) {
    const input = campo;
    input.value = valor;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    cerrar();
    input.focus();
  }

  function clicPop(e) {
    const b = e.target.closest('button'); if (!b || !campo) return;
    const tipo = tipoDe(campo), d = b.dataset;
    if (d.d) return elegir(d.d);
    if (d.mes !== undefined) {
      vista.m = +d.mes;
      if (tipo === 'month') return elegir(`${vista.y}-${pad(vista.m + 1)}`);
      vista.modo = 'dias';
    } else if (d.anio) { vista.y = +d.anio; vista.modo = 'meses'; }
    else switch (d.c) {
      case 'prev': vista.m--; if (vista.m < 0) { vista.m = 11; vista.y--; } break;
      case 'next': vista.m++; if (vista.m > 11) { vista.m = 0; vista.y++; } break;
      case 'prevY': vista.y--; break;
      case 'nextY': vista.y++; break;
      case 'prevD': vista.y -= 12; break;
      case 'nextD': vista.y += 12; break;
      case 'meses': vista.modo = 'meses'; break;
      case 'anios': vista.modo = 'anios'; break;
      case 'hoy': return elegir(tipo === 'month' ? hoyISO.slice(0, 7) : hoyISO);
      case 'borrar': return elegir('');
      case 'cerrar': return cerrar();
    }
    pintar(); posicionar();
  }

  // Abrir al hacer clic en el campo (el ícono nativo se oculta con CSS)
  document.addEventListener('click', e => {
    const t = e.target;
    if (esCampo(t)) { e.preventDefault(); if (campo !== t) abrir(t); return; } // evita el selector nativo (Firefox)
    if (pop && !e.composedPath().includes(pop)) cerrar(); // la ruta se fija al despachar, aunque el botón se redibuje
  });
  // Teclado: Alt+↓ o Enter abre; Escape cierra
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pop) { e.preventDefault(); e.stopPropagation(); const c = campo; cerrar(); c?.focus(); return; }
    if (esCampo(e.target) && ((e.altKey && e.key === 'ArrowDown') || (e.key === 'Enter' && !pop))) { e.preventDefault(); abrir(e.target); }
  }, true);
  // Si el campo desaparece o cambia la ventana, se cierra
  window.addEventListener('resize', cerrar);
  document.addEventListener('scroll', e => { if (pop && !pop.contains(e.target)) posicionar(); }, true);
  document.addEventListener('close', e => { if (pop && e.target.contains(pop)) cerrar(); }, true);
})();
