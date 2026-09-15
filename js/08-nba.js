/* Cuota Justa · js/08-nba.js
   Mercado · tabla de estadística de la NBA (colección nba de la base).
   Script clásico (no módulo): comparte el ámbito global con los demás y se carga en
   el orden de index.html. */
"use strict";
/* ============================ NBA: LO QUE TRAE stats.nba.com ============================
   La colección `nba` de la base, tal cual la dejó la última carga. El panel no calcula
   nada de esto: ordena por NetRtg y lo enseña diciendo de qué temporada es y cuándo se
   leyó. Sin datos cargados dice que no los hay, y no rellena el hueco con nada.

   Y lo que NO es: rendimiento pasado no es la probabilidad de un partido. Para eso
   haría falta un modelo, y aquí no hay ninguno entrenado. */
const nfS = n => !isFinite(Number(n)) ? '—'
  : (Number(n) > 0 ? '+' : Number(n) < 0 ? '−' : '') + nf(Math.abs(Number(n)), 1);

// El NetRtg de los dos equipos en la propia fila del mercado, cuando los dos están
// cargados. Si falta uno, no se enseña medio dato.
function nbaChip(e){
  if (!SPORTS[1].match.test(e.deporte || '') || !S.nba.length) return '';
  const dL = nbaDatosDe(nbaEquipoDe(e.local)), dV = nbaDatosDe(nbaEquipoDe(e.visitante));
  if (!dL || !dV || !isFinite(Number(dL.netrtg)) || !isFinite(Number(dV.netrtg))) return '';
  const t = 'NetRtg (ORtg − DRtg) de la temporada ' + ((S.nbaMeta && S.nbaMeta.temporada) || '?')
    + ', leído de stats.nba.com. Es rendimiento pasado del equipo, no la probabilidad de este partido.';
  return `<span title="${esc(t)}">NetRtg ${nfS(dL.netrtg)} · ${nfS(dV.netrtg)}</span>`;
}

function renderNba(){
  const p = $('#nbaPanel'); if (!p) return;
  const enBaloncesto = S.ui.deporte === 'baloncesto';
  p.hidden = !enBaloncesto;
  if (!enBaloncesto) return;

  const meta = S.nbaMeta || {};
  const eq = S.nba.filter(t => isFinite(Number(t.netrtg)))
                  .slice().sort((a, b) => Number(b.netrtg) - Number(a.netrtg));

  const f = $('#nbaFuente');
  if (f){
    const seg = meta.actualizado ? Math.round((Date.now() - new Date(meta.actualizado).getTime()) / 1000) : null;
    f.textContent = eq.length
      ? 'stats.nba.com · ' + (meta.temporada || '?') + ' · ' + eq.length + ' equipos · leído '
        + (seg == null ? 'sin hora' : edadCorta(seg) === 'ahora' ? 'ahora' : 'hace ' + edadCorta(seg))
      : 'stats.nba.com · sin datos cargados';
  }

  const c = $('#nbaCuerpo'); if (!c) return;
  if (!eq.length){
    c.innerHTML = '<div class="empty">No hay estadísticas de la NBA cargadas. Salen de <b>stats.nba.com</b> '
      + 'y se escriben en la colección <code>nba</code> de la base con <code>cargar-cuotas.mjs</code>: la página no '
      + 'llama a stats.nba.com por su cuenta. La temporada 2026-27 empieza el 20 de octubre de 2026.</div>';
    return;
  }
  c.innerHTML = '<div class="tbl-wrap"><table>'
    + '<thead><tr><th>Equipo</th><th class="n">PJ</th><th class="n">V–D</th>'
    + '<th class="n" title="Puntos anotados por cada 100 posesiones">ORtg</th>'
    + '<th class="n" title="Puntos recibidos por cada 100 posesiones">DRtg</th>'
    + '<th class="n" title="ORtg menos DRtg: el margen por 100 posesiones">NetRtg</th>'
    + '<th class="n" title="Posesiones por 48 minutos: el ritmo del equipo">Pace</th></tr></thead><tbody>'
    + eq.map(t => {
        const m = NBA_EQUIPOS.find(x => x.id === String(t.id)) || nbaEquipoDe(t.equipo || t.abbr || '');
        const cam = camisetaBasket(m ? m.color : '#c6ccd6', m ? m.trim : '#aab3c0', String(t.equipo || ''));
        const net = Number(t.netrtg);
        return '<tr><td>' + cam + esc(t.equipo || t.abbr || '—') + '</td>'
          + '<td class="n">' + (t.g == null ? '—' : esc(String(t.g))) + '</td>'
          + '<td class="n">' + (t.v == null || t.d == null ? '—' : esc(t.v + '–' + t.d)) + '</td>'
          + '<td class="n">' + nf(t.ortg, 1) + '</td>'
          + '<td class="n">' + nf(t.drtg, 1) + '</td>'
          + '<td class="n ' + (net > 0 ? 'pos' : net < 0 ? 'neg' : '') + '">' + nfS(t.netrtg) + '</td>'
          + '<td class="n">' + nf(t.pace, 1) + '</td></tr>';
      }).join('')
    + '</tbody></table></div>'
    + '<div class="pd"><p class="note">Rendimiento <b>ya jugado</b> de la temporada ' + esc(meta.temporada || '?')
    + ', de <code>leaguedashteamstats</code> con <code>MeasureType=Advanced</code>. No es una previsión de ningún '
    + 'partido ni una probabilidad: es lo que estos equipos hicieron, y el panel no tiene ningún modelo que '
    + 'convierta eso en una cuota justa.</p></div>';
}

function eventoPorId(id){
  const fuente = S.market.length ? S.market : DEMO_MARKET;
  return fuente.find(e => e.id === id);
}
