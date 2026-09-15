/* Cuota Justa · js/11-apuestas.js
   Pestaña Apuestas: la ruta de 10 € a 1.000 € en 5 apuestas, candidatas y seguimiento.
   Script clásico (no módulo): comparte el ámbito global con los demás y se carga en
   el orden de index.html. */
"use strict";
/* ===================== LA RUTA DE 10 € A 1.000 € =====================
   La pestaña Apuestas. Una ruta que reinvierte el saldo entero después de cada
   acierto: 5 apuestas. Aquí NO se propone ninguna apuesta que no salga de una cuota
   realmente cargada en la base, y con los datos de ejemplo puestos no se propone
   ninguna en absoluto.

   Las cuatro cuentas que sostienen la pestaña, comprobadas aparte con cálculo exacto:

   1) Cuota geométrica:      q = (objetivo / saldo)^(1/N),  N=5 → 2,511886432
   2) Truncar a dos decimales NO llega: 2,51^5 = 996,25 €. Y truncando el saldo al
      céntimo en cada etapa, ni siquiera la cuota exacta llega: 999,55 €. De ahí la
      «cuota con céntimos», 2,5120, que sale de una búsqueda binaria.
   3) Probabilidad de completar la ruta con un sobre-margen v por apuesta:
      (1/(1+v))^N × (saldo/objetivo).  Con v=5 % y N=5: 0,784 %.
      Con cuotas justas es 1 % para cualquier N — el techo, no una promesa.
   4) Saldo esperado al final = saldo × (1/(1+v))^N = 7,84 € sobre los 10 € puestos.
      El valor esperado de la ruta es negativo, y por eso está escrito en pantalla. */

/* UNA sola ruta desde el 14-09-2026: la agresiva, 5 apuestas. Diego quitó las de 15
   y 25. La aritmética que ya las dejaba en mal lugar sigue en el bloque del riesgo y
   es la razón de quedarse con esta: cada etapa paga el margen una vez, así que menos
   etapas es más probabilidad de completar la cadena — 0,784 % con 5 frente a 0,295 %
   con 25, al 5 % de margen.

   `PLANES` se queda como array de uno a propósito: todo lo que lo recorre (las tablas,
   la progresión, las candidatas, `normRutas`) sigue funcionando sin tocarlo, y volver a
   meter otra ruta sería añadir un objeto aquí. */
const PLANES = [
  { id:'agresivo', n:5,  nombre:'Agresivo',
    enfoque:'Simples con cuota alta por sí sola: 1X2 igualado o visitante, hándicaps, líneas exigentes de goles y de estadística.',
    limite:'Es la que menos veces paga el margen — y aun así su valor esperado es negativo.' }
];
const PLAN_DE = id => PLANES.find(p => p.id === id) || PLANES[0];

const LIQ = {
  pendiente:      ['Pendiente',       null],
  ganada:         ['Ganada',          c => c],
  'media-ganada': ['Media ganada',    c => (1 + c) / 2],
  nula:           ['Nula / devuelta', () => 1],
  'media-perdida':['Media perdida',   () => 0.5],
  perdida:        ['Perdida',         () => 0]
};

const rutaVacia = id => ({ id, extra: 0, etapas: [] });
const RUTAS_DEF = () => ({ agresivo: rutaVacia('agresivo') });

function normRutas(x){
  const base = RUTAS_DEF();
  if (!x || typeof x !== 'object') return base;
  PLANES.forEach(p => {
    const r = x[p.id];
    if (!r || typeof r !== 'object') return;
    base[p.id] = {
      id: p.id,
      extra: Math.max(0, Math.min(40, Number(r.extra) || 0)),
      etapas: (Array.isArray(r.etapas) ? r.etapas : []).slice(0, 60).map(e => ({
        sel: String((e && e.sel) || '').slice(0, 160),
        cuota: (e && isFinite(Number(e.cuota)) && Number(e.cuota) > 0) ? Number(e.cuota) : null,
        liq: (e && LIQ[e.liq]) ? e.liq : 'pendiente',
        fecha: (e && e.fecha) ? String(e.fecha).slice(0, 10) : ''
      }))
    };
  });
  return base;
}

