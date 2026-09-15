import test from 'node:test';
import assert from 'node:assert/strict';
import { kellyGrowth, marketPrior, combinedMarketPrior, rankCombination, compareCombinations, type Rankable } from '../src/rank/index.js';

test('sin ventaja, Kelly no apuesta y el crecimiento es cero', () => {
  const r = kellyGrowth(0.49, 2.0);
  assert.equal(r.fraction, 0);
  assert.equal(r.growth, 0);
});

test('con ventaja, Kelly da la fraccion clasica (p*c-1)/(c-1)', () => {
  const r = kellyGrowth(0.55, 2.0);
  assert.ok(Math.abs(r.fraction - 0.10) < 1e-12);
  assert.ok(r.growth > 0);
});

test('a igual EV, mas varianza da menos crecimiento', () => {
  // EV = +5 % en los dos casos, pero uno a cuota 1,2 y otro a cuota 10.
  const corto = kellyGrowth(1.05 / 1.2, 1.2);
  const largo = kellyGrowth(1.05 / 10, 10);
  assert.ok(corto.growth > largo.growth, 'la cuota larga tiene que puntuar peor a igual EV');
});

test('el prior de mercado es negativo: sin informacion se paga peaje', () => {
  const p = marketPrior(2.512, 'all');
  assert.ok(p < 1 / 2.512, 'el prior tiene que estar por debajo de la probabilidad bruta');
  assert.ok(Math.abs(p * 2.512 - 1 - (-0.0701)) < 1e-6, 'el EV del prior es el peaje medido de la banda');
});

test('confianza cero no da EV cero: da el peaje', () => {
  const r = rankCombination({
    adjustedJointProbability: 0.60, adjustedLowerBound: 0.55, combinedOdds: 2.512,
    confidence: 0, correlationRisk: 'LOW', legs: 3, compoundMargin: 0.05,
  });
  assert.ok(Math.abs(r.expectedValue - (-0.0701)) < 1e-6);
  assert.equal(r.hasEdge, false);
  assert.equal(r.score, 0);
});

test('confianza plena si usa la probabilidad ajustada', () => {
  const r = rankCombination({
    adjustedJointProbability: 0.60, adjustedLowerBound: 0.55, combinedOdds: 2.512,
    confidence: 100, correlationRisk: 'LOW', legs: 3, compoundMargin: 0.05,
  });
  assert.ok(Math.abs(r.posteriorProbability - 0.60) < 1e-12);
  assert.ok(r.expectedValue > 0.5);
  assert.equal(r.hasEdge, true);
});

test('el modo conservador usa la cota inferior', () => {
  const normal = rankCombination({ adjustedJointProbability: 0.45, adjustedLowerBound: 0.38, combinedOdds: 2.512, confidence: 100, correlationRisk: 'LOW', legs: 3, compoundMargin: 0.05 });
  const cons = rankCombination({ adjustedJointProbability: 0.45, adjustedLowerBound: 0.38, combinedOdds: 2.512, confidence: 100, correlationRisk: 'LOW', legs: 3, compoundMargin: 0.05, conservative: true });
  assert.ok(cons.expectedValue < normal.expectedValue);
  assert.ok(Math.abs(cons.posteriorProbability - 0.38) < 1e-12);
});

test('el ranking NO premia la probabilidad por si misma', () => {
  // Una combinada muy probable pero cara y otra menos probable con ventaja.
  const probable = rankCombination({ adjustedJointProbability: 0.90, adjustedLowerBound: 0.89, combinedOdds: 1.05, confidence: 95, correlationRisk: 'LOW', legs: 1, compoundMargin: 0.055 });
  const conValor = rankCombination({ adjustedJointProbability: 0.45, adjustedLowerBound: 0.44, combinedOdds: 2.512, confidence: 95, correlationRisk: 'LOW', legs: 3, compoundMargin: -0.13 });
  assert.equal(probable.hasEdge, false, '90 % a cuota 1,05 es EV negativo: 0,90 x 1,05 = 0,945');
  assert.ok(conValor.score > probable.score);
});

test('el desempate sigue el orden de prioridades del encargo', () => {
  const base = { adjustedJointProbability: 0.4, adjustedLowerBound: 0.4, combinedOdds: 2.512, confidence: 80, correlationRisk: 'LOW' as const, legs: 3, compoundMargin: 0.05 };
  const mk = (legs: number, risk: Rankable['correlationRisk'], conf: number): Rankable => ({
    rank: rankCombination({ ...base, legs }), legs, correlationRisk: risk, confidence: conf,
  });
  const menosPatas = mk(2, 'LOW', 80);
  const masPatas = mk(5, 'LOW', 80);
  assert.ok(compareCombinations(menosPatas, masPatas) < 0, 'menos patas primero');

  const pocaCorr = mk(3, 'LOW', 80);
  const muchaCorr = mk(3, 'HIGH', 80);
  assert.ok(compareCombinations(pocaCorr, muchaCorr) < 0, 'menos correlacion primero');

  const masConf = mk(3, 'LOW', 90);
  const menosConf = mk(3, 'LOW', 60);
  assert.ok(compareCombinations(masConf, menosConf) < 0, 'mas confianza primero');
});

/* ------------------------------------------------------------------------
   El prior de una combinada se compone pata a pata. Leer la banda de la cuota
   TOTAL es extrapolar una tabla medida sobre simples, y siempre hacia el lado
   malo: subestima el peaje y la combinada parece mejor de lo que es.
   ------------------------------------------------------------------------ */
test('el prior de una combinada compone el peaje de cada pata, no lee la banda de la cuota total', () => {
  const patas = [1.62, 1.62, 1.62];                 // ~4,25 de cuota combinada
  const combinada = patas.reduce((a, b) => a * b, 1);

  const compuesto = combinedMarketPrior(patas, 'all');
  const extrapolado = marketPrior(combinada, 'all');

  // Tres peajes de la banda 1,55-1,70 (-3,46 % cada uno) pesan mas que uno solo
  // de la banda 3,30-4,50 (-8,10 %): 0,9654^3 = 0,8998 frente a 0,9190.
  assert.ok(compuesto < extrapolado,
    `el prior compuesto (${compuesto}) tiene que ser MENOR que el extrapolado (${extrapolado})`);

  // Y tiene que valer exactamente el producto de los priores de cada pata.
  const aMano = patas.reduce((a, o) => a * marketPrior(o, 'all'), 1);
  assert.ok(Math.abs(compuesto - aMano) < 1e-12);
});

test('pasar legOdds baja el EV de la combinada: deja de regalarse peaje', () => {
  const base = {
    adjustedJointProbability: 0.235, adjustedLowerBound: 0.22,
    combinedOdds: 4.25, confidence: 40, correlationRisk: 'LOW' as const,
    legs: 3, compoundMargin: 0.10,
  };
  const sinPatas = rankCombination(base);
  const conPatas = rankCombination({ ...base, legOdds: [1.62, 1.62, 1.62] });

  assert.ok(conPatas.posteriorProbability < sinPatas.posteriorProbability);
  assert.ok(conPatas.expectedValue < sinPatas.expectedValue,
    'con el peaje compuesto bien contado, el EV solo puede bajar');
});
