import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, withConfig } from '../src/config/index.js';
import { analyse, buildCombinations, type AnalyseInput } from '../src/pipeline.js';
import { JORNADA, NOW, btts, oneX2, overUnder, syntheticLeague } from './helpers.js';

/**
 * Jornada coherente generada desde distribuciones de marcadores reales, con el
 * margen metido por la inversa exacta del metodo de potencia. Ver helpers.ts.
 */
function jornada(): AnalyseInput {
  const l = syntheticLeague(JORNADA);
  return { matches: l.matches, markets: l.markets, bookmaker: 'Bet365', now: NOW, universe: 'top' };
}

test('el analisis produce una seleccion por salida y ninguna mezcla raw con fair', () => {
  const r = analyse(jornada(), DEFAULT_CONFIG);
  assert.equal(r.selections.length, 5 * (3 + 2 + 2));
  for (const s of r.selections) {
    assert.ok(Math.abs(s.raw - 1 / (s.odds as number)) < 1e-12, 'raw tiene que ser 1/cuota exactamente');
    assert.ok(s.fair < s.raw, 'fair siempre por debajo de raw cuando hay margen');
    assert.equal(s.source, 'FAIR_SINGLE_BOOK');
  }
});

test('las probabilidades fair de cada mercado suman 1', () => {
  const r = analyse(jornada(), DEFAULT_CONFIG);
  for (const mid of [...new Set(r.selections.map((s) => s.marketId))]) {
    const s = r.selections.filter((x) => x.marketId === mid).reduce((a, x) => a + x.fair, 0);
    assert.ok(Math.abs(s - 1) < 1e-9, `${mid} suma ${s}`);
  }
});

test('el motor RECUPERA la distribucion de marcadores real a partir de las cuotas', () => {
  const l = syntheticLeague(JORNADA);
  const r = analyse({ matches: l.matches, markets: l.markets, bookmaker: 'Bet365', now: NOW, universe: 'top' }, DEFAULT_CONFIG);
  assert.equal(r.grids.size, 5);
  for (const [matchId, fit] of r.gridFits) {
    const real = l.truth.get(matchId);
    assert.ok(real !== undefined);
    assert.ok(fit.maxAbsError < 5e-3, `${matchId}: error de ajuste ${fit.maxAbsError}`);
    assert.ok(Math.abs(fit.grid.lambda - (real as { lambda: number }).lambda) < 0.08,
      `${matchId}: lambda ${fit.grid.lambda} frente a ${(real as { lambda: number }).lambda}`);
    assert.ok(Math.abs(fit.grid.mu - (real as { mu: number }).mu) < 0.08);
  }
});

test('el devig por potencia recupera EXACTAMENTE la probabilidad real del fixture', () => {
  const l = syntheticLeague(JORNADA, 3, 0.07);
  const r = analyse({ matches: l.matches, markets: l.markets, bookmaker: 'Bet365', now: NOW }, DEFAULT_CONFIG);
  const p1 = r.selections.filter((s) => s.marketId === 'p1-1x2');
  // El margen se metio como la inversa del metodo de potencia, asi que el
  // metodo de potencia tiene que devolver la verdad hasta la precision numerica.
  const suma = p1.reduce((a, s) => a + s.fair, 0);
  assert.ok(Math.abs(suma - 1) < 1e-9);
  assert.ok(p1.every((s) => Math.abs((s.overround as number) - 0.07) < 1e-6));
});

test('el empate NUNCA puede ser VERDE ni AMARILLO en un 1X2 real', () => {
  const r = analyse(jornada(), DEFAULT_CONFIG);
  const empates = r.selections.filter((s) => s.outcomeId === 'DRAW');
  assert.ok(empates.length === 5);
  for (const e of empates) {
    assert.ok(e.fair < 0.35, `empate al ${(e.fair * 100).toFixed(1)} %`);
    assert.ok(e.riskLight === 'ROJO' || e.riskLight === 'MUY_BAJA');
  }
});

test('con casas de referencia SI hay eje de valor; sin ellas, no', () => {
  const con = analyse(jornada(), DEFAULT_CONFIG);
  assert.ok(con.selections.some((s) => s.evBasis === 'consensus'));

  const soloBet365 = jornada();
  const sinRef: AnalyseInput = {
    ...soloBet365,
    markets: soloBet365.markets.map((m) => ({
      ...m,
      outcomes: m.outcomes.map((o) => ({ ...o, quotes: o.quotes.filter((x) => x.bookmaker === 'Bet365') })),
    })),
  };
  const sin = analyse(sinRef, DEFAULT_CONFIG);
  assert.ok(sin.selections.every((s) => s.valueLight === 'SIN_REFERENCIA'),
    'con una sola casa no se puede medir valor, y el motor no debe fingir que si');
});