S.rutas = RUTAS_DEF();
S.ui.plan = 'agresivo';

/* --------- aritmética --------- */
// Truncar al céntimo. El +1e-9 es para que 0,1*3 no se convierta en 0,29.
const cent = x => Math.floor(Number(x) * 100 + 1e-9) / 100;
const qGeo = (b, obj, n) => (b > 0 && n > 0) ? Math.pow(obj / b, 1 / n) : NaN;

function cfgR(){
  const s0  = Math.max(0.01, Number(S.cfg.rSaldo)    > 0 ? Number(S.cfg.rSaldo)    : 10);
  const obj = Math.max(s0 + 0.01, Number(S.cfg.rObjetivo) > 0 ? Number(S.cfg.rObjetivo) : 1000);
  const v   = Math.max(0, Math.min(0.4, (Number(S.cfg.rMargen) || 0) / 100));
  const min = Math.max(0, Number(S.cfg.rMin) >= 0 ? Number(S.cfg.rMin) : 0.1);
  return { s0, obj, v, min };
}

// La cuota por etapa que, truncando el saldo al céntimo en cada una, SÍ llega al
// objetivo. Búsqueda binaria: la exacta se queda corta por los redondeos.
function cuotaConCentimos(n){
  const { s0, obj } = cfgR();
  let lo = qGeo(s0, obj, n), hi = lo * 1.05;
  for (let k = 0; k < 60; k++){
    const m = (lo + hi) / 2;
    let b = s0;
    for (let i = 0; i < n; i++) b = cent(b * m);
    if (b >= obj) hi = m; else lo = m;
  }
  return hi;
}

function progresion(n){
  const { s0, obj } = cfgR();
  const q = qGeo(s0, obj, n);
  const filas = [];
  let b = s0;
  for (let i = 1; i <= n; i++){
    const stake = cent(b);
    const fin = cent(stake * q);
    filas.push({ i, stake, q, fin });
    b = fin;
  }
  return { q, filas, final: b };
}

// Probabilidad de completar la ruta y saldo esperado, con cuotas justas menos el
// margen y sin ninguna ventaja. Es el listón contra el que se mide todo lo demás.
const peaje   = (n, v) => Math.pow(1 / (1 + v), n);
const pRuta   = (n, v) => peaje(n, v) * (cfgR().s0 / cfgR().obj);
const esperado= (n, v) => cfgR().s0 * peaje(n, v);

/* --------- estado real de cada ruta --------- */
function estadoRuta(pl){
  const { s0, obj, min } = cfgR();
  const r = S.rutas[pl.id] || rutaVacia(pl.id);
  const total = pl.n + (r.extra || 0);
  let b = s0, muerta = false, resueltas = 0;

  const filas = (r.etapas || []).map((e, i) => {
    const antes = b;
    const c = Number(e.cuota);
    const fn = LIQ[e.liq] && LIQ[e.liq][1];
    let desp = antes, falta = false;
    if (fn){
      if ((e.liq === 'ganada' || e.liq === 'media-ganada') && !(c > 1)) falta = true;
      else { desp = cent(antes * fn(c)); resueltas++; if (desp <= 0) muerta = true; }
    }
    b = desp;
    return { i, e, antes, desp, falta };
  });

  const completada = b >= obj;
  const restantes  = Math.max(0, total - resueltas);
  const sinFondo   = !muerta && !completada && b < min;
  const necesaria  = (restantes > 0 && b > 0 && !completada) ? qGeo(b, obj, restantes) : null;
  return { filas, saldo: b, total, resueltas, restantes, muerta, completada, sinFondo, necesaria };
}

