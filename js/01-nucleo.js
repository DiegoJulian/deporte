/* Cuota Justa · js/01-nucleo.js
   Utilidades, matemáticas (quitar margen, EV, Kelly), estado del panel, datos de ejemplo y formato de números.
   Script clásico (no módulo): comparte el ámbito global con los demás y se carga en
   el orden de index.html. */
"use strict";
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* ============================ MATEMÁTICAS ============================ */
const M = {
  prob: d => 1 / d,
  // Quita el margen de un conjunto de cuotas -> probabilidades que suman 1
  devig(odds, method){
    const q = odds.map(o => 1 / o);
    const sum = q.reduce((a, b) => a + b, 0);
    if (!isFinite(sum) || sum <= 0) return odds.map(() => 0);
    if (method === 'multiplicativo') return q.map(x => x / sum);
    if (method === 'aditivo'){ const k = (sum - 1) / q.length; return q.map(x => Math.max(1e-6, x - k)); }
    if (method === 'shin'){
      const n = q.length;
      let lo = 0, hi = 0.5;
      const P = z => q.map(x => (Math.sqrt(z*z + 4*(1-z)*x*x/sum) - z) / (2*(1-z)));
      for (let i = 0; i < 80; i++){
        const m = (lo + hi) / 2;
        const s = P(m).reduce((a,b)=>a+b,0);
        if (s > 1) lo = m; else hi = m;
      }
      const p = P((lo+hi)/2); const t = p.reduce((a,b)=>a+b,0);
      return p.map(x => x / t);
    }
    // potencia: busca k tal que Σ q^k = 1
    let lo = 0.2, hi = 4;
    for (let i = 0; i < 80; i++){
      const m = (lo + hi) / 2;
      const s = q.reduce((a, x) => a + Math.pow(x, m), 0);
      if (s > 1) lo = m; else hi = m;
    }
    const k = (lo + hi) / 2;
    const p = q.map(x => Math.pow(x, k));
    const t = p.reduce((a,b)=>a+b,0);
    return p.map(x => x / t);
  },
  margen: odds => odds.reduce((a,o)=>a + 1/o, 0) - 1,
  ev: (p, c) => p * c - 1,
  kelly: (p, c) => { const f = (p * c - 1) / (c - 1); return isFinite(f) ? Math.max(0, f) : 0; },
  arb(odds){
    const s = odds.reduce((a,o)=>a + 1/o, 0);
    return { suma: s, roi: 1/s - 1, reparto: t => odds.map(o => t * (1/o) / s) };
  }
};

/* ============================ ESTADO ============================ */
const CFG_DEF = { bankrollInicial: 1000, moneda: '€', kelly: 0.25, tope: 3, refBook: 'Pinnacle', devig: 'potencia',
  // Parámetros de la pestaña Apuestas (la ruta de 10 € a 1.000 €).
  rSaldo: 10, rObjetivo: 1000, rMargen: 5, rMin: 0.10,
  // La cantidad de la pestaña Calculadora. Es lo único que se escribe allí, así que
  // se guarda como los demás parámetros: al volver a abrir tiene que seguir puesta.
  cImporte: 10 };
const S = { cfg: {...CFG_DEF}, bets: [], market: [], demo: true, db: null, dbReady: false, nube: null,
  // Estadística de la NBA leída de stats.nba.com: un elemento por equipo, más el
  // documento `_meta` (temporada y hora de lectura) aparte.
  nba: [], nbaMeta: null,
  // Al entrar: Fútbol seleccionado y SOLO los partidos de hoy (`auto` mantiene «hoy»
  // al día mientras nadie toque el calendario). El filtro de fecha no se guarda.
  ui: { deporte: 'futbol', liga: '', desde: '', hasta: '', auto: true, mes: '', pick: null } };

const uid = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ============================ DATOS DE EJEMPLO ============================ */
/* Las fechas del ejemplo cuelgan del día de hoy —dos partidos hoy y el resto repartidos
   por el mes— para que el filtro por días se pueda probar nada más abrir y para que no
   envejezcan solas. Las cuotas siguen siendo inventadas: lo dice el aviso del Mercado. */
