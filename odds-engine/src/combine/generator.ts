/**
 * Combination Generator (secciones 10 y 15).
 *
 * El problema, planteado bien, es una MOCHILA: se quiere llegar a una cuota
 * objetivo T pagando el minimo peaje. Tomando logaritmos,
 *
 *     peso_i  = ln(cuota_i)                  lo que la pata aporta a la cuota
 *     valor_i = ln(fair_i * cuota_i) <= 0    el peaje que cobra esa pata
 *
 * y entonces:  ln(cuota combinada) = suma de pesos
 *              ln(1 + EV combinada) = suma de valores
 *
 * O sea: maximizar el EV de la combinada con la cuota objetivo fijada es
 * exactamente maximizar el valor de una mochila con el peso fijado. Eso da
 * gratis dos cosas: una heuristica de orden (ratio valor/peso, el peaje por
 * unidad de cuota aportada) y una COTA SUPERIOR admisible para branch and
 * bound (la relajacion lineal de la mochila), que es lo que permite podar sin
 * perder el optimo.
 */
import type { Selection } from '../core/types.js';
import type { EngineConfig } from '../config/index.js';
import type { ScoreGrid } from '../correlation/scoreGrid.js';
import { jointOnGrid } from '../correlation/scoreGrid.js';
import type { ScorePredicate } from '../correlation/predicates.js';

export interface CandidateLeg {
  readonly selection: Selection;
  readonly predicate?: ScorePredicate;
}

export interface GeneratorOptions {
  readonly targetOdds?: number;
  readonly targetTolerance?: number;
  readonly maxSize?: number;
  readonly minSize?: number;
  readonly maxLegsPerMatch?: number;
  readonly maxNodes?: number;
  /** Tope de combinadas devueltas antes de rankear. */
  readonly maxResults?: number;
  readonly grids?: ReadonlyMap<string, ScoreGrid>;
  /** Si false, no se generan combinadas con patas del mismo partido. */
  readonly allowSameMatch?: boolean;
  /**
   * Holgura de la poda por cota, en unidades de log-valor (~EV).
   * 0 = poda estricta: se garantiza el optimo y poco mas. El optimizador
   * necesita un abanico de candidatas para rankear y para calcular el techo
   * alcanzable, asi que por defecto se dejan pasar las que estan dentro de un
   * 10 % de EV del mejor.
   */
  readonly boundSlack?: number;
}

export interface GeneratedCombination {
  readonly indices: readonly number[];
  readonly odds: number;
  /** Producto de fair. Punto de partida antes de ajustar correlacion. */
  readonly fairProduct: number;
  readonly legs: number;
  readonly matches: number;
}

export interface GeneratorStats {
  readonly nodesExplored: number;
  readonly prunedBySize: number;
  readonly prunedByOvershoot: number;
  readonly prunedByReachability: number;
  readonly prunedByBound: number;
  readonly prunedByIncompatibility: number;
  readonly prunedByRedundancy: number;
  readonly prunedByMatchLimit: number;
  readonly prunedByDominance: number;
  readonly budgetExhausted: boolean;
}

export interface GeneratorResult {
  readonly combinations: readonly GeneratedCombination[];
  readonly stats: GeneratorStats;
  readonly warnings: readonly string[];
}

const keyOf = (matchId: string, ids: readonly string[]): string => `${matchId}|${[...ids].sort().join(',')}`;