/* --------- candidatas: solo de cuotas realmente cargadas --------- */
const MERCADO_DE = e => e.tipo === '2v' ? 'Ganador del encuentro · 2 opciones' : 'Resultado final · 1X2';
function nombreSel(e, col){
  if (col === 0) return 'Local — ' + e.local;
  if (col === 1) return 'Empate';
  return 'Visitante — ' + e.visitante;
}

// Todo lo cotizado que empiece dentro de las próximas 72 h y no haya empezado aún.
function selecciones72h(){
  const out = [];
  if (S.demo || !S.market.length) return out;
  const ahora = Date.now(), tope = ahora + 72 * 3600 * 1000;
  for (const e of S.market){
    const t = new Date(e.comienza || '').getTime();
    if (!isFinite(t) || t <= ahora || t > tope) continue;
    const a = analizar(e); if (!a) continue;
    const n = e.tipo === '1x2' ? 3 : 2;
    for (let i = 0; i < n; i++){
      const r = a.res[i];
      if (!r || !(r.mejorCuota > 1)) continue;
      const col = e.tipo === '2v' ? (i === 0 ? 0 : 2) : i;
      out.push({ e, a, r, col, clave: e.id + '|' + col, cuota: r.mejorCuota, p: r.p, hora: t });
    }
  }
  return out;
}

// Estimaciones que escribe Diego a mano. Viven en memoria: no son un dato del panel
// y no se guardan como si lo fueran.
const EST = Object.create(null);

/* ============================ RENDER: PESTAÑA APUESTAS ============================ */
const eurC = n => nf(n, 2) + ' €';

function renderKpis(){
  const { s0, obj, v } = cfgR();
  // Los cuatro campos de arriba enseñan lo guardado, no lo que estaba escrito en el
  // HTML: si Diego cambió el margen ayer, al volver a abrir tiene que seguir ahí.
  [['#rSaldo','rSaldo'],['#rObjetivo','rObjetivo'],['#rMargen','rMargen'],['#rMin','rMin']].forEach(([sel, k]) => {
    const c = $(sel);
    if (c && c !== document.activeElement && S.cfg[k] != null) c.value = S.cfg[k];
  });
  const el = $('#planKpis'); if (!el) return;
  // Seis cifras, y entre las seis dicen lo que decían los nueve bloques de texto que
  // se quitaron el 14-09-2026: cuánto hay que acertar, cuántas veces sale, y que el
  // saldo esperado es menor que el puesto. Eso último es el valor esperado negativo,
  // dicho en euros en vez de en tres párrafos. No quitar esas dos últimas casillas.
  const n0 = PLANES[0].n;
  const st = [
    ['Apuestas', String(n0)],
    ['Cuota por etapa', nf(cuotaConCentimos(n0), 4)],
    ['Prob. por etapa', pctP(1 / qGeo(s0, obj, n0), 1)],
    ['Beneficio si llega', eurC(obj - s0)],
    ['Prob. de completarla', nf(pRuta(n0, v) * 100, 3) + ' %'],
    ['Saldo esperado', eurC(esperado(n0, v))]
  ];
  el.innerHTML = st.map(([k, val]) => `<div class="stat"><span>${esc(k)}</span><b>${esc(val)}</b></div>`).join('');
}

/* El aviso de una línea del pie. Es lo único que queda del bloque de conclusión y de
   los dos párrafos de cabecera: el resto era prosa que, según Diego, no le decía nada.
   Lo que NO se puede quitar de aquí es el saldo esperado y el «un fallo la termina en
   0 €» — sin eso, la pestaña es una tabla de 10 € → 1.000 € sin decir lo que cuesta. */
