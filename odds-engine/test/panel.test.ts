import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptPanelMarkets, analysePanel, type DocMercado } from '../src/adapters/panel.js';
import { NOW } from './helpers.js';

const EN_2H = new Date(NOW + 2 * 3600_000).toISOString();
const HACE_1H = new Date(NOW - 3600_000).toISOString();
const AHORA = new Date(NOW).toISOString();

const doc = (p: Partial<DocMercado> = {}): DocMercado => ({
  id: 'm1', deporte: 'Fútbol', liga: 'LaLiga', local: 'A', visitante: 'B',
  comienza: EN_2H, tipo: '1x2',
  casas: [['Bet365', 2.10, 3.40, 3.60]],
  actualizado: AHORA,
  ...p,
});

/* ------------------------------------------------------------- la traduccion */

test('un 1x2 del panel se traduce a un mercado THREE_WAY completo', () => {
  const r = adaptPanelMarkets([doc()], { now: NOW });
  assert.equal(r.markets.length, 1);
  const m = r.markets[0]!;
  assert.equal(m.kind, 'THREE_WAY');
  assert.equal(m.family, '1X2');
  assert.equal(m.normalisationTarget, 1);
  assert.deepEqual(m.outcomes.map((o) => o.id), ['HOME', 'DRAW', 'AWAY']);
  assert.deepEqual(m.outcomes.map((o) => o.quotes[0]!.odds as number), [2.10, 3.40, 3.60]);
});

test('en un 2v la cuota del medio vale 0 y NO puede colarse como salida', () => {
  const r = adaptPanelMarkets([doc({ tipo: '2v', deporte: 'Tenis', casas: [['Bet365', 2.05, 0, 1.83]] })], { now: NOW });
  const m = r.markets[0]!;
  assert.equal(m.kind, 'BINARY');
  assert.deepEqual(m.outcomes.map((o) => o.id), ['HOME', 'AWAY']);
  assert.ok(m.outcomes.every((o) => o.quotes.every((q) => (q.odds as number) > 1)));
});

test('la apertura se cuelga de casas[0], que es de donde la lee el panel', () => {
  const r = adaptPanelMarkets([doc({ apertura: [3.20, 3.70, 2.10] })], { now: NOW });
  const m = r.markets[0]!;
  assert.equal(m.outcomes[0]!.quotes[0]!.openingOdds as number, 3.20);
  assert.equal(m.outcomes[2]!.quotes[0]!.openingOdds as number, 2.10);
});

test('una casa que no cotiza las tres salidas no entra: el margen no seria observable', () => {
  const r = adaptPanelMarkets([doc({ casas: [['Bet365', 2.10, 3.40, 3.60], ['Otra', 2.05, 0, 3.55]] })], { now: NOW });
  const m = r.markets[0]!;
  assert.deepEqual([...new Set(m.outcomes.flatMap((o) => o.quotes.map((q) => q.bookmaker)))], ['Bet365']);
});

test('un partido en juego con cuotas copiadas ANTES del comienzo se descarta entero', () => {
  const r = adaptPanelMarkets([doc({
    comienza: HACE_1H,
    actualizado: new Date(NOW - 2 * 3600_000).toISOString(),   // copiadas antes del pitido
  })], { now: NOW });
  assert.equal(r.markets.length, 0);
  assert.match(r.dropped[0]!.motivo, /ese precio ya no existe/);
});

test('un partido ya terminado y uno fuera del horizonte se descartan, con motivo', () => {
  const r = adaptPanelMarkets([
    doc({ id: 'viejo', comienza: new Date(NOW - 5 * 3600_000).toISOString() }),
    doc({ id: 'lejano', comienza: new Date(NOW + 200 * 3600_000).toISOString() }),
  ], { now: NOW, horizonHours: 72 });
  assert.equal(r.markets.length, 0);
  assert.equal(r.dropped.length, 2);
  assert.match(r.dropped.find((d) => d.id === 'viejo')!.motivo, /terminado/);
  assert.match(r.dropped.find((d) => d.id === 'lejano')!.motivo, /72 h/);
});

test('un 1x2 que NO es de futbol no recibe familia 1X2: la rejilla es de goles', () => {
  const r = adaptPanelMarkets([doc({ deporte: 'Baloncesto' })], { now: NOW });
  assert.equal(r.markets[0]!.family, '1X2_NO_FUTBOL');
  assert.ok(r.warnings.some((w) => w.includes('rejilla de marcadores es de goles')));
});

/* ------------------------------------------------------------- el analisis */

/**
 * Tres partidos que SI dan combinaciones en la banda de 2,5120:
 *  · el simple de 2,55 cae dentro de [2,5120 ; 2,6627];
 *  · 1,60 x 1,58 = 2,528 tambien.
 * Margenes del 4-5 %, que es lo que cobra Bet365 de verdad en un 1X2.
 */
