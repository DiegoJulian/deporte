import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, withConfig } from '../src/config/index.js';
import { generateCombinations, removeDominated, type CandidateLeg } from '../src/combine/generator.js';
import { asFair, asOdds, asRaw, type Selection } from '../src/core/types.js';

function sel(id: string, matchId: string, marketId: string, odds: number, fair: number): Selection {
  return {
    selectionId: id, matchId, marketId, family: 'OU', outcomeId: id, label: id, period: 'FULL_TIME',
    odds: asOdds(odds), bookmaker: 'B', raw: asRaw(1 / odds), fair: asFair(fair),
    source: 'FAIR_SINGLE_BOOK', uncertainty: 0.002, overround: 0.04,
    consensus: null, dispersion: null, oddsQuality: 80, confidence: 80,
    riskLight: 'VERDE', valueLight: 'SIN_REFERENCIA', expectedValue: null, evBasis: null, warnings: [],
  };
}

function pool(n: number, seed = 7): CandidateLeg[] {
  let s = seed;
  const rnd = (): number => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  return Array.from({ length: n }, (_, i) => {
    const odds = 1.15 + rnd() * 0.85;
    const margin = 0.005 + rnd() * 0.04;
    return { selection: sel(`s${i}`, `p${i}`, `m${i}`, odds, (1 - margin) / odds) };
  });
}

/** Referencia por fuerza bruta: enumera TODO sin podar. */
function bruteForce(cands: readonly CandidateLeg[], target: number, tol: number, maxSize: number): number {
  let best = -Infinity;
  const n = cands.length;
  const rec = (i: number, odds: number, value: number, size: number): void => {
    if (size > 0 && odds >= target && odds <= target * (1 + tol) && value > best) best = value;
    if (size >= maxSize || i >= n) return;
    for (let k = i; k < n; k++) {
      const c = cands[k] as CandidateLeg;
      const o = c.selection.odds as number;
      rec(k + 1, odds * o, value + Math.log(c.selection.fair * o), size + 1);
    }
  };
  rec(0, 1, 0, 0);
  return best;
}

test('branch and bound encuentra el MISMO optimo que la fuerza bruta', () => {
  const cfg = withConfig({ combination: { maxCombinationSize: 4 }, optimizer: { targetOdds: 2.5120, targetTolerance: 0.06 } });
  for (const seed of [7, 11, 23, 101, 999]) {
    const cands = pool(16, seed);
    const r = generateCombinations(cands, cfg, { maxResults: 100000 });
    const mejorPodado = Math.max(...r.combinations.map((c) =>
      c.indices.reduce((a, i) => a + Math.log((cands[i] as CandidateLeg).selection.fair * ((cands[i] as CandidateLeg).selection.odds as number)), 0)));
    const mejorBruto = bruteForce(cands, 2.5120, 0.06, 4);
    assert.ok(Math.abs(mejorPodado - mejorBruto) < 1e-9,
      `semilla ${seed}: podado ${mejorPodado} vs bruto ${mejorBruto}`);
  }
});

test('la poda reduce de verdad el espacio explorado', () => {
  const cfg = withConfig({ combination: { maxCombinationSize: 5 } });
  const cands = pool(22, 3);
  const r = generateCombinations(cands, cfg, { maxResults: 100000 });
  const podados = r.stats.prunedByBound + r.stats.prunedByReachability + r.stats.prunedByOvershoot;
  assert.ok(podados > 0, 'no se podo nada');
  assert.ok(r.stats.nodesExplored < 500000);
});

test('todas las combinadas devueltas caen en la ventana de cuota objetivo', () => {
  const cfg = DEFAULT_CONFIG;
  const r = generateCombinations(pool(18, 5), cfg, {});
  for (const c of r.combinations) {
    assert.ok(c.odds >= cfg.optimizer.targetOdds - 1e-9);
    assert.ok(c.odds <= cfg.optimizer.targetOdds * (1 + cfg.optimizer.targetTolerance) + 1e-9);
  }
});