function renderPie(){
  const el = $('#avisoPie'); if (!el) return;
  const { s0, v } = cfgR(), n0 = PLANES[0].n, P = pRuta(n0, v);
  el.innerHTML = '<b>Valor esperado negativo.</b> Con el margen del ' + esc(nf(v * 100, 1))
    + ' % que has supuesto, esta ruta se completa <b>1 de cada ' + esc(nf(1 / P, 0))
    + '</b> veces y su saldo esperado al final es <b>' + esc(eurC(esperado(n0, v)))
    + '</b> sobre los ' + esc(eurC(s0)) + ' puestos. Un fallo, en cualquier etapa, la termina en 0 €. '
    + '<a href="https://www.jugarbien.es/" target="_blank" rel="noopener">jugarbien.es</a>';
}

/* --------- C: candidatas --------- */
function tarjetaCandidata(x, pl, est){
  const { obj } = cfgR();
  const c = x.cuota, pImp = 1 / c, pCasa = x.p;
  const e = x.e;
  const eDeLaCasa = pCasa * c - 1;
  const k = x.clave;
  const mio = EST[k] || {};
  const pu = (mio.p != null && isFinite(mio.p)) ? mio.p / 100 : null;
  const inc = (mio.inc != null && isFinite(mio.inc)) ? mio.inc / 100 : 0;
  const evU = pu != null ? pu * c - 1 : null;
  const evLo = pu != null ? Math.max(0, pu - inc) * c - 1 : null;
  const saldoSi = cent(est.saldo * c);
  const tras = (est.restantes > 1 && saldoSi < obj) ? qGeo(saldoSi, obj, est.restantes - 1) : null;

  let v = 'falta', vt = 'NO ESTIMABLE · NO APOSTAR', vm = 'La única fuente de esta candidata es la propia línea de Bet365, así que su probabilidad «sin margen» no es una estimación independiente: con ella el valor esperado es negativo por construcción. Para que pueda ser otra cosa hace falta una probabilidad estimada aparte, con su método y su muestra.';
  if (pu != null){
    if (evU <= 0){ v = 'no'; vt = 'NO APOSTAR'; vm = 'Tu propia estimación da valor esperado <b>' + pctS(evU) + '</b>. La cuota mínima aceptable con esa probabilidad es <b>' + nf(1 / pu, 3) + '</b> y la casa paga <b>' + nfC(c) + '</b>.'; }
    else if (evLo <= 0){ v = 'no'; vt = 'NO APOSTAR'; vm = 'El valor esperado sale positivo (' + pctS(evU) + ') solo en el centro de tu estimación: con el extremo bajo de tu propio rango (' + pctP(Math.max(0, pu - inc)) + ') ya es ' + pctS(evLo) + '. Una ventaja que se la come la incertidumbre no es una ventaja.'; }
    else { v = 'tuya'; vt = 'APOSTABLE SEGÚN TU ESTIMACIÓN'; vm = 'Con tu probabilidad el valor esperado es <b>' + pctS(evU) + '</b> y aguanta el extremo bajo de tu rango (' + pctS(evLo) + '). <b>El panel no ha verificado esa probabilidad</b>: la ventaja depende por completo de que esté bien calibrada. Si sale de menos de una temporada de muestra o de una frecuencia de cinco partidos, no lo está.'; }
  }

  const edad = e.actualizado ? edadCorta(Math.round((Date.now() - new Date(e.actualizado).getTime()) / 1000)) : '?';

  return `<div class="cand">
    <div class="cand-hd">
      <b>${esc(e.local)} – ${esc(e.visitante)}</b>
      <small>${esc(e.liga || '')} · ${esc(fechaHora(e.comienza))}</small>
      <span class="cu">${esc(nfC(c))}</span>
    </div>
    <div class="cand-gr">
      <div class="c" style="grid-column:span 2"><span>Mercado y línea exactos</span><b style="font-size:14px; white-space:normal">${esc(MERCADO_DE(e))} → ${esc(nombreSel(e, x.col))}</b></div>
      <div class="c"><span>Prob. implícita</span><b>${pctP(pImp, 1)}</b></div>
      <div class="c" title="La línea de Bet365 con el margen repartido (método potencia). NO es una probabilidad real: es la opinión de la casa reescalada."><span>Sin margen</span><b>${pctP(pCasa, 1)}</b></div>
      <div class="c"><span>Margen</span><b>${a_margen(x)}</b></div>
      <div class="c" title="Valor esperado usando la probabilidad de la propia casa. Negativo por construcción: es el margen."><span>VE con la línea</span><b class="${eDeLaCasa > 0 ? 'pos' : 'neg'}">${pctS(eDeLaCasa)}</b></div>
      <div class="c"><span>Cuota mínima</span><b>${pu != null ? nf(1 / pu, 3) : nf(1 / pCasa, 3)}</b></div>
      <div class="c"><span>Cuota copiada</span><b style="font-size:13px">${edad === 'ahora' ? 'ahora' : 'hace ' + esc(edad)}</b></div>
      <div class="c"><span>Si gana, saldo</span><b>${eurC(saldoSi)}</b></div>
      <div class="c" title="La cuota geométrica que necesitarían las ${est.restantes - 1 > 0 ? est.restantes - 1 : 0} etapas restantes si esta se acierta."><span>Restantes piden</span><b>${tras ? nf(tras, 4) : (saldoSi >= obj ? 'objetivo' : '—')}</b></div>
    </div>
    <div class="cand-est">
      <label class="f" title="Tu probabilidad, estimada aparte de la casa. Si no tienes una defendible, déjalo vacío: eso es NO ESTIMABLE.">Tu prob. %<input class="num" type="number" step="0.1" min="0" max="100" data-est="${esc(k)}" data-campo="p" value="${mio.p != null ? mio.p : ''}"></label>
      <label class="f" title="Amplitud del rango, en puntos porcentuales, sustentada en el tamaño de tu muestra.">± inc. (pp)<input class="num" type="number" step="0.1" min="0" max="50" data-est="${esc(k)}" data-campo="inc" value="${mio.inc != null ? mio.inc : ''}"></label>
      <span class="note" style="align-self:center">${pu != null ? 'VE con tu estimación: <b class="' + (evU > 0 ? 'pos' : 'neg') + '">' + pctS(evU) + '</b>' : 'Sin tu estimación, el único número disponible es el de la casa.'}</span>
    </div>
    <div class="veredicto"><b data-v="${v}">${esc(vt)}</b><span>${vm}</span></div>
    <div class="cand-pie"><b>La invalidan:</b> que cambie la cuota antes de apostar (la de arriba se copió hace ${esc(edad)}); una baja o un cambio en el once respecto a lo previsto; que el partido empiece; un cambio de portero titular o de árbitro si el mercado depende de ellos; y cualquier dato que deje la probabilidad por debajo de ${pctP(1 / c, 1)}, que es el punto de equilibrio de esta cuota.</div>
  </div>`;
}
const a_margen = x => { const m = x.a && x.a.margenRef; return m == null ? '—' : pctP(m, 1); };