export function generateCombinations(
  candidates: readonly CandidateLeg[],
  cfg: EngineConfig,
  opts: GeneratorOptions = {},
): GeneratorResult {
  const target = opts.targetOdds ?? cfg.optimizer.targetOdds;
  const tol = opts.targetTolerance ?? cfg.optimizer.targetTolerance;
  const maxSize = opts.maxSize ?? cfg.combination.maxCombinationSize;
  const minSize = opts.minSize ?? cfg.combination.minCombinationSize;
  const maxPerMatch = opts.maxLegsPerMatch ?? cfg.filters.maxLegsPerMatch;
  const maxNodes = opts.maxNodes ?? cfg.optimizer.maxNodesExplored;
  const maxResults = opts.maxResults ?? 5000;
  const grids = opts.grids ?? new Map<string, ScoreGrid>();
  const allowSameMatch = opts.allowSameMatch ?? true;
  const boundSlack = opts.boundSlack ?? Math.log(1.10);

  const lnTargetMin = Math.log(target);
  const lnTargetMax = Math.log(target * (1 + tol));

  // --- Orden previo por eficiencia de la mochila ---
  const items = candidates.map((c, i) => {
    const w = Math.log(c.selection.odds as number);
    const v = Math.log(Math.max(c.selection.fair * (c.selection.odds as number), 1e-12));
    return { i, c, w, v, ratio: w > 1e-9 ? v / w : -Infinity };
  }).filter((x) => Number.isFinite(x.ratio) && x.w > 1e-9)
    .sort((a, b) => b.ratio - a.ratio);

  const n = items.length;
  const warnings: string[] = [];
  if (n === 0) return { combinations: [], stats: zeroStats(), warnings: ['No hay candidatas utilizables.'] };

  // Sufijos: mejor ratio y peso maximo acumulable desde cada posicion.
  const bestRatioFrom = new Array<number>(n + 1).fill(-Infinity);
  for (let i = n - 1; i >= 0; i--) bestRatioFrom[i] = Math.max(items[i]!.ratio, bestRatioFrom[i + 1] as number);

  const topWeightsFrom: number[][] = [];
  for (let i = 0; i <= n; i++) topWeightsFrom.push([]);
  for (let i = n - 1; i >= 0; i--) {
    const merged = [items[i]!.w, ...(topWeightsFrom[i + 1] as number[])].sort((a, b) => b - a).slice(0, maxSize);
    topWeightsFrom[i] = merged;
  }
  const maxReachable = (from: number, slots: number): number => {
    const arr = topWeightsFrom[from] as number[];
    let s = 0;
    for (let k = 0; k < Math.min(slots, arr.length); k++) s += arr[k] as number;
    return s;
  };

  const stats = {
    nodesExplored: 0, prunedBySize: 0, prunedByOvershoot: 0, prunedByReachability: 0,
    prunedByBound: 0, prunedByIncompatibility: 0, prunedByRedundancy: 0,
    prunedByMatchLimit: 0, prunedByDominance: 0, budgetExhausted: false,
  };

  const jointCache = new Map<string, number>();
  const sameMatchJoint = (matchId: string, legs: readonly CandidateLeg[]): number | null => {
    const grid = grids.get(matchId);
    if (grid === undefined) return null;
    const preds = legs.map((l) => l.predicate);
    if (preds.some((p) => p === undefined)) return null;
    const k = keyOf(matchId, legs.map((l) => l.selection.selectionId));
    const hit = jointCache.get(k);
    if (hit !== undefined) return hit;
    const v = jointOnGrid(grid, preds as readonly ScorePredicate[], 'STRICT');
    jointCache.set(k, v);
    return v;
  };

  const results: GeneratedCombination[] = [];
  let bestValue = -Infinity; // mejor suma de valores vista entre las validas

  const chosen: number[] = [];
  const perMatch = new Map<string, CandidateLeg[]>();
  const usedMarkets = new Set<string>();

  const dfs = (start: number, lnOdds: number, value: number): void => {
    if (stats.nodesExplored >= maxNodes) { stats.budgetExhausted = true; return; }
    stats.nodesExplored++;

    const size = chosen.length;

    if (size >= minSize && lnOdds >= lnTargetMin && lnOdds <= lnTargetMax) {
      if (value > bestValue) bestValue = value;
      if (results.length < maxResults) {
        const idx = chosen.map((k) => items[k]!.i);
        const legs = chosen.map((k) => items[k]!.c);
        // Producto fair con correccion de correlacion exacta por partido.
        let fairProduct = 1;
        const groups = new Map<string, CandidateLeg[]>();
        for (const l of legs) {
          const g = groups.get(l.selection.matchId) ?? [];
          g.push(l);
          groups.set(l.selection.matchId, g);
        }
        for (const [mid, g] of groups) {
          if (g.length === 1) fairProduct *= g[0]!.selection.fair;
          else {
            const j = sameMatchJoint(mid, g);
            fairProduct *= j ?? g.reduce((a, l) => a * l.selection.fair, 1);
          }
        }
        results.push({
          indices: idx, odds: Math.exp(lnOdds), fairProduct,
          legs: size, matches: groups.size,
        });
      }
    }

    if (size >= maxSize) { stats.prunedBySize++; return; }
    if (lnOdds > lnTargetMax) { stats.prunedByOvershoot++; return; }

    for (let k = start; k < n; k++) {
      if (stats.nodesExplored >= maxNodes) { stats.budgetExhausted = true; return; }
      const it = items[k]!;
      const sel = it.c.selection;

      // Alcanzabilidad: ni con las mejores patas restantes se llega al objetivo.
      const slots = maxSize - size;
      if (lnOdds + maxReachable(k, slots) < lnTargetMin) { stats.prunedByReachability++; break; }

      // Cota superior de la mochila: relajacion lineal sobre el peso que falta.
      const remainingWeight = Math.max(0, lnTargetMin - lnOdds);
      const bound = value + remainingWeight * (bestRatioFrom[k] as number);
      if (results.length > 0 && bound < bestValue - boundSlack) { stats.prunedByBound++; continue; }

      // Incompatibilidad estructural: dos salidas del mismo mercado.
      if (usedMarkets.has(sel.marketId)) { stats.prunedByIncompatibility++; continue; }

      const group = perMatch.get(sel.matchId) ?? [];
      if (group.length > 0 && !allowSameMatch) { stats.prunedByMatchLimit++; continue; }
      if (group.length >= maxPerMatch) { stats.prunedByMatchLimit++; continue; }

      // Incompatibilidad / redundancia comprobadas contra la rejilla.
      if (group.length > 0) {
        const j = sameMatchJoint(sel.matchId, [...group, it.c]);
        if (j !== null) {
          if (j < 1e-6) { stats.prunedByIncompatibility++; continue; }
          const minSolo = Math.min(...[...group, it.c].map((l) => l.selection.fair));
          if (Math.abs(j - minSolo) < 1e-6) { stats.prunedByRedundancy++; continue; }
        }
      }

      chosen.push(k);
      usedMarkets.add(sel.marketId);
      perMatch.set(sel.matchId, [...group, it.c]);

      dfs(k + 1, lnOdds + it.w, value + it.v);

      chosen.pop();
      usedMarkets.delete(sel.marketId);
      if (group.length === 0) perMatch.delete(sel.matchId); else perMatch.set(sel.matchId, group);
    }
  };

  dfs(0, 0, 0);

  if (stats.budgetExhausted) warnings.push(`Presupuesto de ${maxNodes} nodos agotado: la busqueda no es exhaustiva y puede haberse dejado el optimo fuera.`);
  if (results.length === 0) warnings.push(`Ninguna combinada de entre ${minSize} y ${maxSize} patas alcanza la cuota objetivo ${target} con las candidatas dadas.`);

  const pruned = removeDominated(results);
  stats.prunedByDominance = results.length - pruned.length;

  return { combinations: pruned, stats, warnings };
}

/**
 * Elimina combinadas dominadas: C2 esta dominada por C1 si C1 paga igual o mas,
 * tiene igual o mas probabilidad y no usa mas patas, con alguna desigualdad
 * estricta.
 */
export function removeDominated(list: readonly GeneratedCombination[]): GeneratedCombination[] {
  const sorted = [...list].sort((a, b) => b.fairProduct - a.fairProduct || b.odds - a.odds || a.legs - b.legs);
  const kept: GeneratedCombination[] = [];
  for (const c of sorted) {
    const dominated = kept.some((k) =>
      k.odds >= c.odds && k.fairProduct >= c.fairProduct && k.legs <= c.legs &&
      (k.odds > c.odds || k.fairProduct > c.fairProduct || k.legs < c.legs));
    if (!dominated) kept.push(c);
  }
  return kept;
}

function zeroStats(): GeneratorStats {
  return {
    nodesExplored: 0, prunedBySize: 0, prunedByOvershoot: 0, prunedByReachability: 0,
    prunedByBound: 0, prunedByIncompatibility: 0, prunedByRedundancy: 0,
    prunedByMatchLimit: 0, prunedByDominance: 0, budgetExhausted: false,
  };
}
