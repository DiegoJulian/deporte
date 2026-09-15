/**
 * Demostracion de los cuatro resultados que importan.
 * Ejecutar con:  npx tsx examples/demo.ts
 */
import { devigAll } from '../src/devig/methods.js';
import { estimateFromSingleOdds } from '../src/devig/singleOdds.js';
import { fitGridFromMarkets, evaluate, jointOnGrid } from '../src/correlation/scoreGrid.js';
import { P } from '../src/correlation/predicates.js';
import { jointProbability } from '../src/combine/index.js';
import { rankCombination } from '../src/rank/index.js';
import { checkClaim, requiredSampleSize } from '../src/calibration/index.js';
import { DEFAULT_CONFIG } from '../src/config/index.js';

const pct = (x: number): string => `${(x * 100).toFixed(2)} %`;
const line = (t: string): void => console.log(`\n${'='.repeat(74)}\n${t}\n${'='.repeat(74)}`);

// ---------------------------------------------------------------------------
line('1. UNA CUOTA NO ES UNA PROBABILIDAD: cinco formas de quitar el margen');

const odds1x2 = [1.80, 3.60, 4.50];
const raw = odds1x2.map((o) => 1 / o);
console.log(`Cuotas  ${odds1x2.join(' / ')}`);
console.log(`Brutas  ${raw.map(pct).join('  ')}   suma ${pct(raw.reduce((a, b) => a + b, 0))}`);
console.log(`Overround ${pct(raw.reduce((a, b) => a + b, 0) - 1)}\n`);
for (const [name, r] of Object.entries(devigAll(raw))) {
  console.log(`  ${name.padEnd(13)} ${r.fair.map(pct).join('  ')}${r.parameter === null ? '' : `   parametro ${r.parameter.toFixed(5)}`}`);
}
console.log(`\n  La horquilla entre metodos para el favorito es de ${pct(0.537438 - 0.526316)}.`);
console.log('  Ese ancho NO es ruido: es el margen de eleccion del modelo, y va al confidenceScore.');

console.log('\n  Con UNA sola cuota (1.35) y sin mercado completo:');
const solo = estimateFromSingleOdds(1.35, { universe: 'top' });
console.log(`    bruta ${pct(solo.raw)} -> estimada ${pct(solo.estimated)} +- ${pct(solo.uncertainty)}  [${solo.source}]`);

// ---------------------------------------------------------------------------
line('2. CORRELACION: el ejemplo del encargo, con numeros');

const fit = fitGridFromMarkets([
  { key: '1X2:HOME', predicate: P.homeWin(), probability: 0.5374 },
  { key: '1X2:DRAW', predicate: P.draw(), probability: 0.2584 },
  { key: 'OU:OVER@2.5', predicate: P.over(2.5), probability: 0.5000 },
  { key: 'BTTS:YES', predicate: P.bttsYes(), probability: 0.5285 },
]);
if (fit === null) throw new Error('sin ajuste');
const g = fit.grid;
console.log(`Distribucion de marcadores ajustada A LAS PROPIAS CUOTAS del partido:`);
console.log(`  lambda ${g.lambda.toFixed(3)}  mu ${g.mu.toFixed(3)}  rho ${g.rho.toFixed(3)}  error max ${pct(fit.maxAbsError)}\n`);

const A = P.homeWin(); const B = P.teamOver('HOME', 1.5); const C = P.doubleChanceHomeDraw();
const pA = evaluate(g, A).win; const pB = evaluate(g, B).win; const pC = evaluate(g, C).win;
console.log(`  A = gana el local        ${pct(pA)}`);
console.log(`  B = el local marca 2+    ${pct(pB)}`);
console.log(`  C = el rival no gana     ${pct(pC)}\n`);
const ingenua = pA * pB * pC;
const real = jointOnGrid(g, [A, B, C], 'STRICT');
console.log(`  P(A) x P(B) x P(C)  =  ${pct(ingenua)}   <- lo que da multiplicar`);
console.log(`  P(A y B y C)        =  ${pct(real)}   <- lo que vale de verdad`);
console.log(`  Factor: x${(real / ingenua).toFixed(3)}\n`);
console.log(`  Si la casa cotizase estas tres patas multiplicando, pagaria ${(1 / ingenua).toFixed(2)}`);
console.log(`  por un suceso del ${pct(real)}: un EV de ${pct(real / ingenua - 1)}.`);
console.log(`  Ahi, y no en buscar favoritos, es donde vive la ventaja.\n`);
console.log(`  Y al reves: gana el local + ambos marcan`);
const D = P.bttsYes();
const rn = jointOnGrid(g, [A, D], 'STRICT');
console.log(`    ingenua ${pct(pA * evaluate(g, D).win)}  real ${pct(rn)}  factor x${(rn / (pA * evaluate(g, D).win)).toFixed(3)} -> multiplicar SOBREVALORA`);