function renderCandidatas(){
  const cont = $('#candidatas'); if (!cont) return;
  const sel = selecciones72h();
  const est = $('#cEstado');
  if (est) est.textContent = S.demo ? 'Datos de ejemplo: no se propone nada'
    : sel.length ? sel.length + ' selecciones cotizadas en 72 h' : 'Sin cuotas cargadas';

  cont.innerHTML = PLANES.map(p => {
    const e = estadoRuta(p);
    const g = e.necesaria != null ? e.necesaria : qGeo(cfgR().s0, cfgR().obj, p.n);
    // Con una sola ruta, repetir su nombre aquí no aporta: lo que hace falta saber
    // antes de mirar las candidatas es qué cuota pide la etapa que toca.
    const cabecera = `<div class="plan-hd"><h3>Necesita una cuota de <span class="num">${nf(g, 4)}</span></h3>
      <span class="note">Saldo ${eurC(e.saldo)} · etapa ${Math.min(e.resueltas + 1, e.total)} de ${e.total}</span></div>`;

    if (e.muerta || e.completada || e.restantes === 0){
      return `<div class="plan-blk">${cabecera}<div class="cands"><p class="note">${e.completada ? 'Ruta completada: no hay siguiente apuesta.' : 'Ruta terminada. No se proponen candidatas.'}</p></div></div>`;
    }
    if (!sel.length){
      const motivo = S.demo
        ? 'El Mercado está enseñando <b>cuotas de ejemplo</b>. Proponer una candidata con ellas sería inventarla, así que aquí no aparece ninguna.'
        : 'No hay ninguna cuota de Bet365 cargada en la base con partido en las próximas 72 horas. Cárgalas y esta lista se llena sola.';
      return `<div class="plan-blk">${cabecera}<div class="cands">
        <div class="veredicto" style="border-top:0; background:var(--surface-2); border-radius:var(--r)">
          <b data-v="falta">NO ESTIMABLE · NO APOSTAR</b><span>${motivo}</span></div></div></div>`;
    }
    const banda = sel.filter(x => x.cuota >= g * 0.85 && x.cuota <= g * 1.40)
                     .sort((a, b) => Math.abs(Math.log(a.cuota / g)) - Math.abs(Math.log(b.cuota / g)))
                     .slice(0, 3)
                     // Elegidas por cuánto se acercan a la cuota que necesita la ruta, pero
                     // enseñadas por hora de comienzo: aquí también mandan las manecillas.
                     .sort((a, b) => a.hora - b.hora);
    if (!banda.length){
      return `<div class="plan-blk">${cabecera}<div class="cands">
        <div class="veredicto" style="border-top:0; background:var(--surface-2); border-radius:var(--r)">
          <b data-v="falta">SIN CANDIDATAS</b><span>De las ${sel.length} selecciones cotizadas en las próximas 72 h, ninguna cae en la banda de cuota que esta ruta necesita (${nf(g * 0.85, 2)}–${nf(g * 1.40, 2)}). Forzar una fuera de banda obliga a subir la cuota de todas las etapas restantes.</span></div></div></div>`;
    }
    return `<div class="plan-blk">${cabecera}<div class="cands">${banda.map(x => tarjetaCandidata(x, p, e)).join('')}</div></div>`;
  }).join('');
}