const TRES_PARTIDOS: DocMercado[] = [
  doc({ id: 'a', casas: [['Bet365', 1.60, 4.00, 6.00]] }),
  doc({ id: 'b', casas: [['Bet365', 1.58, 4.10, 6.20]] }),
  doc({ id: 'c', casas: [['Bet365', 2.55, 3.40, 2.85]] }),
];

test('con un solo 1X2 por partido NO se ajusta ninguna rejilla de marcadores', () => {
  const out = analysePanel({
    docs: [doc({ id: 'a' }), doc({ id: 'b', casas: [['Bet365', 1.80, 3.60, 4.50]] })],
    targetOdds: 2.5120, now: NOW,
  });
  assert.deepEqual(out.rejillas, [], 'dos ecuaciones no dan para tres parametros');
});

test('con una sola casa el eje de VALOR se apaga: SIN_REFERENCIA y EV null', () => {
  const out = analysePanel({ docs: [doc()], targetOdds: 2.5120, now: NOW });
  assert.ok(out.selecciones.length > 0);
  for (const s of out.selecciones) {
    assert.equal(s.semaforoValor, 'SIN_REFERENCIA');
    assert.equal(s.ev, null);
  }
});

test('toda candidata rechazada dice QUE filtro falla, no desaparece', () => {
  const out = analysePanel({
    docs: [
      ...TRES_PARTIDOS,
    ],
    targetOdds: 2.5120, now: NOW,
  });
  assert.ok(out.candidatas.length > 0, 'tiene que haber combinaciones que lleguen a la cuota');
  for (const c of out.candidatas) {
    if (c.rechazos.length === 0) continue;
    for (const r of c.rechazos) assert.ok(r.length > 10, 'el motivo tiene que explicarse');
  }
  // Y el recuento agregado tiene que cuadrar con los rechazos individuales.
  const total = out.candidatas.reduce((a, c) => a + c.rechazos.length, 0);
  assert.equal(out.rechazos.reduce((a, r) => a + r.cuantas, 0), total);
});

test('con una sola casa NINGUNA candidata pasa los filtros, y el veredicto lo dice', () => {
  const out = analysePanel({
    docs: [
      ...TRES_PARTIDOS,
    ],
    targetOdds: 2.5120, now: NOW,
  });
  assert.ok(out.candidatas.length > 0);
  assert.equal(out.apostables.length, 0);
  assert.equal(out.hayVentaja, false);
  assert.match(out.veredicto, /NO EXISTE COMBINACION VERDE CON SUFICIENTE CONFIANZA/);
});

test('toda combinada devuelta cae en la banda de la cuota objetivo', () => {
  const objetivo = 2.5120;
  const out = analysePanel({
    docs: [
      ...TRES_PARTIDOS,
    ],
    targetOdds: objetivo, targetTolerance: 0.06, now: NOW,
  });
  for (const c of out.candidatas) {
    assert.ok(c.cuota >= objetivo - 1e-9, `${c.cuota} por debajo del objetivo`);
    assert.ok(c.cuota <= objetivo * 1.06 + 1e-9, `${c.cuota} se pasa de la tolerancia`);
  }
});

test('el peaje compuesto nunca sale gratis, y la probabilidad baja al anadir patas', () => {
  const out = analysePanel({
    docs: [
      ...TRES_PARTIDOS,
    ],
    targetOdds: 2.5120, now: NOW,
  });
  assert.ok(out.candidatas.length > 0);
  for (const c of out.candidatas) {
    assert.ok(c.peajeCompuesto > 0, 'ninguna combinada deberia salir gratis');
    assert.ok(c.probabilidad <= Math.min(...c.patas.map((p) => p.probSinMargen)) + 1e-9,
      'anadir patas NO puede subir la probabilidad');
    assert.ok(c.cotaInferior <= c.probabilidad + 1e-9);
  }
});

test('sin cuotas utilizables no se propone nada y se explica', () => {
  const out = analysePanel({ docs: [], targetOdds: 2.5120, now: NOW });
  assert.equal(out.candidatas.length, 0);
  assert.match(out.veredicto, /NO HAY NINGUNA CUOTA UTILIZABLE/);
});

/* ============ doble oportunidad y empate no valido ============ */

// El 1X2 de `doc()` (2,10 / 3,40 / 3,60) desmarginado da 46,02 / 27,80 / 26,18 %.
// De ahi salen las cuotas coherentes de los otros dos mercados del resultado:
//   DC   implica  1X 73,82 %   12 72,20 %   X2 53,98 %
//   DNB  implica  1  63,73 %   2  36,27 %
// y con ~4 % de margen encima quedan estas. Calculadas, no puestas a ojo: un
// fixture incoherente haria que el test midiese el fixture y no el motor.
const DC_COHERENTE: [string, number, number, number][] = [['Bet365', 1.33, 1.36, 1.82]];
const DNB_COHERENTE: [string, number, number][] = [['Bet365', 1.51, 2.65]];