const dosD = n => String(n).padStart(2, '0');
const isoLocal = d => d.getFullYear() + '-' + dosD(d.getMonth() + 1) + '-' + dosD(d.getDate())
  + 'T' + dosD(d.getHours()) + ':' + dosD(d.getMinutes());
function demoEn(dias, hora, min){
  const d = new Date(); d.setDate(d.getDate() + dias); d.setHours(hora, min || 0, 0, 0);
  return isoLocal(d);
}
// Hoy, dentro de un rato: así el partido de ejemplo no sale ya empezado y con guiones.
function demoDentro(minutos){
  const d = new Date(Date.now() + minutos * 60000), h = new Date();
  if (d.getDate() !== h.getDate()){ h.setHours(23, 45, 0, 0); return isoLocal(h); }
  d.setMinutes(Math.floor(d.getMinutes() / 15) * 15, 0, 0);
  return isoLocal(d);
}

const DEMO_MARKET = [
  { id:'d1', deporte:'Fútbol', liga:'LaLiga', local:'Real Madrid', visitante:'Espanyol', comienza:demoDentro(150), tipo:'1x2',
    casas:[['Pinnacle',1.30,6.00,10.00],['Bet365',1.28,5.75,9.50],['Betfair',1.29,6.10,10.50],['William Hill',1.27,5.80,9.75],['1xBet',1.31,6.20,11.75]] },
  { id:'d2', deporte:'Fútbol', liga:'Champions League', local:'Inter', visitante:'Arsenal', comienza:demoDentro(420), tipo:'1x2',
    casas:[['Pinnacle',2.62,3.45,2.72],['Bet365',2.55,3.40,2.70],['Betfair',2.60,3.50,2.75],['Betsson',2.80,3.35,2.65],['Codere',2.58,3.55,2.68]] },
  { id:'d3', deporte:'Fútbol', liga:'Serie A', local:'Nápoles', visitante:'Juventus', comienza:demoEn(2, 20, 45), tipo:'1x2',
    casas:[['Pinnacle',2.20,3.40,3.40],['Bet365',2.30,3.45,3.55],['Betsson',2.38,3.35,3.40],['1xBet',2.25,3.55,3.45],['Codere',2.28,3.40,3.50]] },
  { id:'d4', deporte:'Fútbol', liga:'Premier League', local:'Brighton', visitante:'Newcastle', comienza:demoEn(5, 16, 0), tipo:'1x2',
    casas:[['Pinnacle',2.35,3.60,3.05],['Bet365',2.30,3.55,3.00],['William Hill',2.38,3.50,3.10],['Betfair',2.36,3.65,3.05]] },
  { id:'d5', deporte:'Tenis', liga:'ATP 1000', local:'Alcaraz', visitante:'Sinner', comienza:demoEn(6, 15, 0), tipo:'2v',
    casas:[['Pinnacle',2.05,0,1.83],['Bet365',2.00,0,1.80],['Betfair',2.08,0,1.78],['1xBet',2.18,0,1.82]] }
  // El baloncesto de ejemplo (un Real Madrid - Panathinaikos de Euroliga) se quitó el
  // 14-09-2026 con el resto de competiciones. La NBA no juega hasta el 20 de octubre,
  // así que inventar aquí un partido suyo sería exactamente lo que este panel no hace.
];

/* ============================ FORMATO ============================ */
const nf = (n, d = 2) => (n == null || !isFinite(n)) ? '—' : Number(n).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = n => (n < 0 ? '−' : '') + nf(Math.abs(n), 2) + ' ' + S.cfg.moneda;
const moneySigned = n => (n > 0 ? '+' : n < 0 ? '−' : '') + nf(Math.abs(n), 2) + ' ' + S.cfg.moneda;
const pctS = (n, d = 1) => (n > 0 ? '+' : n < 0 ? '−' : '') + nf(Math.abs(n * 100), d) + ' %';
const pctP = (n, d = 1) => nf(n * 100, d) + ' %';
// Las cuotas se escriben como las escribe Bet365: dos decimales, o tres si el tercero
// no es cero (en vivo aparecen cosas como 1,071 y redondearlas descuadra la comparación).
const nfC = c => nf(c, (Math.round(Number(c) * 1000) % 10) ? 3 : 2);
const fechaCorta = s => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }); };
const fechaHora = s => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? s : d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
