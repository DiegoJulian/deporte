import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/config/index.js';
import { computeConsensus } from '../src/consensus/index.js';
import { oddsQualityScore } from '../src/quality/index.js';
import { market, q, NOW } from './helpers.js';
import { sum } from '../src/core/numeric.js';

const cfg = DEFAULT_CONFIG;

const tresCasas = (odds: readonly (readonly [string, number, number, number])[]) =>
  market('m', 'p', '1X2', 'THREE_WAY', [
    ['HOME', 'Local', odds.map(([b, h]) => q(b, h))],
    ['DRAW', 'Empate', odds.map(([b, , d]) => q(b, d))],
    ['AWAY', 'Visitante', odds.map(([b, , , a]) => q(b, a))],
  ]);

test('el consenso suma exactamente 1', () => {
  const m = tresCasas([['A', 1.80, 3.60, 4.50], ['B', 1.85, 3.50, 4.40], ['C', 1.78, 3.70, 4.60]]);
  const r = computeConsensus(m, cfg, { now: NOW });
  assert.ok(Math.abs(sum(r.consensus) - 1) < 1e-9);
  assert.equal(r.booksUsed, 3);
});

test('NO se promedian las inversas de las cuotas: cada casa se desmargina antes', () => {
  const m = tresCasas([['A', 1.80, 3.60, 4.50], ['B', 1.60, 4.20, 5.00]]);
  const r = computeConsensus(m, cfg, { now: NOW });
  const mediaIngenua = (1 / 1.80 + 1 / 1.60) / 2;
  assert.ok((r.consensus[0] as number) < mediaIngenua,
    'promediar 1/cuota deja el margen dentro y sale mas alto que el consenso correcto');
});

test('las casas que no cotizan el mercado completo quedan fuera y se avisa', () => {
  const m = market('m', 'p', '1X2', 'THREE_WAY', [
    ['HOME', 'Local', [q('A', 1.8), q('B', 1.85)]],
    ['DRAW', 'Empate', [q('A', 3.6)]],
    ['AWAY', 'Visitante', [q('A', 4.5), q('B', 4.4)]],
  ]);
  const r = computeConsensus(m, cfg, { now: NOW });
  assert.equal(r.booksUsed, 1);
  assert.equal(r.booksExcluded, 1);
  assert.ok(r.warnings.some((w) => w.includes('mercado completo')));
});

test('una casa disparatada se marca atipica y no entra en el consenso', () => {
  const m = tresCasas([
    ['A', 1.80, 3.60, 4.50], ['B', 1.82, 3.55, 4.45], ['C', 1.79, 3.62, 4.52],
    ['D', 1.81, 3.58, 4.48], ['E', 1.80, 3.60, 4.50], ['MALA', 4.50, 3.60, 1.80],
  ]);
  const r = computeConsensus(m, cfg, { now: NOW });
  const mala = r.books.find((b) => b.bookmaker === 'MALA');
  assert.equal(mala?.outlier, true);
  assert.equal(mala?.weight, 0);
});

test('con una sola casa, el consenso avisa de que no es un consenso', () => {
  const r = computeConsensus(tresCasas([['A', 1.8, 3.6, 4.5]]), cfg, { now: NOW });
  assert.ok(r.warnings.some((w) => w.includes('no es un consenso, es un precio')));
});

test('la dispersion distingue el caso del encargo: 70/71/69 frente a 70/61/78', () => {
  const junto = tresCasas([['A', 1.80, 3.60, 4.50], ['B', 1.82, 3.56, 4.46], ['C', 1.78, 3.64, 4.54]]);
  const suelto = tresCasas([['A', 1.80, 3.60, 4.50], ['B', 1.45, 4.60, 6.50], ['C', 2.30, 3.10, 3.20]]);
  const d1 = computeConsensus(junto, cfg, { now: NOW }).dispersion[0] as number;
  const d2 = computeConsensus(suelto, cfg, { now: NOW }).dispersion[0] as number;
  assert.ok(d2 > 5 * d1, `${d2} deberia ser mucho mayor que ${d1}`);
});

test('las casas con menos margen pesan mas en el consenso', () => {
  const m = tresCasas([['AFILADA', 1.95, 3.80, 4.10], ['CARA', 1.70, 3.30, 3.80]]);
  const r = computeConsensus(m, cfg, { now: NOW });
  const afilada = r.books.find((b) => b.bookmaker === 'AFILADA');
  const cara = r.books.find((b) => b.bookmaker === 'CARA');
  assert.ok((afilada?.weight as number) > (cara?.weight as number));
  assert.ok((afilada?.overround as number) < (cara?.overround as number));
});

test('una cuota vieja pesa menos que una fresca', () => {
  const m = market('m', 'p', '1X2', 'THREE_WAY', [
    ['HOME', 'L', [q('FRESCA', 1.8, 0), q('VIEJA', 1.8, 24 * 3600_000)]],
    ['DRAW', 'X', [q('FRESCA', 3.6, 0), q('VIEJA', 3.6, 24 * 3600_000)]],
    ['AWAY', 'V', [q('FRESCA', 4.5, 0), q('VIEJA', 4.5, 24 * 3600_000)]],
  ]);
  const r = computeConsensus(m, cfg, { now: NOW });
  assert.ok((r.books.find((b) => b.bookmaker === 'FRESCA')?.weight as number) >
    (r.books.find((b) => b.bookmaker === 'VIEJA')?.weight as number));
});

// --- Calidad de la cuota ---

test('la calidad baja con el margen, la dispersion y la antiguedad', () => {
  const base = { overround: 0.04, marketComplete: true, booksUsed: 8, dispersion: 0.004, ageMs: 0, live: false };
  const bueno = oddsQualityScore(base, cfg).score;
  assert.ok(bueno > 75, `calidad base ${bueno}`);
  assert.ok(oddsQualityScore({ ...base, overround: 0.15 }, cfg).score < bueno);
  assert.ok(oddsQualityScore({ ...base, dispersion: 0.05 }, cfg).score < bueno);
  assert.ok(oddsQualityScore({ ...base, ageMs: 48 * 3600_000 }, cfg).score < bueno);
  assert.ok(oddsQualityScore({ ...base, booksUsed: 1 }, cfg).score < bueno);
});

test('en vivo, la cuota caduca mucho antes que en prepartido', () => {
  const base = { overround: 0.04, marketComplete: true, booksUsed: 5, dispersion: 0.004, ageMs: 5 * 60_000 };
  const pre = oddsQualityScore({ ...base, live: false }, cfg).score;
  const vivo = oddsQualityScore({ ...base, live: true }, cfg).score;
  assert.ok(vivo < pre / 2, 'cinco minutos en directo es una eternidad');
});

test('la calidad NUNCA modifica la cuota: solo devuelve un numero', () => {
  const r = oddsQualityScore({ overround: 0.2, marketComplete: false, booksUsed: 1, dispersion: null, ageMs: 0, live: false }, cfg);
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.ok(r.reasons.length > 0);
});