test('la doble oportunidad se carga con objetivo de normalizacion 2, no 1', () => {
  const r = adaptPanelMarkets([doc({ dobleOportunidad: DC_COHERENTE })], { now: NOW });
  const dc = r.markets.find((m) => m.family === 'DC');
  assert.ok(dc !== undefined, 'tiene que haber mercado DC');
  assert.equal(dc!.normalisationTarget, 2, '1X + 12 + X2 cubre cada resultado dos veces');
  assert.deepEqual(dc!.outcomes.map((o) => o.id), ['1X', '12', 'X2']);
});

test('el empate no valido se carga como binario con objetivo 1', () => {
  const r = adaptPanelMarkets([doc({ empateNoValido: DNB_COHERENTE })], { now: NOW });
  const dnb = r.markets.find((m) => m.family === 'DNB');
  assert.ok(dnb !== undefined);
  assert.equal(dnb!.kind, 'BINARY');
  assert.equal(dnb!.normalisationTarget, 1);
  assert.deepEqual(dnb!.outcomes.map((o) => o.id), ['HOME', 'AWAY']);
});

test('en un partido de dos vias se ignoran, con aviso: no hay empate que cubrir', () => {
  const r = adaptPanelMarkets([doc({
    tipo: '2v', deporte: 'Tenis', casas: [['Bet365', 2.05, 0, 1.83]],
    dobleOportunidad: DC_COHERENTE,
  })], { now: NOW });
  assert.equal(r.markets.filter((m) => m.family === 'DC').length, 0);
  assert.ok(r.warnings.some((w) => w.includes('necesitan un mercado con empate')));
});

/* EL PUNTO DELICADO. 1X2, DC y DNB son la MISMA distribucion del resultado
   escrita de tres formas: DC(1X) = P1+PX, DNB(1) = P1/(P1+P2). Entre las tres
   no pasan de DOS ecuaciones independientes sobre (lambda, mu, rho), que son
   las mismas dos que da el 1X2 solo. Si las contasemos por separado tendriamos
   cinco «restricciones» para tres parametros y volveriamos a ajustar una
   rejilla sin informacion: el fallo del deduplicado, en version mas sutil. */
test('cargar DC y DNB NO desbloquea la rejilla: es la misma informacion escrita tres veces', () => {
  const out = analysePanel({
    docs: [doc({ dobleOportunidad: DC_COHERENTE, empateNoValido: DNB_COHERENTE })],
    targetOdds: 2.5120, now: NOW,
  });
  assert.deepEqual(out.rejillas, [],
    'tres mercados del bloque del resultado siguen siendo dos ecuaciones');
});

test('lo que SI desbloquea la rejilla es una familia de verdad distinta', () => {
  const r = analysePanel({
    docs: [doc({ dobleOportunidad: DC_COHERENTE })],
    targetOdds: 2.5120, now: NOW,
  });
  assert.deepEqual(r.rejillas, []);
  // (over/under y ambos marcan se comprueban en pipeline.test.ts, que puede
  // construir mercados que el formato del panel todavia no sabe cargar)
});

test('un bloque del resultado coherente no genera ninguna incoherencia', () => {
  const out = analysePanel({
    docs: [doc({ dobleOportunidad: DC_COHERENTE, empateNoValido: DNB_COHERENTE })],
    targetOdds: 2.5120, now: NOW,
  });
  assert.equal(out.incoherencias.length, 0, JSON.stringify(out.incoherencias));
});

test('una doble oportunidad mal cotizada se detecta con UNA sola casa', () => {
  // El margen del bloque sigue siendo sano (1,84 % sobre el objetivo 2): lo que
  // esta mal es el REPARTO. El 1X se paga a 1,45, que desmarginado son 67,8 %,
  // cuando el propio 1X2 de la casa implica 73,82 %. Seis puntos de diferencia
  // entre dos precios de la MISMA casa.
  //
  // (Poner el 1X a 1,60 no vale como prueba: el bloque entero baja de 2 y eso
  //  es margen negativo, que el validador tumba antes de llegar aqui. Con
  //  razon: es un error palpable de precio y la casa lo anula.)
  const out = analysePanel({
    docs: [doc({ dobleOportunidad: [['Bet365', 1.45, 1.33, 1.68]] })],
    targetOdds: 2.5120, now: NOW,
  });
  assert.ok(out.incoherencias.length > 0, 'tenia que cazarlo');
  const peor = out.incoherencias[0]!;
  assert.equal(peor.mercado, 'DC');
  assert.equal(peor.salida, '1X');
  assert.ok(Math.abs(peor.puntos) > 0.02, `solo ${peor.puntos}`);
  // La DC cotiza el 1X al 65,6 % cuando el 1X2 implica 73,8 %: paga de mas.
  assert.ok(peor.puntos < 0, 'cotiza MENOS probabilidad de la que implica el 1X2');
  assert.equal(peor.lado, 'a favor');
  assert.ok(peor.ventajaSiManda1X2 > 0.05, `ventaja ${peor.ventajaSiManda1X2}`);
});
