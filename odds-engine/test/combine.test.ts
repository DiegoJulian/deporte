import test from 'node:test';
import assert from 'node:assert/strict';
import { combinedOdds, jointProbability } from '../src/combine/index.js';
import { buildGrid, evaluate } from '../src/correlation/scoreGrid.js';
import { P } from '../src/correlation/predicates.js';
import type { CorrelationLeg } from '../src/correlation/engine.js';

const leg = (id: string, matchId: string, marketId: string, fair: number, odds: number, predicate?: CorrelationLeg['predicate']): CorrelationLeg =>
  ({ selectionId: id, matchId, marketId, fair, odds, ...(predicate !== undefined ? { predicate } : {}) });

test('la cuota combinada del ejemplo del encargo es 1,4168', () => {
  const r = combinedOdds([1.10, 1.12, 1.15]);
  assert.ok(Math.abs(r.odds - 1.4168) < 1e-9);
  assert.ok(Math.abs(1 / r.odds - 0.70582) < 1e-5);
});

test('mas patas NUNCA sube la probabilidad conjunta', () => {
  const legs = [0.9, 0.9, 0.9, 0.9].map((f, i) => leg(`s${i}`, `p${i}`, `m${i}`, f, 1 / f));
  let prev = 1;
  for (let n = 1; n <= 4; n++) {
    const r = jointProbability({ legs: legs.slice(0, n), uncertainties: new Array(n).fill(0), grids: new Map() });
    assert.ok(r.adjustedJointProbability <= prev + 1e-12, 'anadir una pata subio la probabilidad');
    prev = r.adjustedJointProbability;
  }
  assert.ok(Math.abs(prev - 0.9 ** 4) < 1e-12);
});

test('0,90 x 0,90 = 81 % y 0,90^3 = 72,9 %, como dice el encargo', () => {
  const two = jointProbability({
    legs: [leg('a', 'p1', 'm1', 0.9, 1.15), leg('b', 'p2', 'm2', 0.9, 1.15)],
    uncertainties: [0, 0], grids: new Map(),
  });
  assert.ok(Math.abs(two.adjustedJointProbability - 0.81) < 1e-12);
  const three = jointProbability({
    legs: ['p1', 'p2', 'p3'].map((m, i) => leg(`s${i}`, m, `m${i}`, 0.9, 1.15)),
    uncertainties: [0, 0, 0], grids: new Map(),
  });
  assert.ok(Math.abs(three.adjustedJointProbability - 0.729) < 1e-12);
});

test('EL PUNTO CLAVE: el margen de la combinada es COMPUESTO, no repartido', () => {
  // Reproduce la tabla medida en `margen-por-banda-de-cuota.md`.
  const casos: [number, number, number][] = [
    [-0.0147, 3, -0.0435], // 3 patas a 1,359 -> -4,35 % (medido -4,33 %)
    [-0.0178, 5, -0.0859], // 5 patas a 1,202 -> -8,59 % (medido -8,58 %)
    [-0.0160, 4, -0.0625], // 4 patas a 1,259 -> -6,25 % (medido -6,24 %)
    [-0.0104, 6, -0.0608], // 6 patas a 1,166 -> -6,08 % (medido -6,07 %)
  ];
  for (const [evPata, n, esperado] of casos) {
    const legs = Array.from({ length: n }, (_, i) => {
      const odds = 1.3;
      return leg(`s${i}`, `p${i}`, `m${i}`, (1 + evPata) / odds, odds);
    });
    const r = jointProbability({ legs, uncertainties: new Array(n).fill(0), grids: new Map() });
    assert.ok(Math.abs(-r.compoundMargin - esperado) < 5e-4,
      `${n} patas: esperado ${esperado}, calculado ${-r.compoundMargin}`);
  }
});

test('el peaje compuesto crece con el numero de patas a igualdad de peaje por pata', () => {
  const mk = (n: number) => jointProbability({
    legs: Array.from({ length: n }, (_, i) => leg(`s${i}`, `p${i}`, `m${i}`, 0.98 / 1.3, 1.3)),
    uncertainties: new Array(n).fill(0), grids: new Map(),
  }).compoundMargin;
  assert.ok(mk(1) < mk(3));
  assert.ok(mk(3) < mk(6));
});

test('raw, fair y ajustada son tres numeros distintos y no se confunden', () => {
  const g = buildGrid(1.6, 1.0, -0.08);
  const a = P.homeWin(); const b = P.over(2.5);
  const pa = evaluate(g, a).win; const pb = evaluate(g, b).win;
  const r = jointProbability({
    legs: [leg('A', 'p1', 'm1', pa, 1 / pa * 0.95, a), leg('B', 'p1', 'm2', pb, 1 / pb * 0.95, b)],
    uncertainties: [0.002, 0.002], grids: new Map([['p1', g]]),
  });
  assert.ok(Math.abs(r.fairJointProbability - pa * pb) < 1e-12);
  assert.ok(r.adjustedJointProbability > r.fairJointProbability, 'hay correlacion positiva');
  // La raw lleva el margen DENTRO, una vez por pata: por eso es la mayor de las tres.
  assert.ok(r.rawJointProbability > r.fairJointProbability,
    'la raw infla la probabilidad tantas veces como patas tenga la combinada');
  assert.ok(Math.abs(r.rawJointProbability - 1 / r.combinedOdds) < 1e-12);
});

test('la cota inferior nunca cae por debajo de la cota de Frechet', () => {
  const r = jointProbability({
    legs: [leg('A', 'p1', 'm1', 0.7, 1.4), leg('B', 'p1', 'm2', 0.6, 1.6)],
    uncertainties: [0.05, 0.05], grids: new Map(),
  });
  assert.ok(r.adjustedLowerBound >= r.frechetLow - 1e-12);
  assert.ok(r.adjustedLowerBound <= r.adjustedJointProbability);
});

test('sin modelo, las patas del mismo partido arrastran una banda ancha', () => {
  const sinModelo = jointProbability({
    legs: [leg('A', 'p1', 'm1', 0.7, 1.4), leg('B', 'p1', 'm2', 0.6, 1.6)],
    uncertainties: [0.001, 0.001], grids: new Map(),
  });
  const distintoPartido = jointProbability({
    legs: [leg('A', 'p1', 'm1', 0.7, 1.4), leg('B', 'p2', 'm2', 0.6, 1.6)],
    uncertainties: [0.001, 0.001], grids: new Map(),
  });
  assert.ok(sinModelo.uncertainty > 10 * distintoPartido.uncertainty,
    'no poder calcular la correlacion tiene que subir la incertidumbre, no pasar desapercibido');
  assert.ok(sinModelo.warnings.some((w) => w.includes('sin modelo de marcadores')));
});
