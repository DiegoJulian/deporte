import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, withConfig } from '../src/config/index.js';
import { classifyBinary, classifyThreeWay, classifyValue, classifyCombination } from '../src/classify/index.js';

const cfg = DEFAULT_CONFIG;

test('los umbrales del 1X2 son exactamente los pedidos', () => {
  assert.equal(classifyThreeWay(0.20, cfg), 'MUY_BAJA');
  assert.equal(classifyThreeWay(0.30, cfg), 'ROJO');
  assert.equal(classifyThreeWay(0.42, cfg), 'NEUTRAL');   // hueco 40-45 %
  assert.equal(classifyThreeWay(0.50, cfg), 'AMARILLO');
  assert.equal(classifyThreeWay(0.70, cfg), 'VERDE');
  assert.equal(classifyThreeWay(0.97, cfg), 'EXTREMA');
});

test('los umbrales binarios son los pedidos, con el NEUTRAL en otro sitio', () => {
  assert.equal(classifyBinary(0.20, cfg), 'MUY_BAJA');
  assert.equal(classifyBinary(0.30, cfg), 'ROJO');
  assert.equal(classifyBinary(0.45, cfg), 'AMARILLO');
  assert.equal(classifyBinary(0.60, cfg), 'NEUTRAL');
  assert.equal(classifyBinary(0.70, cfg), 'VERDE');
});

test('el mismo 57 % es AMARILLO en 1X2 y NEUTRAL en binario: las dos escalas no son la misma', () => {
  assert.equal(classifyThreeWay(0.57, cfg), 'AMARILLO');
  assert.equal(classifyBinary(0.57, cfg), 'NEUTRAL');
});

test('el semaforo es una funcion monotona de la cuota: VERDE equivale a cuota corta', () => {
  const cuotas = [1.30, 1.45, 1.80, 2.60, 4.50];
  const luces = cuotas.map((c) => classifyBinary(1 / c, cfg));
  assert.deepEqual(luces, ['VERDE', 'VERDE', 'NEUTRAL', 'ROJO', 'MUY_BAJA']);
  // La luz cae monotonamente al subir la cuota: el semaforo no anade
  // informacion que no estuviera ya en el precio.
});

test('el eje de valor se niega a medir contra el precio de la propia casa', () => {
  const v = classifyValue({ odds: 1.30, reference: 0.75, basis: 'self' }, cfg);
  assert.equal(v.light, 'SIN_REFERENCIA');
  assert.equal(v.expectedValue, null);
  assert.ok(v.reason.includes('contra uno mismo'));
});

test('el eje de valor exige que la cota inferior supere el umbral, no solo el punto', () => {
  // EV puntual +2,6 % pero con una referencia muy incierta: no es POSITIVO.
  const incierto = classifyValue({ odds: 1.40, reference: 0.733, basis: 'consensus', referenceUncertainty: 0.03 }, cfg);
  assert.equal(incierto.light, 'NEUTRO');
  const firme = classifyValue({ odds: 1.40, reference: 0.76, basis: 'consensus', referenceUncertainty: 0.002 }, cfg);
  assert.equal(firme.light, 'POSITIVO');
});

test('un EV disparatado se marca SOSPECHOSO, no POSITIVO', () => {
  const v = classifyValue({ odds: 2.5, reference: 0.55, basis: 'consensus', referenceUncertainty: 0.001 }, cfg);
  assert.equal(v.light, 'SOSPECHOSO');
  assert.ok(v.reason.includes('dato este mal'));
});

test('con los umbrales ABSOLUTOS, toda combinada a cuota 2,5120 sale DESCARTAR', () => {
  const abs = withConfig({ combination: { mode: 'ABSOLUTE' } });
  // 39,81 % es el TECHO teorico de una combinada que paga 2,5120 (antes de margen).
  const c = classifyCombination(1 / 2.5120, 95, abs);
  assert.equal(c.light, 'DESCARTAR');
  // Ni siquiera el techo absoluto llega al ROJO (55 %).
  assert.ok(1 / 2.5120 < abs.combination.discardMax);
});

test('en modo relativo los mismos umbrales si discriminan', () => {
  const best = 0.42;
  assert.equal(classifyCombination(0.40, 90, cfg, best).light, 'VERDE');      // 95 % del techo
  assert.equal(classifyCombination(0.30, 90, cfg, best).light, 'AMARILLO');   // 71 %
  assert.equal(classifyCombination(0.25, 90, cfg, best).light, 'ROJO');       // 60 %
  assert.equal(classifyCombination(0.20, 90, cfg, best).light, 'DESCARTAR');  // 48 %
});

test('VERDE con confianza baja no se muestra como VERDE SEGURO', () => {
  const c = classifyCombination(0.40, 57, cfg, 0.42);
  assert.equal(c.light, 'VERDE');
  assert.equal(c.validated, false);
  assert.ok(c.label.includes('NO VALIDADO'));
  const ok = classifyCombination(0.40, 90, cfg, 0.42);
  assert.equal(ok.validated, true);
  assert.ok(ok.label.includes('ALTA CONFIANZA'));
});
