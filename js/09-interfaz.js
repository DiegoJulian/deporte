/* Cuota Justa · js/09-interfaz.js
   Repintado general, pestañas, botón de refresco, badge ONLINE/OFFLINE, tema claro/oscuro, ventanas de APIs y de info, y clics del mercado.
   Script clásico (no módulo): comparte el ámbito global con los demás y se carga en
   el orden de index.html. */
"use strict";
/* ============================ RENDER PRINCIPAL ============================ */
let rafId = null;
function render(){
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    // El aviso de datos de ejemplo habla del Mercado, así que solo sale en el Mercado.
    $('#demoBanner').classList.toggle('hide', !S.demo || !$('#mercado').classList.contains('on'));
    renderEstado(); renderRefresco(); renderMercado(); renderNba(); renderRutas(); renderCalc(); tituloInfo();
  });
}


/* ============================ PESTAÑAS ============================ */
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.setAttribute('aria-selected', String(x === t)));
  $$('.sect').forEach(s => s.classList.toggle('on', s.id === t.getAttribute('aria-controls')));
  // Con cuatro pestañas, en un móvil la barra se desplaza: la recién pulsada se trae
  // entera a la vista o se queda medio fuera justo después de tocarla. `nearest` en
  // vertical para no mover la página, que la cabecera va pegada arriba.
  if (t.scrollIntoView) t.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  render();
}));



/* ===================== REFRESCO =====================
   El panel no puede salir a internet a por cuotas: el visor bloquea toda petición
   externa de la página y Bet365 no publica ninguna API. Lo que sí tiene es su propia
   base de datos, compartida entre todos tus dispositivos, y a esa sí se le puede
   preguntar.

   Dos vías, las dos de verdad:
   · A mano — el botón de refresco de la cabecera. Cada pulsación es una consulta:
     relee `mercado` y `apuestas` enteras y repinta con lo que venga. Ni una llamada
     que no hayas pedido tú.
   · Al instante — el oyente de `mercado` y `apuestas` pinta cualquier cambio en
     cuanto se escribe, sin que haya que pulsar nada.

   El contador de 60 s que había aquí se quitó el 13-09-2026: el refresco es manual.

   Lo que llega por cualquiera de las dos vías es lo que haya en la base: la jornada
   que se escriba desde otro sitio, una apuesta que cambies en otro dispositivo, o lo
   que deje una tarea programada el día que la haya. Las cuotas de Bet365 entran en
   esa base leídas de la línea de Flashscore: el panel no va a buscarlas por su
   cuenta.                                                                        */

function ultimoRastreo(){
  return S.market.reduce((m, e) => (e.actualizado && e.actualizado > m) ? e.actualizado : m, '');
}

const CARGA = Date.now();

// Segundos desde que se cargaron las cuotas, o null si no hay ninguna.
function edadSegundos(){
  const ult = S.demo ? '' : ultimoRastreo();
  if (!ult) return null;
  const t = new Date(ult).getTime();
  if (!isFinite(t)) return null;
  const seg = Math.round((Date.now() - t) / 1000);
  // Una marca por delante del reloj significa que la hora se guardó mal. Antes de
  // dar por buena una cuota que quizá sea vieja, se dice que no se sabe su edad.
  return seg < -120 ? NaN : Math.max(0, seg);
}
function edadCorta(seg){
  if (seg == null) return '—';
  if (!isFinite(seg)) return '?';
  if (seg < 60) return 'ahora';
  const min = Math.floor(seg / 60);
  if (min < 60) return min + ' min';
  const h = Math.floor(min / 60);
  if (h < 24) return h + ' h ' + (min % 60) + ' min';
  const d = Math.floor(h / 24);
  return d + (d === 1 ? ' día' : ' días');
}
function edadLarga(seg){
  if (seg == null) return 'Todavía no hay ninguna cuota cargada.';
  if (!isFinite(seg)) return 'La hora guardada con estas cuotas va por delante del reloj, así que no sé de cuándo son.';
  return 'Las cuotas que hay ahora mismo se copiaron de Bet365 a las ' + fechaHora(ultimoRastreo()) + ', hace ' + edadCorta(seg) + '.';
}