/* --------- E: seguimiento ---------
   El selector de ruta se fue con las otras dos (14-09-2026): con una sola, unos chips
   para elegir entre uno son ruido. `S.ui.plan` se queda en 'agresivo' y no se toca. */
function renderSeguiTit(){
  const c = $('#seguiTit'); if (!c) return;
  c.textContent = PLANES[0].nombre + ' · ' + PLANES[0].n + ' apuestas';
}

function renderSegui(){
  const cont = $('#segui'); if (!cont) return;
  const pl = PLAN_DE(S.ui.plan);
  const { obj, min, s0 } = cfgR();
  const e = estadoRuta(pl);
  const r = S.rutas[pl.id] || rutaVacia(pl.id);

  const opciones = liq => Object.keys(LIQ).map(k =>
    `<option value="${k}"${k === liq ? ' selected' : ''}>${LIQ[k][0]}</option>`).join('');

  const filas = e.filas.map(f => `<div class="paso" data-liq="${esc(f.e.liq)}">
      <span class="n">${f.i + 1}</span>
      <label class="f">Selección<input type="text" data-et="${f.i}" data-campo="sel" value="${esc(f.e.sel)}" placeholder="mercado y línea exactos"></label>
      <label class="f">Cuota<input class="num" type="number" step="0.001" min="1" data-et="${f.i}" data-campo="cuota" value="${f.e.cuota == null ? '' : f.e.cuota}"></label>
      <label class="f">Liquidación real<select data-et="${f.i}" data-campo="liq">${opciones(f.e.liq)}</select></label>
      <span class="sal" title="Saldo antes → después de esta etapa">${esc(eurC(f.antes))} → <b>${esc(eurC(f.desp))}</b>${f.falta ? ' <span class="pill warn">falta la cuota</span>' : ''}</span>
      <button class="x" type="button" data-borrar="${f.i}" title="Borrar esta etapa" aria-label="Borrar etapa ${f.i + 1}">&#10005;</button>
    </div>`).join('');

  let fin = '';
  if (e.muerta) fin = `<div class="ruta-fin"><b>Ruta terminada: el saldo es 0.</b> Los ${eurC(s0)} de esta ruta se han perdido y aquí se acaba. No hay plan de recuperación, y no lo va a haber: doblar, recargar o «empezar otra vez para recuperar» convierte una pérdida acotada de ${eurC(s0)} en una abierta. Si quieres volver a intentarlo, es una ruta nueva con su propio límite, no la continuación de esta.</div>`;
  else if (e.completada) fin = `<div class="ruta-fin" data-ok="1"><b>Ruta completada: ${eurC(e.saldo)}.</b> Beneficio neto sobre lo puesto: ${eurC(e.saldo - s0)} (impuestos aparte). Que haya salido no convierte la ruta en buena apuesta: la probabilidad de completarla era del ${nf(pRuta(pl.n, cfgR().v) * 100, 3)} % con el margen supuesto.</div>`;
  else if (e.sinFondo) fin = `<div class="ruta-fin"><b>Saldo por debajo de la apuesta mínima.</b> Quedan ${eurC(e.saldo)} y la apuesta mínima de tu cuenta es ${eurC(min)}: la ruta no puede continuar aunque el saldo no sea cero.</div>`;
  else if (e.restantes === 0) fin = `<div class="ruta-fin"><b>Se han gastado las ${e.total} etapas y el saldo es ${eurC(e.saldo)}.</b> La ruta no ha llegado al objetivo. Alargarla es cambiar de plan: si lo haces, dilo en los números — con ${eurC(e.saldo)} y el objetivo intacto hacen falta más etapas, no cuotas mayores por arte de magia.</div>`;

  const sigue = !e.muerta && !e.completada && !e.sinFondo && e.restantes > 0;
  cont.innerHTML = `
    <div class="stats">
      <div class="stat"><span>Saldo actual</span><b class="${e.saldo > s0 ? 'pos' : e.saldo < s0 ? 'neg' : ''}">${esc(eurC(e.saldo))}</b></div>
      <div class="stat"><span>Etapas resueltas</span><b>${e.resueltas} / ${e.total}</b></div>
      <div class="stat"><span>Restantes</span><b>${e.restantes}</b></div>
      <div class="stat" title="(objetivo / saldo)^(1/restantes): lo que necesita de media geométrica cada etapa que queda."><span>Cuota necesaria ahora</span><b>${e.necesaria ? nf(e.necesaria, 4) : '—'}</b></div>
      <div class="stat"><span>Cuota inicial del plan</span><b>${nf(qGeo(s0, obj, pl.n), 4)}</b></div>
    </div>
    ${filas || '<div class="empty">Esta ruta no tiene ninguna etapa apuntada. Añade la primera cuando la apuesta esté liquidada.</div>'}
    ${fin}
    <div class="ruta-pie">
      <span class="note">${sigue ? 'Apunta la liquidación <b>real</b>, la que pagó la casa. Una devolución multiplica por 1: no pierde, pero gasta una etapa del calendario y sube la cuota que necesitan las demás.' : 'Ruta cerrada.'}</span>
      <span class="sp">
        ${sigue ? `<button class="btn sm" type="button" data-extra="1" title="Una devolución o una etapa gastada se compensan alargando el plan una apuesta más, no subiendo la cuota a la fuerza.">+1 etapa al plan (${e.total})</button>` : ''}
        ${sigue ? '<button class="btn sm primary" type="button" data-anadir="1">Añadir etapa</button>' : ''}
        ${(r.etapas || []).length ? '<button class="btn sm ghost" type="button" data-vaciar="1">Vaciar ruta</button>' : ''}
      </span>
    </div>`;
}