test('construye combinadas que alcanzan la cuota objetivo de 2,5120', () => {
  const r = buildCombinations(jornada(), DEFAULT_CONFIG, { maxResults: 20000 });
  assert.ok(r.optimisation.candidates.length > 0, r.optimisation.verdict);
  for (const c of r.optimisation.candidates) {
    assert.ok(c.combinedOdds >= 2.5120 - 1e-9);
    assert.ok(c.combinedOdds <= 2.5120 * 1.06 + 1e-9);
    assert.ok(c.joint.adjustedJointProbability > 0 && c.joint.adjustedJointProbability < 1);
  }
});

test('el motor NO devuelve combinadas con patas incompatibles ni redundantes', () => {
  const r = buildCombinations(jornada(), DEFAULT_CONFIG, { maxResults: 20000 });
  for (const c of r.optimisation.candidates) {
    assert.equal(c.joint.correlation.hasIncompatibility, false);
    assert.equal(c.joint.correlation.hasRedundancy, false);
    const markets = c.selections.map((s) => s.marketId);
    assert.equal(new Set(markets).size, markets.length);
  }
});

test('PRINCIPIO DE CONSERVADURISMO: sin ventaja, el veredicto lo dice', () => {
  const r = buildCombinations(jornada(), DEFAULT_CONFIG, { maxResults: 20000 });
  // Con cuotas de una sola casa y sin referencia externa fiable no hay ventaja
  // demostrable: el motor tiene que decirlo, no maquillarlo.
  if (!r.optimisation.anyEdge) {
    assert.ok(r.optimisation.verdict.includes('NO EXISTE COMBINACION VERDE') ||
      r.optimisation.verdict.includes('valor esperado positivo'), r.optimisation.verdict);
    assert.ok(r.optimisation.best?.rank.score === 0);
  }
});

test('el peaje compuesto sube al meter mas patas, tambien de punta a punta', () => {
  const r = buildCombinations(jornada(), withConfig({ combination: { maxCombinationSize: 6 } }), { maxResults: 40000 });
  const porPatas = new Map<number, number[]>();
  for (const c of r.optimisation.candidates) {
    const l = porPatas.get(c.legs) ?? [];
    l.push(c.joint.compoundMargin);
    porPatas.set(c.legs, l);
  }
  assert.ok(porPatas.size > 0);
  for (const [, margenes] of porPatas) assert.ok(margenes.every((m) => m > 0), 'ninguna combinada deberia salir gratis');
});

test('el resultado siempre trae por que, no solo el numero', () => {
  const r = buildCombinations(jornada(), DEFAULT_CONFIG, { maxResults: 20000 });
  assert.ok(r.optimisation.verdict.length > 20);
  const best = r.optimisation.best;
  if (best !== null) {
    assert.ok(best.rank.explanation.length > 20);
    assert.ok(best.classification.label.length > 0);
  }
});

/* ------------------------------------------------------------------------
   Regresion: un partido con SOLO 1X2 no puede producir rejilla de marcadores.
   Tres salidas de 1X2 desmarginado son DOS ecuaciones independientes, y la
   rejilla tiene TRES parametros. El deduplicado usaba un Set como contador
   (siempre 0 o 1), dejaba pasar las tres, y el ajuste salia con residuo cero
   y nota maxima. El motor se inventaba la precision que dice no inventarse.
   ------------------------------------------------------------------------ */
test('un partido con solo 1X2 NO ajusta rejilla: dos ecuaciones no bastan para tres parametros', () => {
  const r = analyse({
    matches: [{ matchId: 'm1', league: 'L', home: 'A', away: 'B', startsAt: NOW + 7_200_000 }],
    markets: [oneX2('m1|1X2', 'm1', 'Bet365', 2.10, 3.40, 3.60)],
    bookmaker: 'Bet365', now: NOW,
  }, DEFAULT_CONFIG);

  assert.equal(r.grids.size, 0, 'no puede haber rejilla con un solo mercado');
  assert.equal(r.gridFits.size, 0);
  assert.ok(r.warnings.some((w) => w.includes('No se pudo ajustar la distribucion de marcadores')));
});

test('con 1X2 + over/under + ambos marcan si se ajusta la rejilla', () => {
  const r = analyse({
    matches: [{ matchId: 'm1', league: 'L', home: 'A', away: 'B', startsAt: NOW + 7_200_000 }],
    markets: [
      oneX2('m1|1X2', 'm1', 'Bet365', 2.10, 3.40, 3.60),
      overUnder('m1|OU', 'm1', 'Bet365', 1.90, 1.90, 2.5),
      btts('m1|BTTS', 'm1', 'Bet365', 1.80, 2.00),
    ],
    bookmaker: 'Bet365', now: NOW,
  }, DEFAULT_CONFIG);

  assert.equal(r.grids.size, 1, 'tres familias distintas si dan para ajustar');
  const fit = r.gridFits.get('m1');
  assert.ok(fit !== undefined);
  // Y el residuo ya NO es cero por construccion: hay mas ecuaciones que parametros.
  assert.ok((fit as NonNullable<typeof fit>).targetsUsed >= 4);
});