/* ---------------- El refresco y el badge ----------------
   El refresco es manual. `comprobarAhora()` solo se ejecuta cuando se pulsa el
   botón de la cabecera: no hay temporizador, no hay cuenta atrás, y el panel no
   hace ninguna consulta que no le hayas pedido.

   El badge no es un interruptor: dice lo único que el panel sabe con certeza de su
   conexión.
   ONLINE  — está hablando con su base en la nube, y el oyente en vivo pinta al
             instante lo que se escriba en ella desde cualquier dispositivo.
   OFFLINE — no hay base; lo que ves está guardado solo en este navegador. Es el
             estado al abrir la página, hasta que la base contesta.
   Sigue sin significar «conectado a Bet365»: a Bet365 no llega nadie desde aquí
   (ver el bloque de arriba). El aviso del badge lo dice con esas palabras. */
let comprobando = false, llegoAlgo = 0, puedeReleer = true, ultimoRefresco = 0;

// Firma estable de una lista de documentos, para saber si ha cambiado algo de verdad
// y no repintar (ni dar el aviso de «datos nuevos») cuando llega lo mismo que ya había.
const firma = arr => (arr || []).map(o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]))).sort().join('|');
const algoNuevo = (a, b) => firma(a) !== firma(b);

async function comprobarAhora(){
  if (comprobando) return;
  comprobando = true; renderRefresco();
  let cambio = false, fallo = '';
  try {
    if (S.db && puedeReleer){
      const [m, a] = await Promise.all([
        S.db.collection('mercado').get(),
        S.db.collection('apuestas').get()
      ]);
      S.nube = true;
      const mercado  = m.docs.map(d => ({ id: d.id, ...d.data() }));
      const apuestas = a.docs.map(d => ({ id: d.id, ...d.data() }));
      if (mercado.length && algoNuevo(mercado, S.market)){ S.market = mercado; S.demo = false; cambio = true; }
      if (algoNuevo(apuestas, S.bets)){ S.bets = apuestas; cambio = true; }
      if (cambio) guardarLocal();
    } else if (!S.db){
      // Sin base en la nube, lo único compartido es este navegador: otra pestaña del
      // panel puede haber pegado cuotas nuevas.
      const local = leerLocal();
      if (local && algoNuevo(local.market || [], S.market)){
        S.market = local.market || []; S.demo = !!local.demo; cambio = true;
      }
      if (local && algoNuevo(local.bets || [], S.bets)){ S.bets = local.bets || []; cambio = true; }
    }
  } catch (e) {
    // Si esta base no deja releerse entera, se deja de intentar y queda el oyente en
    // vivo, que es el que de verdad trae los cambios. El botón lo dice en su aviso.
    if (e instanceof TypeError) puedeReleer = false;
    fallo = (e && (e.code || e.message)) || 'error';
    console.warn('refresco', fallo);
  }
  comprobando = false;
  ultimoRefresco = Date.now();
  if (cambio) llegoAlgo = Date.now();
  render();
  avisarRefresco(fallo ? 'fallo' : cambio ? 'nuevo' : 'igual', fallo);
}

/* Una pulsación tiene que contestar algo, y tiene que contestar lo que DE VERDAD ha
   comprobado. El aviso decía «sin cambios» a secas, y eso se lee como «la cuota de
   Bet365 no se ha movido» — que es justo lo que el panel no sabe: lo único que ha
   mirado es su propia base. El 13-09 pasó: el botón dijo «sin cambios» con el
   Brest–PSG a 1,20 guardado mientras Bet365 ya lo tenía a 1,22.

   Así que el aviso dice siempre las dos cosas: qué se ha comprobado y de cuándo son
   las cuotas que hay en pantalla. Equivocarse leyéndolo cuesta dinero. */