// ---------------------------------------------------------------------------
line('3. EL PEAJE DE LA COMBINADA ES COMPUESTO');

console.log('Llegar a cuota 2,5120 repartido en N patas, con el peaje medido por banda:\n');
console.log('  Patas  Cuota/pata  Peaje/pata  Peaje combinada  P(cobrar)');
for (const n of [1, 2, 3, 4, 5, 6]) {
  const cuota = 2.5120 ** (1 / n);
  const ev = [-0.053, -0.0338, -0.0147, -0.016, -0.0178, -0.0104][n - 1] as number;
  const legs = Array.from({ length: n }, (_, i) => ({
    selectionId: `s${i}`, matchId: `p${i}`, marketId: `m${i}`, fair: (1 + ev) / cuota, odds: cuota,
  }));
  const j = jointProbability({ legs, uncertainties: new Array(n).fill(0.002), grids: new Map() });
  console.log(`  ${String(n).padStart(5)}  ${cuota.toFixed(4).padStart(10)}  ${pct(ev).padStart(10)}  ${pct(-j.compoundMargin).padStart(15)}  ${pct(j.adjustedJointProbability).padStart(9)}`);
}
console.log('\n  La ultima columna casi no se mueve: la probabilidad de cobrar la fija la');
console.log('  cuota total, no el numero de patas. Lo unico que cambia es lo que se paga.');

// ---------------------------------------------------------------------------
line('4. RANKING: por que no se ordena por probabilidad');

const casos: [string, number, number][] = [
  ['Favorito cortisimo  ', 0.90, 1.05],
  ['Combinada tipica    ', 0.398, 2.5120],
  ['Con ventaja real    ', 0.45, 2.5120],
];
console.log('  Caso                     P        Cuota     EV        Kelly     Score');
for (const [label, p, o] of casos) {
  const r = rankCombination({
    adjustedJointProbability: p, adjustedLowerBound: p - 0.01, combinedOdds: o,
    confidence: 95, correlationRisk: 'LOW', legs: 3, compoundMargin: 0.05,
  });
  console.log(`  ${label}  ${pct(p).padStart(7)}  ${o.toFixed(4)}  ${pct(r.expectedValue).padStart(8)}  ${pct(r.kellyFraction).padStart(7)}  ${r.score.toFixed(1).padStart(7)}`);
}
console.log('\n  El 90 % a cuota 1,05 es el mas probable de los tres y el unico con');
console.log('  score CERO: 0,90 x 1,05 = 0,945. Perder el 5,5 % de media.');

// ---------------------------------------------------------------------------
line('5. CALIBRACION: comprobar que el VERDE cumple lo que promete');

console.log(`  Para distinguir un 85 % real de un 80 % hacen falta ${requiredSampleSize(0.85, 0.80)} combinadas resueltas.`);
console.log(`  Para distinguirlo de un 75 %, ${requiredSampleSize(0.85, 0.75)}.`);
console.log(`  Para afinar a un punto (85 % frente a 84 %), ${requiredSampleSize(0.85, 0.84)}.\n`);

const rng = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
for (const [label, realRate, n] of [['motor calibrado ', 0.85, 600], ['motor optimista ', 0.72, 600], ['muestra corta   ', 0.72, 40]] as [string, number, number][]) {
  const r = rng(7);
  const ps = Array.from({ length: n }, (_, i) => ({ id: `${i}`, probability: 0.85, outcome: (r() < realRate ? 1 : 0) as 0 | 1 }));
  const c = checkClaim(ps, 0.85, 'VERDE');
  console.log(`  ${label} -> ${c.verdict}`);
  console.log(`     ${c.message}`);
}

console.log(`\n  Umbral de confianza para validar un VERDE: ${DEFAULT_CONFIG.filters.greenValidationConfidence}/100.`);
