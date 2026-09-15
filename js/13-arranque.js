/* Cuota Justa · js/13-arranque.js
   Arranque: lee la copia local, pinta y conecta con la base. Tiene que ser el último.
   Script clásico (no módulo): comparte el ámbito global con los demás y se carga en
   el orden de index.html. */
"use strict";
/* ============================ DATOS ============================ */
// El aviso de ejemplo es solo del Mercado: vaciarlo no toca las apuestas guardadas.
$('#clearDemo').addEventListener('click', () => {
  S.demo = false; S.market = [];
  persistir('cfg'); render();
});

/* ============================ ARRANQUE ============================ */
(function boot(){
  const local = leerLocal();
  if (local){
    S.cfg = { ...CFG_DEF, ...(local.cfg || {}) };
    S.bets = local.bets || [];
    S.market = local.market || [];
    S.demo = local.demo !== false;
    S.rutas = normRutas(local.rutas);
    S.nba = Array.isArray(local.nba) ? local.nba : [];
    S.nbaMeta = (local.nbaMeta && typeof local.nbaMeta === 'object') ? local.nbaMeta : null;
  }
  render();
  arrancarDb();
})();