test('no se combinan dos salidas del mismo mercado', () => {
  const cands: CandidateLeg[] = [
    { selection: sel('OVER', 'p1', 'mOU', 1.60, 0.615) },
    { selection: sel('UNDER', 'p1', 'mOU', 2.30, 0.428) },
    { selection: sel('X', 'p2', 'm2', 1.60, 0.615) },
  ];
  const r = generateCombinations(cands, withConfig({ combination: { maxCombinationSize: 3 } }), { targetOdds: 2.5, targetTolerance: 0.5, maxResults: 1000 });
  for (const c of r.combinations) {
    const markets = c.indices.map((i) => (cands[i] as CandidateLeg).selection.marketId);
    assert.equal(new Set(markets).size, markets.length, 'se colo una combinada con dos salidas del mismo mercado');
  }
  assert.ok(r.stats.prunedByIncompatibility > 0);
});

test('el tope de patas por partido se respeta', () => {
  const cands: CandidateLeg[] = Array.from({ length: 6 }, (_, i) => ({ selection: sel(`s${i}`, 'MISMO', `m${i}`, 1.25, 0.79) }));
  const r = generateCombinations(cands, withConfig({ combination: { maxCombinationSize: 6 } }), {
    targetOdds: 1.5, targetTolerance: 2, maxLegsPerMatch: 2, maxResults: 10000,
  });
  for (const c of r.combinations) assert.ok(c.legs <= 2, `combinada de ${c.legs} patas del mismo partido`);
});

test('el presupuesto de nodos se respeta y se avisa', () => {
  const r = generateCombinations(pool(30, 13), withConfig({ combination: { maxCombinationSize: 6 } }), { maxNodes: 5, maxResults: 10000 });
  assert.equal(r.stats.budgetExhausted, true);
  assert.ok(r.stats.nodesExplored <= 6);
  assert.ok(r.warnings.some((w) => w.includes('no es exhaustiva')));
});

test('la poda recorta el espacio en dos ordenes de magnitud', () => {
  // Sin podar, el espacio es sum(C(30,k)) para k=1..6 = 768.211 combinaciones.
  const ESPACIO = 768211;
  const cfg6 = withConfig({ combination: { maxCombinationSize: 6 } });

  // Poda estricta (boundSlack 0): solo garantiza el optimo. Muy pocos nodos.
  const estricta = generateCombinations(pool(30, 13), cfg6, { maxResults: 10000, boundSlack: 0 });
  assert.ok(estricta.stats.nodesExplored < 200, `estricta: ${estricta.stats.nodesExplored}`);

  // Con holgura (por defecto): mas candidatas para rankear, aun asi < 1 % del espacio.
  const conHolgura = generateCombinations(pool(30, 13), cfg6, { maxResults: 10000 });
  assert.ok(conHolgura.stats.nodesExplored < ESPACIO / 100, `con holgura: ${conHolgura.stats.nodesExplored}`);
  assert.ok(conHolgura.combinations.length >= estricta.combinations.length);
  assert.equal(conHolgura.stats.budgetExhausted, false);
});

test('la eliminacion de dominadas conserva el frente de Pareto', () => {
  const list = [
    { indices: [0], odds: 2.6, fairProduct: 0.40, legs: 1, matches: 1 },
    { indices: [1], odds: 2.6, fairProduct: 0.38, legs: 2, matches: 2 }, // dominada
    { indices: [2], odds: 2.8, fairProduct: 0.36, legs: 2, matches: 2 }, // paga mas
  ];
  const kept = removeDominated(list);
  assert.equal(kept.length, 2);
  assert.ok(!kept.some((k) => k.fairProduct === 0.38));
});

test('sin candidatas que lleguen al objetivo, se dice claramente', () => {
  const cands: CandidateLeg[] = [{ selection: sel('a', 'p1', 'm1', 1.05, 0.95) }];
  const r = generateCombinations(cands, DEFAULT_CONFIG, {});
  assert.equal(r.combinations.length, 0);
  assert.ok(r.warnings.some((w) => w.includes('Ninguna combinada')));
});
