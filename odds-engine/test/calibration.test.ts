import test from 'node:test';
import assert from 'node:assert/strict';
import {
  brierScore, logLoss, wilsonInterval, reliabilityDiagram, spiegelhalterZ,
  checkClaim, requiredSampleSize, validateConfidence, type Prediction,
} from '../src/calibration/index.js';
import { analyseClv, analyseMovement } from '../src/calibration/clv.js';

/** Mulberry32: generador reproducible y con buena uniformidad. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulate(n: number, claimed: number, real: number, seed = 1): Prediction[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => ({
    id: `${i}`, probability: claimed, outcome: (r() < real ? 1 : 0) as 0 | 1,
  }));
}

test('Brier y log loss dan los valores conocidos en casos triviales', () => {
  assert.equal(brierScore([{ id: 'a', probability: 1, outcome: 1 }]), 0);
  assert.equal(brierScore([{ id: 'a', probability: 0, outcome: 1 }]), 1);
  assert.ok(Math.abs(brierScore([{ id: 'a', probability: 0.5, outcome: 1 }]) - 0.25) < 1e-12);
  assert.ok(Math.abs(logLoss([{ id: 'a', probability: 0.5, outcome: 1 }]) - Math.log(2)) < 1e-12);
});

test('el intervalo de Wilson es asimetrico y no se sale de [0,1]', () => {
  const ci = wilsonInterval(10, 10);
  assert.ok(ci.high <= 1 && ci.low > 0.6 && ci.low < 1);
  const ci0 = wilsonInterval(0, 10);
  assert.ok(ci0.low === 0 && ci0.high < 0.35);
});

test('el test de Spiegelhalter rechaza al 5 % cuando el motor esta calibrado', () => {
  // Se comprueba el ESTADISTICO, no una muestra con suerte: 200 replicas.
  const replica = (seed: number): Prediction[] => {
    const rp = rng(seed);          // dos flujos independientes: uno para la
    const ru = rng(seed + 100000); // probabilidad y otro para el resultado
    return Array.from({ length: 3000 }, (_, i) => {
      const p = 0.2 + 0.6 * rp();
      return { id: `${i}`, probability: p, outcome: (ru() < p ? 1 : 0) as 0 | 1 };
    });
  };
  let rechazos = 0;
  for (let s = 1; s <= 200; s++) if (!spiegelhalterZ(replica(s)).calibrated) rechazos++;
  assert.ok(rechazos >= 2 && rechazos <= 24, `${rechazos}/200 rechazos, se esperaba ~10`);
});

test('el test de Spiegelhalter detecta un motor sistematicamente optimista', () => {
  const rp = rng(9); const ru = rng(9 + 100000);
  const base: Prediction[] = Array.from({ length: 3000 }, (_, i) => {
    const p = 0.2 + 0.6 * rp();
    return { id: `${i}`, probability: p, outcome: (ru() < p ? 1 : 0) as 0 | 1 };
  });
  const sesgado = base.map((b) => ({ ...b, probability: Math.min(0.99, b.probability + 0.12) }));
  const z = spiegelhalterZ(sesgado);
  assert.equal(z.calibrated, false);
  assert.ok(z.pValue < 0.001);
});

test('el diagrama de fiabilidad detecta la banda mal calibrada', () => {
  const ps = [...simulate(600, 0.85, 0.72, 5), ...simulate(600, 0.30, 0.30, 9)];
  const r = reliabilityDiagram(ps);
  const alta = r.bins.find((b) => b.lower >= 0.8);
  assert.equal(alta?.miscalibrated, true, 'la banda del 85 % que ocurre el 72 % tiene que saltar');
  assert.ok(r.ece > 0.05);
});

test('la descomposicion de Murphy cuadra: brier = fiabilidad - resolucion + incertidumbre', () => {
  const ps = [...simulate(800, 0.85, 0.80, 3), ...simulate(800, 0.40, 0.42, 4), ...simulate(800, 0.60, 0.61, 8)];
  const r = reliabilityDiagram(ps);
  assert.ok(Math.abs(r.brier - (r.reliability - r.resolution + r.uncertainty)) < 1e-9);
});

test('LA PREGUNTA DEL ENCARGO: el VERDE >85 % ocurre el 85 % de las veces?', () => {
  const cumple = checkClaim(simulate(600, 0.85, 0.85, 11), 0.85, 'VERDE');
  assert.equal(cumple.verdict, 'CUMPLE');

  const noCumple = checkClaim(simulate(600, 0.85, 0.72, 13), 0.85, 'VERDE');
  assert.equal(noCumple.verdict, 'NO_CUMPLE');
  assert.ok(noCumple.shortfallPoints < -0.05);
  assert.ok(noCumple.message.includes('no esta calibrado'));
});

test('con muestra corta el veredicto es SIN_MUESTRA_SUFICIENTE, no una conclusion', () => {
  const r = checkClaim(simulate(40, 0.85, 0.60, 17), 0.85, 'VERDE');
  assert.equal(r.verdict, 'SIN_MUESTRA_SUFICIENTE');
  assert.ok(r.message.includes('no se puede decir nada'));
});

test('hacen falta ~430 combinadas para distinguir un 85 % real de un 80 %', () => {
  assert.equal(requiredSampleSize(0.85, 0.80), 430);
  assert.equal(requiredSampleSize(0.85, 0.75), 114);
  assert.ok(requiredSampleSize(0.85, 0.84) > 8000, 'afinar un punto exige muestras enormes');
});

test('el confidenceScore se valida midiendo si el error baja con la confianza', () => {
  // Caso bueno: mas confianza => mejor calibracion.
  const buenos: Prediction[] = [];
  const r = rng(77);
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const conf = (i / N) * 100;
    const sesgo = 0.30 * (1 - conf / 100);   // el motor se equivoca menos cuanto mas confia
    const p = 0.7;
    buenos.push({ id: `${i}`, probability: p, outcome: (r() < p - sesgo ? 1 : 0) as 0 | 1, confidence: conf });
  }
  assert.equal(validateConfidence(buenos).discriminates, true);

  // Caso malo: la confianza no tiene nada que ver con el error.
  const malos = buenos.map((b, i) => ({ ...b, confidence: (i * 37) % 101 }));
  const v = validateConfidence(malos);
  assert.equal(v.discriminates, false);
  assert.ok(v.message.includes('decorativo'));
});

// --- CLV y movimiento ---

test('el CLV limpio y el bruto no son lo mismo', () => {
  const r = analyseClv(Array.from({ length: 200 }, (_, i) => ({
    id: `${i}`, takenOdds: 2.10, closingOdds: 2.00, closingFairProbability: 0.50,
  })));
  assert.ok(Math.abs(r.meanRawClv - 0.05) < 1e-9);
  assert.ok(Math.abs((r.meanCleanClv as number) - 0.05) < 1e-9);
});

test('CLV negativo se dice sin adornos', () => {
  const g = rng(5);
  const r = analyseClv(Array.from({ length: 200 }, (_, i) => ({
    id: `${i}`, takenOdds: 1.90 + (g() - 0.5) * 0.06, closingOdds: 2.00,
  })));
  assert.equal(r.beatsClosing, false);
  assert.ok(r.message.includes('Ninguna estrategia con CLV negativo es rentable'));
});

test('con pocas apuestas el CLV no concluye', () => {
  const g = rng(6);
  const r = analyseClv(Array.from({ length: 10 }, (_, i) => ({ id: `${i}`, takenOdds: 2.2 + g() * 0.1, closingOdds: 2.0 })));
  assert.ok(r.message.includes('no significa nada todavia'));
});

test('el movimiento de la linea es senal, no veredicto', () => {
  const m = analyseMovement(1.65, 1.40);
  assert.equal(m.direction, 'ACORTA');
  assert.ok(m.deltaPoints > 0);
  assert.ok(m.note.includes('NO una confirmacion'));
  assert.equal(analyseMovement(1.80, 1.801).direction, 'QUIETA');
});
