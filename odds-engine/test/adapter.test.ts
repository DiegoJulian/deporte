import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptFlashscoreOdds, BOOKMAKERS, BET365_ID, type FeedBlock } from '../src/adapters/flashscore.js';
import { DEFAULT_CONFIG } from '../src/config/index.js';
import { computeMarketProbabilities } from '../src/market/fairProbability.js';
import { validateMarket } from '../src/market/validator.js';
import { devig } from '../src/devig/methods.js';
import { sum } from '../src/core/numeric.js';
import { NOW } from './helpers.js';

const P = { home: 'HOME_ID', away: 'AWAY_ID' };
const opts = { matchId: 'e1', participants: P, observedAt: NOW };

const block = (bookmakerId: number, bettingType: string, bettingScope: string, odds: FeedBlock['odds']): FeedBlock =>
  ({ bookmakerId, bettingType, bettingScope, odds });

const feed1x2 = (id: number, h: number, d: number, a: number, scope = 'FULL_TIME'): FeedBlock =>
  block(id, 'HOME_DRAW_AWAY', scope, [
    { value: h, eventParticipantId: P.home },
    { value: d, eventParticipantId: null },
    { value: a, eventParticipantId: P.away },
  ]);

test('traduce el 1X2 de Bet365 y le pone el periodo', () => {
  const r = adaptFlashscoreOdds([feed1x2(BET365_ID, 1.8, 3.6, 4.5)], opts);
  assert.equal(r.markets.length, 1);
  const m = r.markets[0]!;
  assert.equal(m.family, '1X2');
  assert.equal(m.kind, 'THREE_WAY');
  assert.equal(m.period, 'FULL_TIME');
  assert.equal(m.normalisationTarget, 1);
  assert.deepEqual(m.outcomes.map((o) => o.id), ['HOME', 'DRAW', 'AWAY']);
});

test('LA TRAMPA DEL HANDICAP: el visitante viene con el signo cambiado', () => {
  // El feed trae el handicap desde el punto de vista de CADA lado.
  // Local -0.5 y visitante +0.5 son el MISMO mercado.
  const r = adaptFlashscoreOdds([
    block(BET365_ID, 'ASIAN_HANDICAP', 'FULL_TIME', [
      { value: 1.90, handicap: { value: -0.5 }, eventParticipantId: P.home },
      { value: 1.95, handicap: { value: 0.5 }, eventParticipantId: P.away },
    ]),
  ], opts);
  assert.equal(r.markets.length, 1, 'se han separado en dos mercados: la trampa no esta resuelta');
  const m = r.markets[0]!;
  assert.equal(m.line, -0.5, 'la linea tiene que quedar en perspectiva del local');
  assert.deepEqual(m.outcomes.map((o) => o.id).sort(), ['AWAY', 'HOME']);
  const v = validateMarket(m, DEFAULT_CONFIG, 'Bet365');
  assert.ok((v.overround as number) > 0 && (v.overround as number) < 0.10,
    `margen ${v.overround}: si sale disparatado es que se han mezclado mercados`);
});

test('LA DOBLE OPORTUNIDAD SUMA 2, no 1', () => {
  const r = adaptFlashscoreOdds([
    block(BET365_ID, 'DOUBLE_CHANCE', 'FULL_TIME', [
      { value: 1.22, eventParticipantId: P.home },   // 1X
      { value: 1.30, eventParticipantId: null },     // 12
      { value: 1.55, eventParticipantId: P.away },   // X2
    ]),
  ], opts);
  const m = r.markets[0]!;
  assert.equal(m.normalisationTarget, 2);
  const p = computeMarketProbabilities(m, 'Bet365', DEFAULT_CONFIG);
  const s = p.outcomes.reduce((a, o) => a + o.fair, 0);
  assert.ok(Math.abs(s - 2) < 1e-9, `suma ${s}, tendria que ser 2`);
  // Y cada una por separado sigue siendo una probabilidad legitima
  assert.ok(p.outcomes.every((o) => o.fair > 0 && o.fair < 1));
});

test('normalizar la doble oportunidad a 1 daria probabilidades a la mitad', () => {
  const raw = [1 / 1.22, 1 / 1.30, 1 / 1.55];
  const mal = devig(raw, 'POWER', 1);
  const bien = devig(raw, 'POWER', 2);
  assert.ok(Math.abs(sum(mal.fair) - 1) < 1e-9);
  assert.ok(Math.abs(sum(bien.fair) - 2) < 1e-9);
  // El metodo de potencia no es lineal, asi que el error no es un factor fijo:
  // va de x1,65 en la mas probable a x3 en la menos. En todas es enorme.
  const ratios = bien.fair.map((p, i) => p / (mal.fair[i] as number));
  assert.ok(Math.min(...ratios) > 1.6, `el menor error seria de x${Math.min(...ratios).toFixed(2)}`);
  assert.ok(Math.max(...ratios) > 2.5);
});

test('Shin se declara no aplicable cuando el mercado no suma 1, en vez de inventarse una version', () => {
  const r = devig([1 / 1.22, 1 / 1.30, 1 / 1.55], 'SHIN', 2);
  assert.equal(r.converged, false);
  assert.ok(r.warnings.some((w) => w.includes('no esta definido')));
  assert.ok(Math.abs(sum(r.fair) - 2) < 1e-9, 'aun sin converger, el reparto de respaldo respeta el objetivo');
});

