/**
 * Cuota combinada y probabilidad conjunta (secciones 8, 9 y 14).
 *
 * EL PRINCIPIO QUE NO SE PUEDE OLVIDAR: anadir patas sube la cuota y BAJA la
 * probabilidad. Nunca al reves. Y hay un segundo efecto, menos conocido y peor:
 * el margen tambien se multiplica.
 *
 *     EV_combinada = prod(1 + EV_i) - 1        (patas independientes)
 *
 * Con cinco patas al -1,78 % de peaje cada una, la combinada paga -8,59 %, no
 * -1,78 %. Repartir la cuota en mas patas abarata el peaje POR PATA pero lo
 * cobra N veces. Este modulo calcula ese numero explicitamente para que el
 * optimizador no pueda ignorarlo.
 */
import type { ScoreGrid } from '../correlation/scoreGrid.js';
import { expectedReturnOnGrid, jointOnGrid } from '../correlation/scoreGrid.js';
import type { CorrelationLeg, CorrelationContext, CorrelationReport } from '../correlation/engine.js';
import { analyseCorrelation } from '../correlation/engine.js';

export interface CombinedOddsResult {
  readonly odds: number;
  readonly legs: number;
}

/** Producto de cuotas. Valido siempre: es aritmetica del boleto, no probabilidad. */
export function combinedOdds(odds: readonly number[]): CombinedOddsResult {
  if (odds.length === 0) throw new RangeError('Una combinada necesita al menos una pata');
  return { odds: odds.reduce((a, b) => a * b, 1), legs: odds.length };
}

export interface JointProbabilityInput {
  readonly legs: readonly CorrelationLeg[];
  /** Desv. tipica de la probabilidad fair de cada pata, mismo orden. */
  readonly uncertainties: readonly number[];
  readonly grids: ReadonlyMap<string, ScoreGrid>;
  readonly crossMatchCoefficient?: number;
}

export interface JointProbabilityResult {
  /** 1 / producto de cuotas. Lleva el margen dentro N veces. */
  readonly rawJointProbability: number;
  /** Producto de las probabilidades fair, asumiendo independencia. */
  readonly fairJointProbability: number;
  /** Ajustada por correlacion. Es la unica que se usa para decidir. */
  readonly adjustedJointProbability: number;
  /** Cota inferior al 95 % de la ajustada. El optimizador decide con esta. */
  readonly adjustedLowerBound: number;
  readonly uncertainty: number;
  readonly frechetLow: number;
  readonly frechetHigh: number;
  readonly combinedOdds: number;
  /** Margen compuesto: 1 - prod(fair_i * odds_i). Lo que cuesta la combinada. */
  readonly compoundMargin: number;
  readonly correlation: CorrelationReport;
  /** Regimen usado por grupo de partido. */
  readonly regimes: Readonly<Record<string, 'MODEL' | 'BOUNDS' | 'SINGLE'>>;
  readonly warnings: readonly string[];
}

const Z95 = 1.959963985;

export function jointProbability(input: JointProbabilityInput): JointProbabilityResult {
  const { legs, uncertainties, grids } = input;
  if (legs.length === 0) throw new RangeError('Una combinada necesita al menos una pata');

  const ctx: CorrelationContext = {
    grids,
    ...(input.crossMatchCoefficient !== undefined ? { crossMatchCoefficient: input.crossMatchCoefficient } : {}),
  };
  const correlation = analyseCorrelation(legs, ctx);
  const warnings: string[] = [...correlation.warnings];

  const O = legs.reduce((a, l) => a * l.odds, 1);
  const rawJoint = 1 / O;
  const fairJoint = legs.reduce((a, l) => a * l.fair, 1);

  // --- Agrupar por partido ---
  const byMatch = new Map<string, { legs: CorrelationLeg[]; idx: number[] }>();
  legs.forEach((l, i) => {
    const g = byMatch.get(l.matchId) ?? { legs: [], idx: [] };
    g.legs.push(l); g.idx.push(i);
    byMatch.set(l.matchId, g);
  });

  const regimes: Record<string, 'MODEL' | 'BOUNDS' | 'SINGLE'> = {};
  let adjusted = 1;
  let relVar = 0;
  let boundsPenalty = 0;

  for (const [matchId, group] of byMatch) {
    const grid = grids.get(matchId);
    const preds = group.legs.map((l) => l.predicate);
    const allHavePredicates = preds.every((p) => p !== undefined);

    if (group.legs.length === 1) {
      regimes[matchId] = 'SINGLE';
      adjusted *= group.legs[0]!.fair;
    } else if (grid !== undefined && allHavePredicates) {
      regimes[matchId] = 'MODEL';
      adjusted *= jointOnGrid(grid, preds as readonly ((h: number, a: number) => 'WIN' | 'LOSS' | 'PUSH')[], 'STRICT');
    } else {
      regimes[matchId] = 'BOUNDS';
      const indep = group.legs.reduce((a, l) => a * l.fair, 1);
      adjusted *= indep;
      // Ancho de la banda de Frechet del grupo, como incertidumbre anadida.
      const lo = Math.max(0, group.legs.reduce((a, l) => a + l.fair, 0) - (group.legs.length - 1));
      const hi = Math.min(...group.legs.map((l) => l.fair));
      boundsPenalty += ((hi - lo) / 2) ** 2;
      warnings.push(`Partido ${matchId}: ${group.legs.length} patas del mismo encuentro sin modelo de marcadores. La conjunta real esta entre ${(lo * 100).toFixed(1)} % y ${(hi * 100).toFixed(1)} %; se usa el producto como punto medio y se le pone esa banda encima.`);
    }

    for (const i of group.idx) {
      const p = legs[i]!.fair;
      const s = uncertainties[i] ?? 0;
      if (p > 1e-9) relVar += (s / p) ** 2;
    }
  }

  const frechetLow = Math.max(0, legs.reduce((a, l) => a + l.fair, 0) - (legs.length - 1));
  const frechetHigh = Math.min(...legs.map((l) => l.fair));
  adjusted = Math.min(frechetHigh, Math.max(frechetLow, adjusted));

  const uncertainty = Math.sqrt((adjusted ** 2) * relVar + boundsPenalty);
  const adjustedLowerBound = Math.max(frechetLow, Math.min(adjusted, adjusted - Z95 * uncertainty));

  // Peaje compuesto: lo que se paga por montar ESTA combinada.
  const compoundMargin = 1 - legs.reduce((a, l) => a * (l.fair * l.odds), 1);

  if (legs.length >= 4) {
    warnings.push(`${legs.length} patas: el peaje compuesto es del ${(compoundMargin * 100).toFixed(2)} %. Cada pata extra multiplica el margen, no lo reparte.`);
  }

  return {
    rawJointProbability: rawJoint,
    fairJointProbability: fairJoint,
    adjustedJointProbability: adjusted,
    adjustedLowerBound,
    uncertainty,
    frechetLow, frechetHigh,
    combinedOdds: O,
    compoundMargin,
    correlation,
    regimes,
    warnings,
  };
}

/**
 * Valor esperado exacto de una combinada cuyas patas son TODAS del mismo
 * partido, usando la rejilla y respetando los empates (push) del handicap
 * asiatico y del empate no valido.
 */
export function exactSameMatchExpectedReturn(grid: ScoreGrid, legs: readonly CorrelationLeg[]): number | null {
  if (legs.some((l) => l.predicate === undefined)) return null;
  return expectedReturnOnGrid(grid, legs.map((l) => ({ predicate: l.predicate!, odds: l.odds })));
}
