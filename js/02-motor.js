/* Cuota Justa · js/02-motor.js
   Motor de valor: probabilidad justa y mejor cuota por partido, beneficio de una apuesta y movimiento desde la apertura.
   Script clásico (no módulo): comparte el ámbito global con los demás y se carga en
   el orden de index.html. */
"use strict";
/* ============================ MOTOR DE VALOR ============================ */
// Devuelve, por evento, prob. justa de cada resultado + mejor cuota y casa
function analizar(ev){
  const n = ev.tipo === '1x2' ? 3 : 2;
  const idx = ev.tipo === '1x2' ? [1,2,3] : [1,3];
  const libros = ev.casas.map(c => ({ casa: c[0], cuotas: idx.map(i => Number(c[i])) }))
                         .filter(l => l.cuotas.every(v => v > 1));
  if (!libros.length) return null;

  const ref = libros.find(l => l.casa.toLowerCase() === String(S.cfg.refBook).toLowerCase()) || (libros.length === 1 ? libros[0] : null);
  let p, fuente;
  if (ref){ p = M.devig(ref.cuotas, S.cfg.devig); fuente = ref.casa; }
  else {
    const todas = libros.map(l => M.devig(l.cuotas, S.cfg.devig));
    p = Array.from({length:n}, (_, i) => todas.reduce((a, t) => a + t[i], 0) / todas.length);
    const t = p.reduce((a,b)=>a+b,0); p = p.map(x => x/t);
    fuente = 'media de ' + libros.length + ' casas';
  }

  const filtro = S.cfg.casaObjetivo;
  const cand = filtro ? libros.filter(l => l.casa === filtro) : libros;
  const usar = cand.length ? cand : libros;

  const res = [];
  for (let i = 0; i < n; i++){
    let mejor = usar[0], mc = usar[0].cuotas[i];
    for (const l of usar) if (l.cuotas[i] > mc){ mc = l.cuotas[i]; mejor = l; }
    const ev_ = M.ev(p[i], mc);
    const k = M.kelly(p[i], mc);
    res.push({ i, p: p[i], cuotaJusta: 1/p[i], mejorCuota: mc, casa: mejor.casa, ev: ev_, kelly: k });
  }
  const mejores = libros.length ? Array.from({length:n}, (_, i) => Math.max(...libros.map(l => l.cuotas[i]))) : [];
  const arb = M.arb(mejores);
  return { p, fuente, res, margenRef: ref ? M.margen(ref.cuotas) : null, arb, libros };
}

/* ============================ CÁLCULO DE APUESTAS ============================ */
/* El beneficio de una apuesta. Manda el retorno que escribe Bet365 en el pie del
   boleto («Ganancias»), porque es el dinero que de verdad devolvió: en un boleto de
   15,10 € a 1,83 la casa pagó 27,69 €, no los 27,63 que salen de multiplicar. Solo
   se calcula a partir de la cuota cuando el recorte no traía el retorno. */
function resultado(b){
  const c = Number(b.cuota), s = Number(b.stake);
  if (b.estado === 'pendiente') return null;
  if (b.retorno != null && isFinite(Number(b.retorno)) && isFinite(s)) return Number(b.retorno) - s;
  switch (b.estado){
    case 'ganada': case 'cobrada': return s * (c - 1);
    case 'perdida': return -s;
    case 'nula': return 0;
    case 'media-ganada': return s * (c - 1) / 2;
    case 'media-perdida': return -s / 2;
    default: return null;
  }
}
const resueltas = () => S.bets.filter(b => b.estado !== 'pendiente')
  .slice().sort((a,b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
const bankrollActual = () => S.cfg.bankrollInicial + resueltas().reduce((a,b) => a + (resultado(b) || 0), 0);

/* ============================ MERCADO: HISTÓRICO ============================ */
// Variación de cada resultado frente a la primera lectura guardada
/* La referencia de «cuánto se ha movido» es la cuota de APERTURA de Bet365, que viene
   en la misma respuesta que la cuota viva y se guarda en `apertura`. Antes se usaba la
   primera lectura del panel, que no es la apertura de nadie: el 13-09 el Brest–PSG
   salía «abrió 10,00» porque esa fue la primera vez que se miró, cuando Bet365 lo
   había abierto en 8,00 y ya iba por 12,00. Si un partido entró sin `apertura`, se cae
   a la primera lectura y la etiqueta lo dice: «desde», no «abrió». */
function movimiento(e){
  const h = e.historial || [];
  // La cuota «de ahora» sale de `casas`, que es exactamente el número que pinta la
  // fila. Tomarla del último punto del histórico haría que el porcentaje pudiese
  // referirse a otra cuota distinta de la que se está viendo.
  const ult = (Array.isArray(e.casas) && e.casas[0]) ? [e.casas[0][1], e.casas[0][2], e.casas[0][3]]
            : (h.length ? h[h.length - 1].c : null);
  if (!ult) return null;
  const real = Array.isArray(e.apertura) && e.apertura.length === ult.length;
  const base = real ? e.apertura : (h.length > 1 ? h[0].c : null);
  if (!base) return null;
  return base.map((x, i) => (x > 1 && ult[i] > 1) ? { de: x, a: ult[i], d: ult[i] - x, real } : null);
}

function sparkline(e, idx){
  const h = (e.historial || []).map(x => x.c[idx]).filter(v => v > 1);
  if (h.length < 3) return '';
  const lo = Math.min(...h), hi = Math.max(...h), W = 54, H = 14;
  if (hi - lo < 1e-9) return '';
  const pts = h.map((v, i) => (i / (h.length - 1) * W).toFixed(1) + ',' + (H - (v - lo) / (hi - lo) * H).toFixed(1)).join(' ');
  const sube = h[h.length - 1] >= h[0];
  return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${sube ? 'var(--pos)' : 'var(--neg)'}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}