let avisoT = null;
function edadFrase(){
  const seg = edadSegundos();
  if (seg == null) return null;
  if (!isFinite(seg)) return 'no sé de cuándo son';
  return seg < 90 ? 'son de ahora mismo' : 'son las de hace ' + edadCorta(seg);
}
function avisarRefresco(estado, motivo){
  const el = $('#refAviso'); if (!el) return;
  const frase = edadFrase();
  let tit, sub;
  if (estado === 'fallo'){
    tit = 'No se pudo leer la base';
    sub = 'Sigue en pantalla lo que ya había' + (motivo ? ' (' + motivo + ')' : '') + '.';
  } else if (estado === 'nuevo'){
    tit = 'Datos nuevos';
    sub = frase ? 'Las cuotas del panel ' + frase + '.' : 'Ya hay datos en la base.';
  } else {
    tit = 'La base no ha cambiado';
    sub = (frase ? 'Las cuotas ' + frase + '. ' : 'No hay ninguna cuota cargada. ')
        + 'Este botón relee la base del panel; a Bet365 no llega.';
  }
  el.innerHTML = '<b>' + esc(tit) + '</b><small>' + esc(sub) + '</small>';
  el.dataset.on = '1';
  clearTimeout(avisoT);
  avisoT = setTimeout(() => { el.dataset.on = '0'; renderRefresco(); }, 6000);
}

function renderRefresco(){
  const b = $('#refrescar'); if (!b) return;
  const nuevo = Date.now() - llegoAlgo < 2800;
  b.dataset.ref = comprobando ? 'buscando' : nuevo ? 'nuevo' : 'listo';
  b.disabled = comprobando;
  const cuando = ultimoRefresco
    ? ' Última comprobación a las ' + new Date(ultimoRefresco).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.'
    : ' Todavía no has refrescado en esta pestaña.';
  b.title = (S.db
      ? (puedeReleer
          ? 'Refrescar: vuelve a pedirle a la base del panel el mercado y las apuestas, y repinta con lo que haya. Solo cuando lo pulses.'
          : 'Esta base no deja releerla entera, así que quien trae los cambios es el oyente en vivo: se pintan solos en cuanto se escriben. Pulsa para repintar.')
      : 'Sin servidor: relee lo guardado en este navegador, por si lo has cambiado en otra pestaña.')
    + ' No va a Bet365: sus cuotas llegan escritas a la base del panel, así que «la base no ha cambiado» quiere decir que nadie ha escrito nada nuevo, NO que Bet365 siga en el mismo precio.'
    + cuando + ' ' + edadLarga(edadSegundos());
}

/* El badge dice la conexión, y solo la conexión: dos palabras, las que hay. */
function renderEstado(){
  const b = $('#estadoBtn'); if (!b) return;
  const online = S.nube === true;
  b.dataset.estado = online ? 'online' : 'offline';
  b.textContent = online ? 'ONLINE' : 'OFFLINE';
  const lecturas = S.market.reduce((m, e) => Math.max(m, (e.historial || []).length), 0);
  const guardado = S.market.length + ' partidos · ' + lecturas + ' lectura' + (lecturas === 1 ? '' : 's') + ' guardadas.';
  b.title = (online
      ? 'ONLINE: el panel está conectado a la base de servidor.mjs. Lo que se escriba en ella — una carga de cuotas, una apuesta guardada desde otra pestaña — se pinta aquí al instante.'
      : S.dbReady
        ? 'OFFLINE: no hay servidor. Lo que ves está guardado solo en este navegador y no llega a ningún otro.'
        : 'OFFLINE: el panel todavía está buscando el servidor.')
    + ' Ojo: ONLINE no quiere decir conectado a Bet365 — sus cuotas llegan escritas a la base del panel. '
    + edadLarga(edadSegundos()) + ' ' + guardado;
  pintarEstadoApis();
}

$('#refrescar').addEventListener('click', () => comprobarAhora());

/* ============================ EL TEMA ============================
   La paleta oscura estaba escrita en el CSS desde el principio y nada la activaba
   nunca. Este botón la enciende y la apaga, y la elección se guarda en este
   navegador. Sin elección guardada manda la del sistema (lo decide el trozo de
   script que hay justo después del <style>, para que no se vea el salto).
   El icono enseña ADÓNDE se va, no dónde se está: en oscuro, un sol. */
