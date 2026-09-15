/* Cuota Justa · js/07-mercado.js
   Mercado · pintado de la lista de partidos.
   Script clásico (no módulo): comparte el ámbito global con los demás y se carga en
   el orden de index.html. */
"use strict";
/* ============================ RENDER: MERCADO ============================ */

/* Una cuota solo vale para el momento en que se copió. Si se pegó antes del pitido
   inicial y el partido ya está en marcha, ese número ya no existe en Bet365 — el
   13-09 el panel enseñaba 15,00 en un Levante–Barcelona que Bet365 cotizaba a 81,00.
   Esas cuotas no se enseñan: la fila se queda con los equipos y «En juego», y los
   números vuelven en cuanto se pegan los de ahora (entonces `actualizado` ya es
   posterior a `comienza` y esta función devuelve false).                         */
function precioMuerto(e, hr){
  if (hr.estado !== 'vivo' && hr.estado !== 'final') return false;
  const t  = new Date(e.actualizado || 0).getTime();
  const t0 = new Date(e.comienza || 0).getTime();
  if (!t || !isFinite(t) || !t0 || !isFinite(t0)) return true;   // sin saber cuándo se copió, no se enseña
  return t < t0;
}

/* La hora de comienzo en milisegundos, que es por lo que se ordena TODA lista de
   partidos del panel. Un partido sin hora (o con una fecha que no se entiende) no
   tiene sitio en la línea del reloj: devuelve Infinity y se va al final, en vez de
   colarse entre dos horas que no le corresponden.                                */
const horaIni = e => { const t = new Date(e && e.comienza ? e.comienza : '').getTime(); return isFinite(t) ? t : Infinity; };
const nombrePartido = e => ((e && e.local) || '') + ' ' + ((e && e.visitante) || '');

const ETI = { '1x2': [['1','Local'], ['X','Empate'], ['2','Visitante']], '2v': [['1','Local'], ['—','—'], ['2','Visitante']] };