test('el margen se mide contra el objetivo del mercado, no contra 100 %', () => {
  const r = adaptFlashscoreOdds([
    block(BET365_ID, 'DOUBLE_CHANCE', 'FULL_TIME', [
      { value: 1.22, eventParticipantId: P.home },
      { value: 1.30, eventParticipantId: null },
      { value: 1.55, eventParticipantId: P.away },
    ]),
  ], opts);
  const v = validateMarket(r.markets[0]!, DEFAULT_CONFIG, 'Bet365');
  assert.ok((v.overround as number) > 0 && (v.overround as number) < 0.15,
    `margen ${v.overround}: medido contra 1 saldria ~107 %`);
});

test('descanso/final y resultado exacto quedan fuera por defecto', () => {
  const r = adaptFlashscoreOdds([
    block(BET365_ID, 'HALF_FULL_TIME', 'FULL_TIME', [{ value: 2.5 }, { value: 3.5 }]),
    block(BET365_ID, 'CORRECT_SCORE', 'FULL_TIME', [{ value: 8.5, score: '2:1' }, { value: 9.0, score: '1:0' }]),
    feed1x2(BET365_ID, 1.8, 3.6, 4.5),
  ], opts);
  assert.equal(r.markets.length, 1);
  assert.equal(r.markets[0]?.family, '1X2');
});

test('las 11 casas entran; una casa desconocida se ignora', () => {
  const r = adaptFlashscoreOdds([
    feed1x2(BET365_ID, 1.80, 3.60, 4.50),
    feed1x2(406, 1.82, 3.55, 4.45),
    feed1x2(883, 1.78, 3.62, 4.52),
    feed1x2(99999, 1.10, 9.00, 9.00),          // no es del proyecto
  ], opts);
  const books = new Set(r.markets[0]?.outcomes.flatMap((o) => o.quotes.map((q) => q.bookmaker)));
  assert.deepEqual([...books].sort(), ['Bet365', 'Sportium.es', 'Winamax.es']);
  assert.equal(Object.keys(BOOKMAKERS).length, 11);
});

test('una casa con margen imposible se cae, y si es la principal se cae el grupo', () => {
  const conCasaMala = adaptFlashscoreOdds([
    feed1x2(BET365_ID, 1.80, 3.60, 4.50),
    feed1x2(406, 1.20, 1.30, 1.40),            // margen 226 %: imposible
  ], opts);
  const books = new Set(conCasaMala.markets[0]?.outcomes.flatMap((o) => o.quotes.map((q) => q.bookmaker)));
  assert.deepEqual([...books], ['Bet365']);

  const principalMala = adaptFlashscoreOdds([feed1x2(BET365_ID, 1.20, 1.30, 1.40)], opts);
  assert.equal(principalMala.markets.length, 0);
  assert.ok(principalMala.dropped[0]?.reason.includes('casa principal'));
});

test('un grupo al que le falta una salida no se carga', () => {
  const r = adaptFlashscoreOdds([
    block(BET365_ID, 'HOME_DRAW_AWAY', 'FULL_TIME', [
      { value: 1.8, eventParticipantId: P.home },
      { value: 4.5, eventParticipantId: P.away },
    ]),
  ], opts);
  assert.equal(r.markets.length, 0);
  assert.ok(r.dropped[0]?.reason.includes('2 salidas'));
});

test('los tres periodos se separan en mercados distintos', () => {
  const r = adaptFlashscoreOdds([
    feed1x2(BET365_ID, 1.80, 3.60, 4.50, 'FULL_TIME'),
    feed1x2(BET365_ID, 2.40, 2.10, 5.50, 'FIRST_HALF'),
    feed1x2(BET365_ID, 2.20, 2.60, 4.80, 'SECOND_HALF'),
  ], opts);
  assert.equal(r.markets.length, 3);
  assert.deepEqual(r.markets.map((m) => m.period).sort(), ['FIRST_HALF', 'FULL_TIME', 'SECOND_HALF']);
});

test('las lineas de over/under se separan, cada una es su propio mercado', () => {
  const r = adaptFlashscoreOdds([
    block(BET365_ID, 'OVER_UNDER', 'FULL_TIME', [
      { value: 1.72, handicap: { value: 2.5 }, selection: 'OVER' },
      { value: 2.10, handicap: { value: 2.5 }, selection: 'UNDER' },
      { value: 2.50, handicap: { value: 3.5 }, selection: 'OVER' },
      { value: 1.53, handicap: { value: 3.5 }, selection: 'UNDER' },
    ]),
  ], opts);
  assert.equal(r.markets.length, 2);
  assert.deepEqual(r.markets.map((m) => m.line).sort(), [2.5, 3.5]);
});

test('la cuota de apertura se conserva cuando el feed la trae', () => {
  const r = adaptFlashscoreOdds([
    block(BET365_ID, 'BOTH_TEAMS_TO_SCORE', 'FULL_TIME', [
      { value: 1.80, opening: 1.95, bothTeamsToScore: true },
      { value: 2.00, opening: 1.85, bothTeamsToScore: false },
    ]),
  ], opts);
  const q = r.markets[0]?.outcomes[0]?.quotes[0];
  assert.equal(q?.openingOdds, 1.95);
});

test('una cuota marcada inactiva no entra', () => {
  const r = adaptFlashscoreOdds([
    block(BET365_ID, 'ODD_OR_EVEN', 'FULL_TIME', [
      { value: 2.05, selection: 'ODD', active: true },
      { value: 1.83, selection: 'EVEN', active: false },
    ]),
  ], opts);
  assert.equal(r.markets.length, 0, 'con una salida caida el grupo no se puede desmarginar');
});