const ICO_TEMA = {
  dark:  '<path d="M20.2 14.6A8.4 8.4 0 0 1 9.4 3.8a8.4 8.4 0 1 0 10.8 10.8Z"/>',
  light: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.4v2.4M12 19.2v2.4M21.6 12h-2.4M4.8 12H2.4M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7M18.8 18.8l-1.7-1.7M6.9 6.9 5.2 5.2"/>'
};
const temaActual = () => document.documentElement.getAttribute('data-panel-theme') === 'dark' ? 'dark' : 'light';
function pintarTema(){
  const b = $('#temaBtn'); if (!b) return;
  const t = temaActual(), ico = $('#temaIco');
  if (ico) ico.innerHTML = ICO_TEMA[t === 'dark' ? 'light' : 'dark'];
  b.title = t === 'dark'
    ? 'Tema oscuro. Pulsa para pasar al claro. Solo cambia cómo se ve el panel: ningún dato se toca.'
    : 'Tema claro. Pulsa para pasar al oscuro. Solo cambia cómo se ve el panel: ningún dato se toca.';
}
/* La altura real de la cabecera, para que las pestañas se peguen justo debajo. */
function medirCabecera(){
  const t = $('.top'); if (!t) return;
  document.documentElement.style.setProperty('--top-h', Math.round(t.getBoundingClientRect().height) + 'px');
}
medirCabecera();
if (window.ResizeObserver) new ResizeObserver(medirCabecera).observe($('.top'));
else window.addEventListener('resize', medirCabecera);

const btnTema = $('#temaBtn');
if (btnTema) btnTema.addEventListener('click', () => {
  const t = temaActual() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-panel-theme', t);
  try { localStorage.setItem('cuotajusta.tema', t); } catch (e) {}
  pintarTema();
});
pintarTema();

/* ============================ VENTANA DE APIS ============================
   El botón de la cabecera, a la derecha del badge, abre la lista de fuentes de
   datos. Dos niveles: el índice con una tarjeta por sitio, y el detalle de cada
   uno con sus llamadas. Solo lee: no cambia ajustes ni lanza ninguna consulta.

   Los dos estados que el panel sí sabe — si la base contesta y si hay descargas —
   se pintan al abrir y cada vez que cambia la conexión. El resto son etiquetas
   fijas, porque el panel no puede comprobarlas desde aquí. */
const apisModal = $('#apisModal'), apisBtn = $('#apisBtn');
let apisFoco = null;

function pintarEstadoApis(){
  const ok = S.nube === true;
  const txt = ok ? 'conectada' : S.dbReady ? 'sin conexión' : 'comprobando';
  const cls = 'pill ' + (ok ? 'pos' : 'mute');
  ['#apiDb', '#provDb', '#apiClaude'].forEach(sel => {
    const el = $(sel); if (!el) return;
    el.textContent = txt; el.className = cls;
  });
  // La NBA no se puede «comprobar» desde aquí (el panel no la llama), pero sí se sabe
  // si hay algo cargado: es la única promesa que esta ventana puede sostener.
  const nEq = S.nba.length;
  const tNba = nEq ? nEq + ' equipos' : 'sin datos';
  ['#provNba', '#apiNbaEstado'].forEach(sel => {
    const el = $(sel); if (!el) return;
    el.textContent = tNba;
    el.className = 'pill ' + (nEq ? 'pos' : 'mute');
  });

  const sm = $('#apiSample');
  if (sm){
    const et = { 'ok':'disponible', 'falta-permiso':'falta el permiso', 'denegado':'permiso denegado',
                 'sin-imagenes':'sin imágenes', 'sin-capacidad':'no disponible' };
    sm.textContent = !LECTORLISTO ? 'comprobando' : (et[MOTIVO] || 'no disponible');
    sm.className = 'pill ' + (MOTIVO === 'ok' ? 'pos' : MOTIVO === 'falta-permiso' ? 'warn' : 'mute');
  }
}