let pintandoRutas = false;
function renderRutas(){
  const sec = $('#plan'); if (!sec || !sec.classList.contains('on')) return;
  // Nunca repintar mientras se está escribiendo en un campo de esta pestaña: se
  // perdería el foco a mitad de una cifra (el bicho clásico de repintar con onSnapshot).
  const a = document.activeElement;
  if (a && sec.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
  if (pintandoRutas) return;
  pintandoRutas = true;
  try {
    renderKpis(); renderCandidatas(); renderSeguiTit(); renderSegui(); renderPie();
  } finally { pintandoRutas = false; }
}

/* --------- guardado --------- */
async function guardarRuta(id){
  guardarLocal();
  if (!S.db) return;
  try { await S.db.doc('rutas/' + id).set({ ...(S.rutas[id] || rutaVacia(id)), id, actualizado: new Date().toISOString() }); }
  catch (e) { console.warn('rutas', e && e.code); }
}

/* --------- interacción --------- */
['#rSaldo', '#rObjetivo', '#rMargen', '#rMin'].forEach(sel => {
  const el = $(sel); if (!el) return;
  el.addEventListener('change', () => {
    const v = Number(el.value);
    if (sel === '#rSaldo')    S.cfg.rSaldo    = v > 0 ? v : 10;
    if (sel === '#rObjetivo') S.cfg.rObjetivo = v > 0 ? v : 1000;
    if (sel === '#rMargen')   S.cfg.rMargen   = isFinite(v) && v >= 0 ? Math.min(40, v) : 5;
    if (sel === '#rMin')      S.cfg.rMin      = isFinite(v) && v >= 0 ? v : 0.1;
    persistir('cfg'); renderRutas();
  });
});

const elCands = $('#candidatas');
if (elCands) elCands.addEventListener('change', ev => {
  const el = ev.target.closest('[data-est]'); if (!el) return;
  const k = el.dataset.est, campo = el.dataset.campo;
  EST[k] = EST[k] || {};
  EST[k][campo] = el.value === '' ? null : Number(el.value);
  renderCandidatas();
});

const elSegui = $('#segui');
if (elSegui) elSegui.addEventListener('change', ev => {
  const el = ev.target.closest('[data-et]'); if (!el) return;
  const r = S.rutas[S.ui.plan]; if (!r) return;
  const et = r.etapas[Number(el.dataset.et)]; if (!et) return;
  const campo = el.dataset.campo;
  if (campo === 'cuota'){ const v = Number(el.value); et.cuota = el.value === '' ? null : (isFinite(v) && v > 0 ? v : null); }
  else if (campo === 'liq') et.liq = LIQ[el.value] ? el.value : 'pendiente';
  else et[campo] = String(el.value).slice(0, 160);
  guardarRuta(S.ui.plan);
  // El foco sigue en el campo que se acaba de tocar, así que el guardián de
  // renderRutas() bloquearía el repintado: se suelta antes.
  if (el.blur) el.blur();
  renderRutas();
});

if (elSegui) elSegui.addEventListener('click', ev => {
  const r = S.rutas[S.ui.plan]; if (!r) return;
  if (ev.target.closest('[data-anadir]')){
    r.etapas.push({ sel:'', cuota:null, liq:'pendiente', fecha:new Date().toISOString().slice(0,10) });
  } else if (ev.target.closest('[data-extra]')){
    r.extra = Math.min(40, (r.extra || 0) + 1);
  } else if (ev.target.closest('[data-vaciar]')){
    r.etapas = []; r.extra = 0;
  } else {
    const d = ev.target.closest('[data-borrar]');
    if (!d) return;
    r.etapas.splice(Number(d.dataset.borrar), 1);
  }
  guardarRuta(S.ui.plan);
  renderRutas();
});