function renderMercado(){
  const fuente = S.market.length ? S.market : (S.demo ? DEMO_MARKET : []);
  // Una liga elegida en otro deporte deja de tener sentido al cambiar de deporte.
  const ligaPrevia = ligaActiva();
  if (ligaPrevia && S.ui.deporte && ligaPrevia.dep !== S.ui.deporte) S.ui.liga = '';
  // Mientras nadie haya tocado el calendario, «hoy» se recalcula aquí: un panel abierto
  // de madrugada no puede quedarse enseñando los partidos de ayer.
  if (S.ui.auto){ const h = HOY(); S.ui.desde = h; S.ui.hasta = h; }
  // Las barras de deporte y de liga cuentan lo del día elegido, no todo lo cargado: así
  // se ve de un vistazo qué hay hoy, en vez de prometer partidos que el filtro esconde.
  const enFecha = fuente.filter(enRango);
  renderSportBar(enFecha);
  renderLigaBar(enFecha);

  const dep = deporteActivo(), lig = ligaActiva();
  S.cfg.casaObjetivo = null;   // se trabaja con Bet365: siempre la mejor cuota disponible

  // Sin filtrar por fecha: es lo que alimenta los números de cada casilla del calendario.
  const delFiltro = fuente.filter(e => (!dep || dep.match.test(e.deporte || '')) && (!lig || deLaLiga(e, lig)));
  let filas = delFiltro.filter(enRango)
    .map(e => ({ e, a: analizar(e) })).filter(x => x.a);
  // ORDEN ÚNICO DE LA LISTA: por hora de comienzo, de la más temprana a la más tardía.
  // Siempre, sin excepción: ni el movimiento de las cuotas, ni el valor, ni la liga
  // reordenan nada. Una lista de partidos que no va en orden de reloj no se puede leer
  // de un vistazo, y antes esto ordenaba por cuánto se había movido cada cuota.
  filas.sort((a, b) => horaIni(a.e) - horaIni(b.e) || nombrePartido(a.e).localeCompare(nombrePartido(b.e), 'es'));

  const list = $('#evList');
  renderFechaBar(delFiltro, filas.length);
  if (!filas.length){
    const falta = lig ? lig.label : dep ? dep.label : null;
    const de = falta ? ' de ' + esc(falta) : '';
    const otras = delFiltro.length, sinFecha = delFiltro.filter(e => !diaDe(e)).length;
    // Tres vacíos distintos, y se dicen distintos: la base está vacía, no hay nada de ese
    // deporte o liga, o sí lo hay pero en otras fechas. Confundirlos es lo que hace pensar
    // que el panel ha perdido las cuotas.
    let vacio;
    if (!fuente.length){
      vacio = 'No hay cuotas cargadas. En cuanto se escriban en la base del panel aparecerán aquí.';
    } else if (hayFiltroDia() && otras){
      vacio = `No hay partidos${de} ${esc(etiquetaRango(true))}. Hay ${otras} cargado${otras === 1 ? '' : 's'} en otras fechas`
        + (sinFecha ? ` (${sinFecha} sin hora de comienzo)` : '')
        + `: elige otro día en el calendario o pulsa «Todos los días».`;
    } else if (falta){
      vacio = `Todavía no hay partidos de ${esc(falta)} cargados. Aparecerán aquí en cuanto entren en la base del panel.`;
    } else {
      vacio = 'No hay partidos que mostrar.';
    }
    list.innerHTML = `<div class="empty">${vacio}</div>`;
    return;
  }
  list.innerHTML = filas.map(({ e, a }) => {
    const eti = ETI[e.tipo] || ETI['1x2'];
    const unaCasa = a.libros.length < 2;
    const mov = movimiento(e);
    const cam = camisetasDe(e);
    const bq = bloquePartido(e);
    // El marcador pegado va entre los dos equipos, como se lee de corrido:
    // «Levante 2 – 3 Barcelona». Sin marcador queda el guión de siempre; el panel
    // no se inventa el resultado.
    const marcador = bq.marc
      ? `<span class="marc" title="Marcador tal como se cargó de Bet365. No avanza solo.">${esc(String(bq.marc[0]))} – ${esc(String(bq.marc[1]))}</span>`
      : `<span class="mute" title="Sin marcador. El panel solo sabe el que entre junto con las cuotas.">–</span>`;
    const muerto = precioMuerto(e, bq);
    const porQue = 'Este partido ya ha empezado y las cuotas guardadas se copiaron antes del comienzo, así que no se enseñan: Bet365 cotiza ahora otra cosa. Vuelven los números en cuanto se carguen las de ahora.';
    const cols = muerto ? [0, 1, 2].map(col => {
      if (e.tipo === '2v' && col === 1) return `<div class="sel muerta"><span class="lbl">Sin empate</span><span class="odd mute">—</span></div>`;
      return `<div class="sel muerta" title="${esc(porQue)}">
        <span class="lbl"><span>${eti[col][0]}<span class="kw"> · ${eti[col][1]}</span></span></span>
        <span class="odd mute">—</span>
      </div>`;
    }).join('') : [0, 1, 2].map(col => {
      if (e.tipo === '2v' && col === 1) return `<div class="sel muerta"><span class="lbl">Sin empate</span><span class="odd mute">—</span></div>`;
      const r = a.res[e.tipo === '2v' ? (col === 0 ? 0 : 1) : col];
      const idx = e.tipo === '2v' ? (col === 0 ? 0 : 2) : col;
      if (unaCasa){
        const mv = mov ? mov[idx] : null;
        const pc = mv && mv.de ? mv.d / mv.de : 0;
        const quieta = !mv || Math.abs(pc) < 0.005;
        const cls = quieta ? 'mute' : pc > 0 ? 'pos' : 'neg';
        // PIEL 2.0: la casilla pasa de cuatro datos a tres. La cuota manda (20 px,
        // alineada a la derecha), debajo va el movimiento y arriba la etiqueta con la
        // probabilidad. La cuota de apertura y la sparkline salieron de aquí: la
        // apertura sigue estando, en el aviso al pasar por encima. Un movimiento de
        // más del 10 % deja de ser un número gris y se rellena — es la señal que se
        // busca en este panel, y es lo único que se resalta dentro de la casilla.
        const fuerte = !quieta && Math.abs(pc) >= 0.10 ? ' fuerte' : '';
        const apertura = mv
          ? (mv.real ? 'abrió ' : 'primera lectura del panel ') + nfC(mv.de)
          : 'todavía no hay con qué comparar';
        return `<div class="sel" title="Probabilidad implícita sin margen ${pctP(r.p)} · cuota justa ${nf(r.cuotaJusta)} · ${esc(apertura)}">
          <span class="lbl"><span>${eti[col][0]}<span class="kw"> · ${eti[col][1]}</span></span><span class="num">${pctP(r.p, 0)}</span></span>
          <span class="odd">${nfC(r.mejorCuota)}</span>
          <span class="mv ${cls}${fuerte}">${quieta ? (mv ? 'sin mover' : '—') : (pc > 0 ? '▲ ' : '▼ ') + pctS(pc)}</span>
        </div>`;
      }
      // Mismo reparto que arriba. El nombre de la casa sale de la fila y se va al
      // aviso: en el panel solo se trabaja con Bet365, y esta rama únicamente la pisan
      // los datos de ejemplo.
      const edge = r.ev > 0 ? 'pos' : 'no';
      return `<div class="sel" data-edge="${edge}" title="Probabilidad justa ${pctP(r.p)} · cuota justa ${nf(r.cuotaJusta)} · mejor precio en ${esc(r.casa)}">
        <span class="lbl"><span>${eti[col][0]}<span class="kw"> · ${eti[col][1]}</span></span><span class="num">${pctP(r.p, 0)}</span></span>
        <span class="odd">${nfC(r.mejorCuota)}</span>
        <span class="mv ${r.ev > 0 ? 'pos' : 'mute'}">${pctS(r.ev)}</span>
      </div>`;
    }).join('');
    // Debajo del partido ya no se repite deporte · competición · fecha (lo dicen las
    // barras de arriba y la propia línea del reloj) ni el nombre de la casa (siempre Bet365).
    // Al lado del partido solo va lo que dice algo de ESE partido. «margen 5,1 %» y
    // «2 lecturas» se quitaron el 14-09-2026: el margen es prácticamente el mismo en
    // todas las filas y el número de lecturas es contabilidad interna del panel, así
    // que los dos salían repetidos en cada renglón sin cambiar ninguna decisión. El
    // margen sigue calculándose (`a.margenRef`) y se sigue viendo en la pestaña
    // Apuestas. No volver a ponerlos aquí.
    const sub = [
      nbaChip(e),
      muerto ? `<span title="${esc(porQue)}">faltan las cuotas en vivo</span>` : '',
      !muerto && !unaCasa && a.arb.roi > 0.001 ? `<span class="pill pos">Surebet ${pctS(a.arb.roi)}</span>` : ''
    ].filter(Boolean).join('');
    // Una fila se marca entera cuando alguna de sus tres cuotas se ha movido un 25 %
    // o más desde la apertura de Bet365. Es el único dato NUEVO de la piel 2.0: todo
    // lo demás es la misma información colocada de otra manera.
    const movMax = (mov || []).reduce((m, x) => (x && x.de) ? Math.max(m, Math.abs(x.d / x.de)) : m, 0);
    return `<div class="ev" data-vivo="${bq.vivo ? 1 : 0}" data-alerta="${!muerto && movMax >= 0.25 ? 1 : 0}">
      ${bq.pie}
      <div class="ev-meta">
        <div class="ev-teams" title="${esc(e.local + ' – ' + e.visitante)}">${cam[0]}${esc(e.local)} ${marcador} ${cam[1]}${esc(e.visitante)}</div>
        ${sub ? `<div class="ev-sub">${sub}</div>` : ''}
      </div>
      ${cols}
    </div>`;
  }).join('');
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
