import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/config/index.js';
import { validateMarket } from '../src/market/validator.js';
import { checkCoherence } from '../src/market/coherence.js';
import { computeMarketProbabilities } from '../src/market/fairProbability.js';
import { oneX2, overUnder, market, q } from './helpers.js';

const cfg = DEFAULT_CONFIG;

test('un 1X2 normal pasa la validacion y devuelve su margen', () => {
  const r = validateMarket(oneX2('m1', 'p1', 'Bet365', 1.8, 3.6, 4.5), cfg, 'Bet365');
  assert.equal(r.usable, true);
  assert.ok(Math.abs((r.overround as number) - 0.0555555) < 1e-6);
});

test('margen negativo se marca como ERROR y se explica que es anulable', () => {
  const r = validateMarket(oneX2('m1', 'p1', 'Bet365', 3.2, 3.8, 3.4), cfg, 'Bet365');
  assert.equal(r.usable, false);
  const issue = r.issues.find((i) => i.code === 'MARGEN_NEGATIVO');
  assert.ok(issue !== undefined);
  assert.ok(issue?.message.includes('anular'));
});

test('un 1X2 con dos salidas se rechaza', () => {
  const m = market('m', 'p', '1X2', 'THREE_WAY', [
    ['HOME', 'Local', [q('Bet365', 1.8)]],
    ['AWAY', 'Visitante', [q('Bet365', 2.1)]],
  ]);
  assert.equal(validateMarket(m, cfg, 'Bet365').usable, false);
});

test('si la casa no cotiza todas las salidas, el margen no se calcula', () => {
  const m = market('m', 'p', '1X2', 'THREE_WAY', [
    ['HOME', 'Local', [q('Bet365', 1.8)]],
    ['DRAW', 'Empate', [q('Otra', 3.6)]],
    ['AWAY', 'Visitante', [q('Bet365', 4.5)]],
  ]);
  const r = validateMarket(m, cfg, 'Bet365');
  assert.equal(r.overround, null);
  assert.equal(r.usable, false);
});

test('margen por encima del tope configurado avisa pero no invalida', () => {
  const r = validateMarket(oneX2('m', 'p', 'B', 1.5, 3.0, 3.0), cfg, 'B');
  assert.equal(r.usable, true);
});

test('el mercado completo produce FAIR_SINGLE_BOOK y suma 1', () => {
  const p = computeMarketProbabilities(oneX2('m', 'p', 'B', 1.8, 3.6, 4.5), 'B', cfg);
  assert.equal(p.outcomes.length, 3);
  assert.ok(p.outcomes.every((o) => o.source === 'FAIR_SINGLE_BOOK'));
  const s = p.outcomes.reduce((a, o) => a + o.fair, 0);
  assert.ok(Math.abs(s - 1) < 1e-9);
  assert.ok(p.outcomes.every((o) => o.fair < o.raw), 'quitar margen baja todas las probabilidades');
});

test('el mercado incompleto cae al camino de una sola cuota, no a fair', () => {
  const m = market('m', 'p', '1X2', 'THREE_WAY', [
    ['HOME', 'Local', [q('B', 1.8)]],
    ['DRAW', 'Empate', [q('Otra', 3.6)]],
    ['AWAY', 'Visitante', [q('B', 4.5)]],
  ]);
  const p = computeMarketProbabilities(m, 'B', cfg);
  assert.ok(p.outcomes.every((o) => o.source !== 'FAIR_SINGLE_BOOK'));
});

test('raw y fair nunca se confunden: raw viene de 1/cuota exactamente', () => {
  const p = computeMarketProbabilities(overUnder('m', 'p', 'B', 1.9, 1.95), 'B', cfg);
  p.outcomes.forEach((o) => assert.ok(Math.abs(o.raw - 1 / o.odds) < 1e-12));
});

test('la coherencia entre 1X2 y doble oportunidad detecta el precio mal puesto', () => {
  const threeWay = { home: 0.5374, draw: 0.2584, away: 0.2041 };
  const ok = checkCoherence({ threeWay, doubleChance: { homeOrDraw: 0.5374 + 0.2584 } });
  assert.equal(ok.incoherent, false);

  const mal = checkCoherence({ threeWay, doubleChance: { homeOrDraw: 0.74 } });
  assert.equal(mal.incoherent, true);
  assert.ok(Math.abs(mal.maxDeltaPoints) > 0.05);
});

test('el empate no valido se deriva del 1X2 renormalizando sin el empate', () => {
  const threeWay = { home: 0.5, draw: 0.25, away: 0.25 };
  const r = checkCoherence({ threeWay, drawNoBet: { home: 0.5 / 0.75 } });
  assert.equal(r.incoherent, false);
  assert.ok(Math.abs((r.checks.find((c) => c.market === 'DNB')?.deltaPoints ?? 1)) < 1e-9);
});
