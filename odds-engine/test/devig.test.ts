import test from 'node:test';
import assert from 'node:assert/strict';
import {
  devig, devigAll, devigAdditive, devigPower, devigProportional, devigShin, devigOddsRatio, devigModelSpread,
} from '../src/devig/methods.js';
import { estimateFromSingleOdds, findBand, MARGIN_BANDS, bandStandardError } from '../src/devig/singleOdds.js';
import { sum } from '../src/core/numeric.js';

const RAW_1X2 = [1 / 1.8, 1 / 3.6, 1 / 4.5];

test('el overround del ejemplo del encargo es 5,5556 %', () => {
  const S = sum(RAW_1X2);
  assert.ok(Math.abs(S - 1.0555555) < 1e-6, `suma ${S}`);
  assert.ok(Math.abs(devigProportional(RAW_1X2).overround - 0.0555555) < 1e-6);
});

test('todos los metodos devuelven probabilidades que suman exactamente 1', () => {
  for (const [name, r] of Object.entries(devigAll(RAW_1X2))) {
    assert.ok(r.converged, `${name} no convergio`);
    assert.ok(Math.abs(sum(r.fair) - 1) < 1e-9, `${name} suma ${sum(r.fair)}`);
    assert.ok(r.fair.every((p) => p > 0 && p < 1), `${name} fuera de (0,1)`);
  }
});

test('el reparto proporcional da al favorito MAS probabilidad que potencia y Shin', () => {
  // Es el sesgo favorito-longshot: la casa carga mas margen en las cuotas altas,
  // asi que repartir en proporcion deja al favorito inflado.
  const prop = devigProportional(RAW_1X2).fair[0] as number;
  const pot = devigPower(RAW_1X2).fair[0] as number;
  const shin = devigShin(RAW_1X2).fair[0] as number;
  assert.ok(prop < pot, 'potencia deberia dar mas al favorito que proporcional');
  assert.ok(prop < shin, 'Shin deberia dar mas al favorito que proporcional');
  assert.ok(Math.abs(pot - 0.537438) < 1e-5, `potencia ${pot}`);
  assert.ok(Math.abs(shin - 0.534275) < 1e-5, `shin ${shin}`);
});

test('el metodo de potencia quita proporcionalmente mas margen a la cuota alta', () => {
  const raw = RAW_1X2;
  const pot = devigPower(raw).fair;
  const ratios = raw.map((r, i) => (pot[i] as number) / r);
  assert.ok((ratios[0] as number) > (ratios[2] as number),
    'el favorito debe conservar mayor fraccion de su probabilidad bruta que el tapado');
});

test('el exponente k de potencia es mayor que 1 cuando hay margen', () => {
  const r = devigPower(RAW_1X2);
  assert.ok((r.parameter as number) > 1);
  assert.ok(Math.abs((r.parameter as number) - 1.05641) < 1e-4);
});

test('la z de Shin cae en (0, 0.5) y crece con el margen', () => {
  const low = devigShin([1 / 1.98, 1 / 1.98]).parameter as number;   // margen 1,01 %
  const high = devigShin([1 / 1.6, 1 / 1.9]).parameter as number;    // margen 15,2 %
  assert.ok(low > 0 && low < 0.5);
  assert.ok(high > low, 'mas margen deberia dar mas z');
});

test('en un mercado sin margen los cinco metodos coinciden', () => {
  const fair = [0.5, 0.3, 0.2];  // ya suma 1: no hay margen que repartir
  for (const r of Object.values(devigAll(fair))) {
    r.fair.forEach((p, i) => assert.ok(Math.abs(p - (fair[i] as number)) < 1e-7));
  }
  assert.ok(devigModelSpread(fair, 0) < 1e-6);
});

test('el metodo aditivo se declara NO convergido si produce negativos', () => {
  // Mercado con 11 % de margen y un tapado a cuota 100: el reparto en puntos
  // le quita mas de lo que tiene.
  const r = devigAdditive([0.60, 0.50, 0.01]);
  assert.equal(r.converged, false, 'con un favorito extremo el aditivo se rompe y debe decirlo');
});

test('odds-ratio tambien suma 1 y respeta el orden', () => {
  const r = devigOddsRatio(RAW_1X2);
  assert.ok(Math.abs(sum(r.fair) - 1) < 1e-9);
  assert.ok((r.fair[0] as number) > (r.fair[1] as number));
  assert.ok((r.fair[1] as number) > (r.fair[2] as number));
});

test('devig rechaza mercados de una sola salida', () => {
  assert.throws(() => devig([0.8], 'POWER'), RangeError);
});

test('la discrepancia entre metodos crece con el margen', () => {
  const pequeno = devigModelSpread([1 / 2.02, 1 / 2.02], 0);
  const grande = devigModelSpread([1 / 1.5, 1 / 6, 1 / 9], 0);
  assert.ok(grande > pequeno);
});

// --- Una sola cuota ---

test('una sola cuota NUNCA se etiqueta como fair', () => {
  const e = estimateFromSingleOdds(1.35);
  assert.notEqual(e.source, 'FAIR_SINGLE_BOOK');
  assert.equal(e.source, 'RAW_ODDS_BAND_ADJUSTED');
  assert.ok(e.warnings.some((w) => w.includes('UNA sola cuota')));
});

test('la correccion por banda BAJA la probabilidad respecto a 1/cuota', () => {
  const e = estimateFromSingleOdds(1.35);
  assert.ok(e.estimated < e.raw, 'quitar margen tiene que bajar la probabilidad');
  assert.ok(Math.abs(e.raw - 1 / 1.35) < 1e-12);
});

test('la banda 2,45-2,80 es la mas cara de la tabla medida', () => {
  const band = findBand(2.512);
  assert.ok(band !== null);
  assert.equal(band?.minOdds, 2.45);
  const worstShort = Math.min(...MARGIN_BANDS.filter((b) => b.maxOdds <= 3.30).map((b) => b.edgeAll));
  assert.equal(band?.edgeAll, worstShort);
});

test('el error tipico de la banda baja al crecer la muestra', () => {
  const small = MARGIN_BANDS[0] as (typeof MARGIN_BANDS)[number];
  const big = MARGIN_BANDS[11] as (typeof MARGIN_BANDS)[number];
  assert.ok(bandStandardError(big, 'all') < bandStandardError(small, 'all'));
});

test('extrapolar la tabla a un mercado que no es 1X2 duplica la incertidumbre y avisa', () => {
  const a = estimateFromSingleOdds(1.5);
  const b = estimateFromSingleOdds(1.5, { extrapolatedFamily: true });
  assert.ok(Math.abs(b.uncertainty - 2 * a.uncertainty) < 1e-12);
  assert.ok(b.warnings.some((w) => w.includes('extrapolado')));
});

test('fuera de la tabla se supone el peor peaje y se marca RAW_ODDS', () => {
  const e = estimateFromSingleOdds(25);
  assert.equal(e.source, 'RAW_ODDS');
  assert.equal(e.band, null);
  assert.ok(e.warnings.some((w) => w.includes('sin respaldo empirico')));
});