// prov = null -> el índice de tarjetas; prov = 'flashscore' -> ese detalle.
function verApis(prov){
  const idx = $('#apisIndex'); if (idx) idx.hidden = !!prov;
  $$('.api-det').forEach(d => { d.hidden = d.dataset.prov !== prov; });
  const b = $('#apisBody'); if (b) b.scrollTop = 0;
}
const enDetalle = () => $$('.api-det').some(d => !d.hidden);

function abrirApis(){
  if (infoModal && !infoModal.hidden) cerrarInfo();
  apisFoco = document.activeElement;
  pintarEstadoApis();
  verApis(null);
  apisModal.hidden = false;
  apisBtn.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
  const x = $('#apisX'); if (x) x.focus();
}
function cerrarApis(){
  apisModal.hidden = true;
  apisBtn.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
  if (apisFoco && apisFoco.focus) apisFoco.focus();
}

apisBtn.addEventListener('click', () => { if (apisModal.hidden) abrirApis(); else cerrarApis(); });
$('#apisX').addEventListener('click', cerrarApis);
$('#apisIndex').addEventListener('click', e => {
  const c = e.target.closest('[data-prov]'); if (!c) return;
  verApis(c.dataset.prov);
});
apisModal.addEventListener('click', e => {
  if (e.target === apisModal){ cerrarApis(); return; }          // pulsar fuera de la tarjeta
  if (e.target.closest('[data-volver]')) verApis(null);
});
// Escape retrocede un paso: del detalle al índice, y del índice a cerrar.
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || apisModal.hidden) return;
  e.preventDefault();
  if (enDetalle()) verApis(null); else cerrarApis();
});

/* ============================ VENTANA DE INFO ============================
   El botón de la izquierda del de configuración. Enseña una sola cosa: los cinco
   saldos de la ruta agresiva, etapa a etapa, con la cuota que de verdad llega al
   objetivo truncando al céntimo — la exacta se queda corta.

   Los números salen de `cfgR()`, los mismos parámetros de la pestaña Apuestas. Una
   tabla escrita a mano seguiría diciendo 1.000,15 € con el objetivo puesto en 500 €. */
const infoModal = $('#infoModal'), infoBtn = $('#infoBtn');
let infoFoco = null;

// La cuota «con céntimos» se redondea HACIA ARRIBA a cuatro decimales: así es la que
// se puede repetir a mano y llegar. A la baja, la última etapa se queda por debajo.
function etapasRuta(n){
  const { s0, obj } = cfgR();
  const q = Math.ceil(cuotaConCentimos(n) * 10000) / 10000;
  const filas = [];
  let b = s0;
  for (let i = 1; i <= n; i++){ b = cent(b * q); filas.push({ i, saldo: b }); }
  return { q, filas, final: b, s0, obj };
}

function tituloInfo(){
  if (!infoBtn) return;
  const r = etapasRuta(PLANES[0].n);
  infoBtn.title = 'La ruta agresiva etapa a etapa: de ' + eurC(r.s0) + ' a ' + eurC(r.final)
    + ' con ' + PLANES[0].n + ' aciertos seguidos a cuota ' + nf(r.q, 4) + '.';
}

function renderInfo(){
  const n = PLANES[0].n, r = etapasRuta(n), { v } = cfgR();
  const tb = $('#infoTb');
  if (tb){
    tb.innerHTML = `<tr><td>Inicio</td><td class="num">${esc(eurC(r.s0))}</td></tr>`
      + r.filas.map(f => `<tr><td>${f.i}</td><td class="num">${f.i === n ? '<b>' + esc(eurC(f.saldo)) + '</b>' : esc(eurC(f.saldo))}</td></tr>`).join('');
  }
  const sub = $('#infoSub');
  if (sub) sub.innerHTML = esc(String(n)) + ' aciertos seguidos reinvirtiendo el saldo entero, a cuota <b>'
    + esc(nf(r.q, 4)) + '</b> por etapa. Es la ruta de la pestaña Apuestas, con los parámetros que tengas puestos allí.';
  const nota = $('#infoNota');
  if (nota) nota.innerHTML = 'La cuota exacta es <b>' + esc(nf(qGeo(r.s0, r.obj, n), 6)) + '</b>, pero truncando el saldo al céntimo en cada etapa se queda en '
    + esc(eurC(progresion(n).final)) + ': por eso la tabla usa ' + esc(nf(r.q, 4)) + ' y acaba con unos céntimos de sobra. '
    + 'Cada etapa a esa cuota lleva implícita una probabilidad del <b>' + esc(pctP(1 / r.q, 1)) + '</b>, y la cadena entera se completa el <b>'
    + esc(nf(pRuta(n, v) * 100, 3)) + ' %</b> de las veces con el margen del ' + esc(nf(v * 100, 1))
    + ' % supuesto. Un solo fallo, en cualquier etapa, la termina en 0 €.';
}

