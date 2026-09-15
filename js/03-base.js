/* Cuota Justa · js/03-base.js
   Almacenamiento: la copia de este navegador (localStorage) y la base del panel (window.claude.use("db")).
   Script clásico (no módulo): comparte el ámbito global con los demás y se carga en
   el orden de index.html. */
"use strict";
/* ============================ ALMACENAMIENTO ============================ */
const LS = 'cuotajusta.v1';
function guardarLocal(){
  try { localStorage.setItem(LS, JSON.stringify({ cfg: S.cfg, bets: S.bets, market: S.market, demo: S.demo, rutas: S.rutas, nba: S.nba, nbaMeta: S.nbaMeta })); } catch (e) {}
}
function leerLocal(){
  try { const r = localStorage.getItem(LS); return r ? JSON.parse(r) : null; } catch (e) { return null; }
}
async function persistir(what){
  guardarLocal();
  if (!S.db) return;
  try {
    if (what === 'cfg' || !what) await S.db.doc('config/panel').set({ ...S.cfg, demo: S.demo });
  } catch (e) { console.warn('cfg', e && e.code); }
}
async function guardarApuesta(b){
  S.bets = S.bets.filter(x => x.id !== b.id).concat([b]);
  guardarLocal(); render();
  if (S.db) { try { await S.db.doc('apuestas/' + b.id).set(b); } catch (e) { avisoGuardado(e); } }
}
async function borrarApuesta(id){
  S.bets = S.bets.filter(x => x.id !== id);
  guardarLocal(); render();
  if (S.db) { try { await S.db.doc('apuestas/' + id).delete(); } catch (e) { avisoGuardado(e); } }
}
function avisoGuardado(e){
  const el = $('#saveState');
  el.textContent = e && e.code === 'quota_exceeded' ? 'Almacenamiento lleno' : 'No se pudo guardar en el servidor';
  setTimeout(() => { el.textContent = ''; }, 4000);
}

async function arrancarDb(){
  let db = null;
  try { if (window.claude && window.claude.use) db = await window.claude.use('db'); } catch (e) { db = null; }
  S.db = db; S.dbReady = true; S.nube = !!db;
  renderEstado();
  if (!db) return;
  try {
    const cfgSnap = await db.doc('config/panel').get();
    if (cfgSnap.exists){
      const d = cfgSnap.data();
      S.cfg = { ...CFG_DEF, ...d };
      delete S.cfg.demo;
      if (d.demo === false) S.demo = false;
    }
    // En vivo de verdad: en cuanto algo se escribe en la base, se pinta aquí.
    db.collection('apuestas').onSnapshot(snap => {
      S.nube = true;
      const remotas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (Date.now() - CARGA > 5000 && algoNuevo(remotas, S.bets)) llegoAlgo = Date.now();
      S.bets = remotas;
      render();
    }, e => { S.nube = false; renderEstado(); console.warn('apuestas', e.code); });
    db.collection('mercado').onSnapshot(snap => {
      S.nube = true;
      const m = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (m.length){ if (Date.now() - CARGA > 5000 && algoNuevo(m, S.market)) llegoAlgo = Date.now(); S.market = m; S.demo = false; }
      render();
    }, e => { S.nube = false; renderEstado(); console.warn('mercado', e.code); });
    // La estadística de la NBA. Un documento por equipo, con el id de stats.nba.com
    // como id de documento, y `_meta` con la temporada y la hora a la que se leyó.
    // Entra por aquí como todo lo demás: la página no llama a stats.nba.com.
    db.collection('nba').onSnapshot(snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const meta = docs.find(d => d.id === '_meta') || null;
      const eq = docs.filter(d => d.id !== '_meta');
      if (algoNuevo(eq, S.nba) || (meta && !S.nbaMeta)){
        S.nba = eq; S.nbaMeta = meta; guardarLocal(); render();
      }
    }, e => { console.warn('nba', e && e.code); });
    // La ruta de la pestaña Apuestas, para que el seguimiento se vea igual desde el
    // móvil y desde el ordenador. Una apuesta liquidada se apunta una vez.
    db.collection('rutas').onSnapshot(snap => {
      const docs = {};
      snap.docs.forEach(d => { docs[d.id] = { id: d.id, ...d.data() }; });
      if (!Object.keys(docs).length) return;
      const nuevas = normRutas(docs);
      if (algoNuevo(Object.values(nuevas), Object.values(S.rutas))){ S.rutas = nuevas; guardarLocal(); render(); }
    }, e => { console.warn('rutas', e && e.code); });
  } catch (e) { console.warn(e); }
  render();
}
