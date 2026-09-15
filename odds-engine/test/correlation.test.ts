import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid, evaluate, fitGridFromMarkets, jointOnGrid, expectedReturnOnGrid, type FitTarget } from '../src/correlation/scoreGrid.js';
import { P, parsePredicate } from '../src/correlation/predicates.js';
import { analyseCorrelation, analysePair, type CorrelationLeg } from '../src/correlation/engine.js';
import { devigPower } from '../src/devig/methods.js';

test('la rejilla suma 1 y reproduce Poisson cuando rho = 0', () => {
  const g = buildGrid(1.5, 1.1, 0);
  const total = g.matrix.reduce((a, row) => a + row.reduce((x, y) => x + y, 0), 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  // P(0-0) = e^-1.5 * e^-1.1
  assert.ok(Math.abs((g.matrix[0]?.[0] as number) - Math.exp(-2.6)) < 1e-6);
});

test('las tres salidas del 1X2 sobre la rejilla suman 1', () => {
  const g = buildGrid(1.7, 1.0, -0.05);
  const s = evaluate(g, P.homeWin()).win + evaluate(g, P.draw()).win + evaluate(g, P.awayWin()).win;
  assert.ok(Math.abs(s - 1) < 1e-9);
});

test('el ajuste recupera los parametros con los que se genero la rejilla', () => {
  const truth = buildGrid(1.62, 0.95, -0.08);
  const targets: FitTarget[] = [
    { key: '1X2:HOME', predicate: P.homeWin(), probability: evaluate(truth, P.homeWin()).win },
    { key: '1X2:DRAW', predicate: P.draw(), probability: evaluate(truth, P.draw()).win },
    { key: 'OU:OVER@2.5', predicate: P.over(2.5), probability: evaluate(truth, P.over(2.5)).win },
    { key: 'BTTS:YES', predicate: P.bttsYes(), probability: evaluate(truth, P.bttsYes()).win },
    { key: 'OU:OVER@3.5', predicate: P.over(3.5), probability: evaluate(truth, P.over(3.5)).win },
  ];
  const fit = fitGridFromMarkets(targets);
  assert.ok(fit !== null);
  assert.ok((fit as NonNullable<typeof fit>).maxAbsError < 2e-3, `error ${fit?.maxAbsError}`);
  assert.ok(Math.abs((fit as NonNullable<typeof fit>).grid.lambda - 1.62) < 0.05);
  assert.ok(Math.abs((fit as NonNullable<typeof fit>).grid.mu - 0.95) < 0.05);
});

test('con menos de tres mercados el ajuste devuelve null: no se extrapola', () => {
  assert.equal(fitGridFromMarkets([
    { key: 'a', predicate: P.homeWin(), probability: 0.5 },
    { key: 'b', predicate: P.draw(), probability: 0.25 },
  ]), null);
});

test('un ajuste con exactamente 3 objetivos avisa de que no valida nada', () => {
  const g = buildGrid(1.4, 1.1, 0);
  const fit = fitGridFromMarkets([
    { key: '1X2:HOME', predicate: P.homeWin(), probability: evaluate(g, P.homeWin()).win },
    { key: '1X2:DRAW', predicate: P.draw(), probability: evaluate(g, P.draw()).win },
    { key: 'OU:OVER@2.5', predicate: P.over(2.5), probability: evaluate(g, P.over(2.5)).win },
  ]);
  assert.ok(fit?.warnings.some((w) => w.includes('no valida nada')));
});

// --- El ejemplo del encargo, con numeros ---

function realMatchGrid(): ReturnType<typeof buildGrid> {
  const x = devigPower([1 / 1.8, 1 / 3.6, 1 / 4.5]).fair;
  const ou = devigPower([1 / 1.9, 1 / 1.9]).fair;
  const bt = devigPower([1 / 1.8, 1 / 2.0]).fair;
  const fit = fitGridFromMarkets([
    { key: '1X2:HOME', predicate: P.homeWin(), probability: x[0] as number },
    { key: '1X2:DRAW', predicate: P.draw(), probability: x[1] as number },
    { key: 'OU:OVER@2.5', predicate: P.over(2.5), probability: ou[0] as number },
    { key: 'BTTS:YES', predicate: P.bttsYes(), probability: bt[0] as number },
  ]);
  assert.ok(fit !== null);
  return (fit as NonNullable<typeof fit>).grid;
}

test('el triple del encargo (gana + marca 2+ + rival no gana) casi DOBLA el producto ingenuo', () => {
  const g = realMatchGrid();
  const a = P.homeWin();
  const b = P.teamOver('HOME', 1.5);
  const c = P.doubleChanceHomeDraw();
  const pa = evaluate(g, a).win, pb = evaluate(g, b).win, pc = evaluate(g, c).win;
  const naive = pa * pb * pc;
  const real = jointOnGrid(g, [a, b, c], 'STRICT');
  assert.ok(real / naive > 1.8, `ratio ${real / naive}`);
  assert.ok(real > naive, 'la correlacion positiva hace la conjunta MAYOR, no menor');
});

test('detecta correlacion negativa: gana el local + ambos marcan', () => {
  const g = realMatchGrid();
  const a = P.homeWin();
  const b = P.bttsYes();
  const real = jointOnGrid(g, [a, b], 'STRICT');
  const naive = evaluate(g, a).win * evaluate(g, b).win;
  assert.ok(real < naive, 'multiplicar cuotas aqui SOBREVALORA la probabilidad');
});

test('la redundancia se detecta: gana el local implica que el visitante no gana', () => {
  const g = realMatchGrid();
  const legs: CorrelationLeg[] = [
    { selectionId: 'A', matchId: 'p1', marketId: 'm1', fair: 0.5, odds: 2, predicate: P.homeWin() },
    { selectionId: 'B', matchId: 'p1', marketId: 'm2', fair: 0.75, odds: 1.3, predicate: P.doubleChanceHomeDraw() },
  ];
  const pair = analysePair(legs[0] as CorrelationLeg, legs[1] as CorrelationLeg, { grids: new Map([['p1', g]]) });
  assert.equal(pair.regime, 'SAME_MATCH_MODEL');
  assert.equal(pair.redundant, true);
  assert.ok(Math.abs(pair.joint - pair.pA) < 1e-9, 'la conjunta es exactamente la de la pata que implica');
});

test('la incompatibilidad se detecta: gana el local y gana el visitante', () => {
  const g = realMatchGrid();
  const r = analyseCorrelation([
    { selectionId: 'A', matchId: 'p1', marketId: 'm1', fair: 0.5, odds: 2, predicate: P.homeWin() },
    { selectionId: 'B', matchId: 'p1', marketId: 'm2', fair: 0.2, odds: 5, predicate: P.awayWin() },
  ], { grids: new Map([['p1', g]]) });
  assert.equal(r.hasIncompatibility, true);
  assert.equal(r.risk, 'EXTREME');
});

test('sin rejilla, el mismo partido cae a cotas de Frechet y lo dice', () => {
  const r = analyseCorrelation([
    { selectionId: 'A', matchId: 'p1', marketId: 'm1', fair: 0.7, odds: 1.4 },
    { selectionId: 'B', matchId: 'p1', marketId: 'm2', fair: 0.6, odds: 1.6 },
  ], { grids: new Map() });
  assert.equal(r.pairs[0]?.regime, 'SAME_MATCH_BOUNDS');
  assert.ok(Math.abs((r.pairs[0]?.frechetLow as number) - 0.3) < 1e-9);
  assert.ok(Math.abs((r.pairs[0]?.frechetHigh as number) - 0.6) < 1e-9);
  assert.ok(r.warnings.some((w) => w.includes('acotar')));
});

test('partidos distintos: independencia, correlacion cero', () => {
  const r = analyseCorrelation([
    { selectionId: 'A', matchId: 'p1', marketId: 'm1', fair: 0.7, odds: 1.4 },
    { selectionId: 'B', matchId: 'p2', marketId: 'm2', fair: 0.6, odds: 1.6 },
  ], { grids: new Map() });
  assert.equal(r.pairs[0]?.regime, 'CROSS_MATCH');
  assert.ok(Math.abs((r.pairs[0]?.joint as number) - 0.42) < 1e-12);
  assert.equal(r.risk, 'LOW');
});

test('la conjunta siempre queda dentro de las cotas de Frechet', () => {
  const g = realMatchGrid();
  const preds = [P.homeWin(), P.over(2.5), P.bttsYes()];
  const ps = preds.map((p) => evaluate(g, p).win);
  const joint = jointOnGrid(g, preds, 'STRICT');
  const low = Math.max(0, ps.reduce((a, b) => a + b, 0) - (ps.length - 1));
  assert.ok(joint >= low - 1e-12 && joint <= Math.min(...ps) + 1e-12);
});

test('el push del handicap asiatico no cuenta como fallo en modo PUSH_OK', () => {
  const g = buildGrid(1.5, 1.5, 0);
  const strict = jointOnGrid(g, [P.asianHandicap('HOME', 0)], 'STRICT');
  const pushOk = jointOnGrid(g, [P.asianHandicap('HOME', 0)], 'PUSH_OK');
  assert.ok(pushOk > strict, 'el empate devuelve la apuesta, no la pierde');
  assert.ok(Math.abs(pushOk - strict - evaluate(g, P.draw()).win) < 1e-9);
});

test('el retorno esperado exacto descuenta la cuota de la pata anulada', () => {
  const g = buildGrid(1.4, 1.2, 0);
  const ev = expectedReturnOnGrid(g, [{ predicate: P.asianHandicap('HOME', 0), odds: 2.0 }]);
  const pWin = evaluate(g, P.asianHandicap('HOME', 0)).win;
  const pPush = evaluate(g, P.asianHandicap('HOME', 0)).push;
  assert.ok(Math.abs(ev - (pWin * 2 + pPush * 1)) < 1e-9);
});

test('el analizador de claves canonicas cubre las familias del feed', () => {
  for (const k of ['1X2:HOME', 'OU:OVER@2.5', 'BTTS:YES', 'DC:1X', 'DNB:HOME', 'AH:HOME@-0.5', 'EH:AWAY@1', 'TT:HOME:OVER@1.5', 'ODDEVEN:ODD', 'CS:2-1']) {
    assert.ok(parsePredicate(k) !== null, `no se reconoce ${k}`);
  }
  assert.equal(parsePredicate('CORNERS:OVER@9.5'), null);
});

test('par/impar sobre la rejilla reproduce la identidad de Poisson', () => {
  // P(total impar) = (1 - e^(-2*lambda_total)) / 2 con Poisson independiente
  const lt = 2.64;
  const g = buildGrid(lt / 2, lt / 2, 0);
  const odd = evaluate(g, P.totalOdd()).win;
  const teorico = (1 - Math.exp(-2 * lt)) / 2;
  assert.ok(Math.abs(odd - teorico) < 1e-6, `${odd} vs ${teorico}`);
  assert.ok(odd < 0.5, 'el impar SIEMPRE esta por debajo del 50 %');
});