function abrirInfo(){
  if (!infoModal || !infoBtn) return;
  if (apisModal && !apisModal.hidden) cerrarApis();
  infoFoco = document.activeElement;
  renderInfo();
  infoModal.hidden = false;
  infoBtn.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
  const x = $('#infoX'); if (x) x.focus();
}
function cerrarInfo(){
  if (!infoModal || !infoBtn) return;
  infoModal.hidden = true;
  infoBtn.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
  if (infoFoco && infoFoco.focus) infoFoco.focus();
}

if (infoBtn) infoBtn.addEventListener('click', () => { if (infoModal.hidden) abrirInfo(); else cerrarInfo(); });
const infoX = $('#infoX');
if (infoX) infoX.addEventListener('click', cerrarInfo);
if (infoModal) infoModal.addEventListener('click', e => { if (e.target === infoModal) cerrarInfo(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !infoModal || infoModal.hidden) return;
  e.preventDefault(); cerrarInfo();
});

/* ============================ MERCADO: interacción ============================ */
$('#sportBar').addEventListener('click', e => {
  if (e.target.closest('[data-clear]')){ S.ui.deporte = ''; S.ui.liga = ''; render(); return; }
  const b = e.target.closest('[data-sport]'); if (!b) return;
  // Volver a pulsar el deporte activo quita el filtro y enseña todo el mercado.
  S.ui.deporte = S.ui.deporte === b.dataset.sport ? '' : b.dataset.sport;
  render();
});

$('#ligaBar').addEventListener('click', e => {
  const b = e.target.closest('[data-liga]'); if (!b) return;
  S.ui.liga = S.ui.liga === b.dataset.liga ? '' : b.dataset.liga;
  render();
});

/* --- el calendario: un día suelto, o el tramo entre dos ---
   Un solo oyente para todo lo que hay dentro de la barra. El calendario se cierra al
   completar un tramo, al usar un atajo, al pulsar fuera y con Escape; mientras se está
   eligiendo el segundo día se queda abierto, que es cuando hace falta verlo. */
const barraFecha = $('#fechaBar');
if (barraFecha) barraFecha.addEventListener('click', ev => {
  if (ev.target.closest('#calBtn')){ if (calAbierto()) cerrarCal(); else abrirCal(); render(); return; }
  const m = ev.target.closest('[data-mes]');
  if (m){ S.ui.mes = sumaMes(S.ui.mes || HOY().slice(0, 7), Number(m.dataset.mes)); render(); return; }
  const r = ev.target.closest('[data-rapido]');
  if (r){ (RAPIDOS[r.dataset.rapido] || RAPIDOS.hoy)(); cerrarCal(); render(); return; }
  const d = ev.target.closest('[data-d]');
  if (d){ pulsarDia(d.dataset.d); if (S.ui.pick === null) cerrarCal(); render(); }
});

document.addEventListener('click', ev => {
  if (!calAbierto()) return;
  if (ev.target.closest('#calPop') || ev.target.closest('#calBtn')) return;
  cerrarCal(); render();
});
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape' || !calAbierto()) return;
  ev.preventDefault(); cerrarCal(); render();
  const b = $('#calBtn'); if (b) b.focus();
});
