/* Cuota Justa · js/04-filtros.js
   Mercado · barras de deportes y de competiciones, y el filtro por días con su calendario.
   Script clásico (no módulo): comparte el ámbito global con los demás y se carga en
   el orden de index.html. */
"use strict";
/* ============================ DEPORTES (barra de iconos) ============================ */
// Iconos propios, planos y monocromos, al estilo de la tira de deportes de una
// casa de apuestas. Usan currentColor para heredar el estado activo/apagado.
const SPORTS = [
  { id:'futbol', label:'Fútbol', match:/^f[úu]tbol$/i,
    icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 7.3 8 10.2l1.5 4.7h5l1.5-4.7z"/>
      <path d="M12 3v4.3M4.2 9.3l3.8.9M19.8 9.3l-3.8.9M7.2 20.2l2.3-5.3M16.8 20.2l-2.3-5.3"/>
    </svg>` },
  { id:'baloncesto', label:'Baloncesto', match:/^(baloncesto|b[áa]squet|basquet|basket(ball)?|nba)$/i,
    icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 3v18M3 12h18"/>
      <path d="M5.6 5.6Q9.6 12 5.6 18.4"/>
      <path d="M18.4 5.6Q14.4 12 18.4 18.4"/>
    </svg>` },
  { id:'lol', label:'League of Legends', match:/(league of legends|^lol$|^e-?sports?$)/i,
    icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
      <path d="M8 6.8h8a5.6 5.6 0 0 1 5.5 6.6l-.6 3.3a2.5 2.5 0 0 1-4.3 1.3L15 15.4H9l-1.6 2.6a2.5 2.5 0 0 1-4.3-1.3l-.6-3.3A5.6 5.6 0 0 1 8 6.8Z"/>
      <path d="M6.7 10.9v2.4M5.5 12.1h2.4"/>
      <circle cx="15.9" cy="11.3" r=".95" fill="currentColor" stroke="none"/>
      <circle cx="17.9" cy="13.3" r=".95" fill="currentColor" stroke="none"/>
    </svg>` }
];
const deporteActivo = () => SPORTS.find(s => s.id === S.ui.deporte) || null;

/* ============================ LIGAS (barra de competiciones) ============================ */
// Banderas nacionales y marcas genéricas dibujadas a mano. No se usan los escudos ni
// los logotipos de las competiciones: son marcas registradas de cada liga.
const bandera = inner => `<svg viewBox="0 0 20 14" aria-hidden="true">${inner}<rect x=".5" y=".5" width="19" height="13" rx="2" fill="none" stroke="rgba(0,0,0,.22)"/></svg>`;
const ESTRELLAS_UE = Array.from({ length: 12 }, (_, i) => {
  const a = i * Math.PI / 6 - Math.PI / 2;
  return `<circle cx="${(10 + 4.3 * Math.cos(a)).toFixed(2)}" cy="${(7 + 4.3 * Math.sin(a)).toFixed(2)}" r=".85" fill="#ffcc00"/>`;
}).join('');
const BAND = {
  es: bandera('<rect width="20" height="14" rx="2" fill="#c60b1e"/><rect y="3.5" width="20" height="7" fill="#ffc400"/>'),
  en: bandera('<rect width="20" height="14" rx="2" fill="#fff"/><rect x="8.4" width="3.2" height="14" fill="#ce1124"/><rect y="5.4" width="20" height="3.2" fill="#ce1124"/>'),
  it: bandera('<rect width="20" height="14" rx="2" fill="#fff"/><path d="M2 0h4.67v14H2z" fill="#009246"/><path d="M13.33 0H18v14h-4.67z" fill="#ce2b37"/><rect width="2" height="14" fill="#009246"/><rect x="18" width="2" height="14" fill="#ce2b37"/>'),
  de: bandera('<rect width="20" height="14" rx="2" fill="#000"/><rect y="4.67" width="20" height="4.66" fill="#dd0000"/><rect y="9.33" width="20" height="4.67" fill="#ffce00"/>'),
  fr: bandera('<rect width="20" height="14" rx="2" fill="#fff"/><path d="M2 0h4.67v14H2z" fill="#002395"/><path d="M13.33 0H18v14h-4.67z" fill="#ed2939"/><rect width="2" height="14" fill="#002395"/><rect x="18" width="2" height="14" fill="#ed2939"/>'),
  pt: bandera('<rect width="20" height="14" rx="2" fill="#f00"/><path d="M0 2a2 2 0 0 1 2-2h6v14H2a2 2 0 0 1-2-2z" fill="#060"/><circle cx="8" cy="7" r="2.8" fill="none" stroke="#ffe900" stroke-width="1.3"/>'),
  nl: bandera('<rect width="20" height="14" rx="2" fill="#21468b"/><rect width="20" height="9.33" fill="#fff"/><rect width="20" height="4.67" rx="2" fill="#ae1c28"/><rect y="2" width="20" height="2.67" fill="#ae1c28"/>'),
  ue: bandera('<rect width="20" height="14" rx="2" fill="#039"/>' + ESTRELLAS_UE),
  us: bandera('<rect width="20" height="14" rx="2" fill="#fff"/>'
      + [0,2,4,6,8,10,12].map(i => `<rect y="${(i*14/13).toFixed(2)}" width="20" height="1.08" fill="#b22234"/>`).join('')
      + '<rect width="9" height="7.54" fill="#3c3b6e"/>'
      + [[1.7,1.4],[3.5,1.4],[5.3,1.4],[7.1,1.4],[2.6,2.9],[4.4,2.9],[6.2,2.9],
         [1.7,4.4],[3.5,4.4],[5.3,4.4],[7.1,4.4],[2.6,5.9],[4.4,5.9],[6.2,5.9]]
        .map(([x,y]) => `<circle cx="${x}" cy="${y}" r=".48" fill="#fff"/>`).join(''))
};
const COPA = `<svg viewBox="0 0 20 14" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M7 1.6h6v3.6a3 3 0 0 1-6 0z"/><path d="M7 2.4H4.9c0 1.6.9 2.6 2.2 2.9M13 2.4h2.1c0 1.6-.9 2.6-2.2 2.9"/>
  <path d="M10 8.2v2.1M7.6 12.4h4.8"/></svg>`;
const ESCUDO = `<svg viewBox="0 0 20 14" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" aria-hidden="true">
  <path d="M10 1.3 15 2.9v3.9c0 2.7-2 4.6-5 5.6-3-1-5-2.9-5-5.6V2.9z"/></svg>`;

const LIGAS = [
  { id:'laliga',     dep:'futbol',     label:'LaLiga',           match:/laliga|liga\s*(santander|ea\s*sports)|primera\s*divisi/i,  icon:BAND.es },
  { id:'premier',    dep:'futbol',     label:'Premier League',   match:/premier\s*league/i,                                        icon:BAND.en },
  { id:'seriea',     dep:'futbol',     label:'Serie A',          match:/serie\s*a/i,                                               icon:BAND.it },
  { id:'bundesliga', dep:'futbol',     label:'Bundesliga',       match:/bundesliga/i,                                              icon:BAND.de },
  { id:'ligue1',     dep:'futbol',     label:'Ligue 1',          match:/ligue\s*1/i,                                               icon:BAND.fr },
  { id:'primeira',   dep:'futbol',     label:'Primeira Liga',    match:/primeira\s*liga|liga\s*portugal/i,                         icon:BAND.pt },
  { id:'eredivisie', dep:'futbol',     label:'Eredivisie',       match:/eredivisie/i,                                              icon:BAND.nl },
  { id:'champions',  dep:'futbol',     label:'Champions',        match:/champions\s*league|liga\s*de\s*campeones/i,                icon:BAND.ue },
  { id:'europa',     dep:'futbol',     label:'Europa League',    match:/europa\s*league|liga\s*europa/i,                           icon:COPA },
  { id:'conference', dep:'futbol',     label:'Conference',       match:/conference\s*league/i,                                     icon:ESCUDO },

  // Baloncesto = NBA y nada más (14-09-2026). Se quitaron Euroliga, EuroCup, Liga ACB,
  // Lega A y BBL: no es que no haya partidos, es que el panel ya no las mira. Una
  // competición que sigue en esta lista promete un filtro que no se va a alimentar.
  { id:'nba',        dep:'baloncesto', label:'NBA',              match:/\bnba\b|national\s*basketball/i,                           icon:BAND.us },

  { id:'lec',        dep:'lol',        label:'LEC',              match:/\blec\b/i,                                                 icon:BAND.ue },
  { id:'superliga',  dep:'lol',        label:'Superliga',        match:/superliga/i,                                               icon:BAND.es },
  { id:'lfl',        dep:'lol',        label:'LFL',              match:/\blfl\b/i,                                                 icon:BAND.fr },
  { id:'prime',      dep:'lol',        label:'Prime League',     match:/prime\s*league/i,                                          icon:BAND.de }
];
const ligaActiva = () => LIGAS.find(l => l.id === S.ui.liga) || null;
const deLaLiga = (e, l) => {
  const sp = SPORTS.find(s => s.id === l.dep);
  return (!sp || sp.match.test(e.deporte || '')) && l.match.test(e.liga || '');
};

function renderLigaBar(fuente){
  const bar = $('#ligaBar'); if (!bar) return;
  const lista = LIGAS.filter(l => !S.ui.deporte || l.dep === S.ui.deporte);
  const html = lista.map(l => {
    const n = fuente.filter(e => deLaLiga(e, l)).length;
    const t = n ? n + ' partido' + (n === 1 ? '' : 's') : 'sin partidos cargados';
    return `<button class="ligabtn" type="button" data-liga="${l.id}" data-empty="${n ? 0 : 1}"
      aria-pressed="${S.ui.liga === l.id}" title="${esc(l.label)} · ${t}">${l.icon}<span>${esc(l.label)}</span></button>`;
  }).join('');
  if (bar.dataset.h !== html){ bar.dataset.h = html; bar.innerHTML = html; }
}

function renderSportBar(fuente){
  const bar = $('#sportBar'); if (!bar) return;
  const html = SPORTS.map(s => {
    const n = fuente.filter(e => s.match.test(e.deporte || '')).length;
    const on = S.ui.deporte === s.id;
    const t = n ? n + ' partido' + (n === 1 ? '' : 's') : 'sin partidos cargados';
    return `<button class="sportbtn" type="button" data-sport="${s.id}" data-empty="${n ? 0 : 1}"
      aria-pressed="${on}" title="${esc(s.label)} · ${t}">${s.icon}<span>${esc(s.label)}</span></button>`;
  }).join('');
  const todo = S.ui.deporte
    ? `<button class="btn sm ghost verTodos" type="button" data-clear="1">Ver todos</button>` : '';
  if (bar.dataset.h !== html + todo){ bar.dataset.h = html + todo; bar.innerHTML = html + todo; }
}

/* ============================ FECHAS (el filtro por días) ============================
   Al abrir el panel se ven SOLO los partidos de hoy. Lo demás sigue cargado en la base
   y a un clic: el botón del calendario elige un día suelto o un tramo de días.

   Tres reglas de este filtro, para quien lo toque después:
   · `S.ui.auto` quiere decir «hoy, el de verdad»: mientras nadie toque el calendario, el
     día se recalcula en cada repintado. Un panel abierto de madrugada no puede quedarse
     enseñando la jornada de ayer como si fuera la de hoy.
   · El filtro NO se guarda ni viaja a la base. Cada vez que se abre el panel se empieza
     por hoy; una fecha guardada de hace tres días sería una lista vacía sin explicación.
   · El día de un partido es el de su HORA DE COMIENZO. Un partido cargado sin hora no se
     puede colocar en ningún día: queda fuera mientras haya filtro, y la barra dice cuántos
     son para que no parezca que se han perdido.                                        */

const diaISO = d => {
  const x = (d instanceof Date) ? d : new Date(d);
  return isNaN(x) ? '' : x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
};
const HOY = () => diaISO(new Date());
const dISO = t => { const p = String(t || '').split('-').map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); };
const sumaDias = (iso, n) => { const d = dISO(iso); d.setDate(d.getDate() + n); return diaISO(d); };
const sumaMes = (mes, n) => diaISO(new Date(Number(String(mes).slice(0, 4)), Number(String(mes).slice(5, 7)) - 1 + n, 1)).slice(0, 7);
const diaDe = e => (e && e.comienza) ? diaISO(new Date(e.comienza)) : '';
const hayFiltroDia = () => !!(S.ui.desde && S.ui.hasta);

function enRango(e){
  if (!hayFiltroDia()) return true;
  const d = diaDe(e);
  if (!d) return false;                       // sin hora de comienzo no hay día al que asignarlo
  return d >= S.ui.desde && d <= S.ui.hasta;  // ISO: comparar como texto es comparar como fecha
}

const MESC = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const diaCorto = iso => dISO(iso).getDate() + ' ' + MESC[dISO(iso).getMonth()];
// «mié 16 sep»: el mes abreviado se escribe a mano porque el del navegador cambia de
// forma según la versión («sept.», «sep.») y aquí conviven con los del tramo de fechas.
const diaLargo = iso => { const d = dISO(iso);
  return d.toLocaleDateString('es-ES', { weekday:'short' }).replace(/\.$/, '') + ' ' + d.getDate() + ' ' + MESC[d.getMonth()]; };

// frase = true devuelve la forma que encaja dentro de una oración («hoy», «del 14 – 17 sep»).
function etiquetaRango(frase){
  const desde = S.ui.desde, hasta = S.ui.hasta;
  if (!desde || !hasta) return frase ? 'sin filtro de fecha' : 'Todos los días';
  const h = HOY();
  if (desde === hasta){
    if (desde === h) return frase ? 'hoy' : 'Hoy';
    if (desde === sumaDias(h, 1)) return frase ? 'mañana' : 'Mañana';
    if (desde === sumaDias(h, -1)) return frase ? 'ayer' : 'Ayer';
    return frase ? 'el ' + diaLargo(desde) : diaLargo(desde);
  }
  if (desde === h && hasta === sumaDias(h, 6)) return frase ? 'en los próximos 7 días' : 'Próximos 7 días';
  const a = dISO(desde), b = dISO(hasta);
  const tramo = (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear())
    ? a.getDate() + ' – ' + diaCorto(hasta)
    : diaCorto(desde) + ' – ' + diaCorto(hasta);
  return frase ? 'del ' + tramo : tramo;
}

const RAPIDOS = {
  hoy:    () => { const h = HOY(); S.ui.desde = h; S.ui.hasta = h; S.ui.auto = true; },
  manana: () => { const m = sumaDias(HOY(), 1); S.ui.desde = m; S.ui.hasta = m; S.ui.auto = false; },
  '7':    () => { const h = HOY(); S.ui.desde = h; S.ui.hasta = sumaDias(h, 6); S.ui.auto = false; },
  todos:  () => { S.ui.desde = ''; S.ui.hasta = ''; S.ui.auto = false; }
};
function rapidoActivo(k){
  const h = HOY();
  if (k === 'hoy')    return S.ui.desde === h && S.ui.hasta === h;
  if (k === 'manana') return S.ui.desde === sumaDias(h, 1) && S.ui.hasta === S.ui.desde;
  if (k === '7')      return S.ui.desde === h && S.ui.hasta === sumaDias(h, 6);
  return !hayFiltroDia();
}

/* Un día pulsado es «solo ese día», y ya filtra. El siguiente marca el tramo hasta él;
   si cae antes que el primero, el tramo se le da la vuelta en vez de no hacer nada. */
function pulsarDia(iso){
  if (S.ui.pick !== 'fin' || !S.ui.desde){
    S.ui.desde = iso; S.ui.hasta = iso; S.ui.pick = 'fin';
  } else {
    if (iso < S.ui.desde){ S.ui.hasta = S.ui.desde; S.ui.desde = iso; }
    else S.ui.hasta = iso;
    S.ui.pick = null;
  }
  S.ui.auto = false;
  S.ui.mes = iso.slice(0, 7);
}

const calAbierto = () => { const p = $('#calPop'); return !!p && !p.hidden; };
function abrirCal(){
  const p = $('#calPop'), b = $('#calBtn'); if (!p || !b) return;
  S.ui.mes = (S.ui.desde || HOY()).slice(0, 7);
  S.ui.pick = null;
  p.hidden = false; b.setAttribute('aria-expanded', 'true');
}
function cerrarCal(){
  const p = $('#calPop'), b = $('#calBtn'); if (!p || !b) return;
  p.hidden = true; b.setAttribute('aria-expanded', 'false');
  S.ui.pick = null;
}

/* `base` son los partidos que pasan el filtro de deporte y liga SIN filtrar por fecha:
   es lo que permite que cada casilla diga cuántos partidos hay cargados ese día. */
function renderCal(base){
  const grid = $('#calGrid'); if (!grid) return;
  const mes = S.ui.mes || (S.ui.desde || HOY()).slice(0, 7);
  const A = Number(mes.slice(0, 4)), Mo = Number(mes.slice(5, 7));
  const primero = new Date(A, Mo - 1, 1);
  const hueco = (primero.getDay() + 6) % 7;               // la semana empieza en lunes
  const celdas = Math.ceil((hueco + new Date(A, Mo, 0).getDate()) / 7) * 7;
  const porDia = Object.create(null);
  base.forEach(e => { const d = diaDe(e); if (d) porDia[d] = (porDia[d] || 0) + 1; });
  const h = HOY();
  let html = '';
  for (let i = 0; i < celdas; i++){
    const d = new Date(A, Mo - 1, 1 - hueco + i);
    const iso = diaISO(d), n = porDia[iso] || 0;
    let sel = '';
    if (hayFiltroDia()){
      if (iso === S.ui.desde && iso === S.ui.hasta) sel = 'uno';
      else if (iso === S.ui.desde) sel = 'ini';
      else if (iso === S.ui.hasta) sel = 'fin';
      else if (iso > S.ui.desde && iso < S.ui.hasta) sel = 'medio';
    }
    const t = n ? n + ' partido' + (n === 1 ? '' : 's') + ' cargado' + (n === 1 ? '' : 's') : 'sin partidos cargados';
    html += `<button class="cal-d" type="button" data-d="${iso}" data-fuera="${d.getMonth() === Mo - 1 ? 0 : 1}" data-hoy="${iso === h ? 1 : 0}" data-n="${n}" data-sel="${sel}" aria-pressed="${sel ? 'true' : 'false'}" title="${esc(diaLargo(iso))} · ${t}"><span>${d.getDate()}</span><i>${n || ''}</i></button>`;
  }
  grid.innerHTML = html;
  const m = $('#calMes');
  if (m) m.textContent = primero.toLocaleDateString('es-ES', { month: 'long' }) + ' ' + A;
  const nota = $('#calNota');
  if (nota) nota.textContent = S.ui.pick === 'fin'
    ? 'Pulsa otro día y verás el tramo entre los dos; déjalo así para ver solo ese día.'
    : 'Pulsa un día para ver solo ese. Pulsa otro después y se marca el tramo. El número pequeño son los partidos cargados de ese día.';
  $$('#calPop [data-rapido]').forEach(b => b.setAttribute('aria-pressed', String(rapidoActivo(b.dataset.rapido))));
}

function renderFechaBar(base, visibles){
  const et = $('#calEtiq');
  if (et) et.textContent = etiquetaRango(false);
  const b = $('#calBtn');
  if (b) b.title = (hayFiltroDia()
      ? 'Filtrando por fecha: ' + etiquetaRango(false) + '. Pulsa para elegir otro día, o un día y otro para ver el tramo entre los dos.'
      : 'Sin filtro de fecha: se ven todos los partidos cargados. Pulsa para elegir un día o un tramo.')
    + ' Solo filtra lo que ya está cargado en la base: no va a buscar jornadas nuevas.';
  const n = $('#fechaN');
  if (n){
    const sf = base.filter(e => !diaDe(e)).length;
    n.textContent = visibles + ' partido' + (visibles === 1 ? '' : 's')
      + (hayFiltroDia() && sf ? ' · ' + sf + ' sin fecha' : '');
    n.title = (hayFiltroDia() && sf)
      ? sf + ' partido' + (sf === 1 ? '' : 's') + ' cargado' + (sf === 1 ? '' : 's') + ' sin hora de comienzo: no se puede' + (sf === 1 ? '' : 'n') + ' colocar en ningún día, así que solo sale' + (sf === 1 ? '' : 'n') + ' con «Todos los días».'
      : 'Partidos que se están viendo con los filtros puestos.';
  }
  if (calAbierto()) renderCal(base);
}
