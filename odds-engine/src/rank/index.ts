/**
 * Ranking Engine (seccion 20).
 *
 * El encargo pedia una funcion de puntuacion "matematicamente coherente" y que
 * NO fuera "probabilidad mas cuota". Un ranking por probabilidad ordena las
 * combinadas de mayor a menor favoritismo, que es tanto como ordenarlas por
 * cuota al reves: no aporta nada y empuja hacia la parte del mercado mejor
 * valorada, donde el propio proyecto ya midio -1,85 % de retorno.
 *
 * La puntuacion usada es la TASA DE CRECIMIENTO LOGARITMICO OPTIMA (Kelly):
 *
 *     f*  = (P*O - 1) / (O - 1)                 fraccion optima del bankroll
 *     g*  = P*ln(1 + f*(O-1)) + (1-P)*ln(1 - f*)   crecimiento por apuesta
 *
 * Por que esta y no otra: g* es cero cuando no hay ventaja y crece con la
 * ventaja, pero penaliza la varianza sin que haya que anadir ningun termino a
 * mano. Las seis prioridades del encargo entran solas:
 *   probabilidad -> P;  cuota -> O;  margen -> P*O-1;
 *   correlacion e incertidumbre -> via P ajustada y su cota inferior;
 *   calidad -> via el encogimiento por confianza;
 *   numero de patas -> via el margen compuesto, que crece con N.
 *
 * ENCOGIMIENTO POR CONFIANZA. No se usa P_ajustada tal cual, sino
 *
 *     P_post = w * P_ajustada + (1 - w) * P_prior,     w = confianza/100
 *
 * donde P_prior es "no sabemos nada mas que el precio": la probabilidad bruta
 * corregida por el peaje medio de esa banda de cuota. Asi, confianza cero no
 * lleva a EV cero, lleva a EV = peaje. Que es la verdad.
 */
import type { CorrelationRisk } from '../core/types.js';
import { clamp } from '../core/numeric.js';
import { findBand } from '../devig/singleOdds.js';

export interface RankInput {
  readonly adjustedJointProbability: number;
  readonly adjustedLowerBound: number;
  readonly combinedOdds: number;
  readonly confidence: number;
  readonly correlationRisk: CorrelationRisk;
  readonly legs: number;
  readonly compoundMargin: number;
  /** Usar la cota inferior en vez del punto: modo conservador. */
  readonly conservative?: boolean;
  readonly universe?: 'all' | 'top';
}

export interface RankResult {
  /** Probabilidad tras encoger hacia el prior de mercado. */
  readonly posteriorProbability: number;
  readonly expectedValue: number;
  readonly kellyFraction: number;
  /** Tasa de crecimiento logaritmico. Cero si no hay ventaja. */
  readonly growthRate: number;
  /** growthRate * 10^4. Es el `combinationScore`. */
  readonly score: number;
  /** Cuando no hay ventaja en ninguna candidata, ordena por peaje: menos malo primero. */
  readonly tollScore: number;
  readonly hasEdge: boolean;
  readonly explanation: string;
}

/** Prior de mercado: probabilidad bruta corregida por el peaje medido de la banda. */
export function marketPrior(combinedOdds: number, universe: 'all' | 'top' = 'all'): number {
  const band = findBand(combinedOdds);
  const edge = band === null ? -0.18 : universe === 'top' ? band.edgeTop : band.edgeAll;
  return clamp((1 / combinedOdds) * (1 + edge), 1e-6, 0.999999);
}

export function kellyGrowth(p: number, odds: number): { fraction: number; growth: number } {
  const b = odds - 1;
  if (b <= 0) return { fraction: 0, growth: 0 };
  const f = (p * odds - 1) / b;
  if (!(f > 0)) return { fraction: 0, growth: 0 };
  const fr = Math.min(f, 0.999999);
  const growth = p * Math.log(1 + fr * b) + (1 - p) * Math.log(1 - fr);
  return { fraction: fr, growth: Math.max(growth, 0) };
}

export function rankCombination(input: RankInput): RankResult {
  const w = clamp(input.confidence / 100, 0, 1);
  const pEstimate = input.conservative === true ? input.adjustedLowerBound : input.adjustedJointProbability;
  const prior = marketPrior(input.combinedOdds, input.universe ?? 'all');
  const posterior = clamp(w * pEstimate + (1 - w) * prior, 1e-9, 1 - 1e-9);

  const ev = posterior * input.combinedOdds - 1;
  const { fraction, growth } = kellyGrowth(posterior, input.combinedOdds);
  const hasEdge = ev > 0 && growth > 0;

  const explanation = hasEdge
    ? `EV ${(ev * 100).toFixed(2)} % con confianza ${input.confidence.toFixed(0)}/100; Kelly pleno ${(fraction * 100).toFixed(1)} % del bankroll, crecimiento ${(growth * 1e4).toFixed(1)} puntos base por apuesta.`
    : `Sin ventaja: EV ${(ev * 100).toFixed(2)} %. La combinada paga un peaje compuesto del ${(input.compoundMargin * 100).toFixed(2)} % repartido en ${input.legs} pata(s).`;

  return {
    posteriorProbability: posterior,
    expectedValue: ev,
    kellyFraction: fraction,
    growthRate: growth,
    score: growth * 1e4,
    tollScore: -ev,
    hasEdge,
    explanation,
  };
}

/**
 * Orden final. Lexicografico, en el orden de prioridades del encargo:
 *   1. crecimiento (ventaja real)
 *   2. si nadie tiene ventaja: menor peaje
 *   3. menos patas
 *   4. menor correlacion
 *   5. mayor confianza
 */
const RISK_ORDER: Record<CorrelationRisk, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, EXTREME: 3 };

export interface Rankable { readonly rank: RankResult; readonly legs: number; readonly correlationRisk: CorrelationRisk; readonly confidence: number; }

export function compareCombinations(a: Rankable, b: Rankable): number {
  if (a.rank.score !== b.rank.score) return b.rank.score - a.rank.score;
  if (a.rank.tollScore !== b.rank.tollScore) return a.rank.tollScore - b.rank.tollScore;
  if (a.legs !== b.legs) return a.legs - b.legs;
  const ra = RISK_ORDER[a.correlationRisk];
  const rb = RISK_ORDER[b.correlationRisk];
  if (ra !== rb) return ra - rb;
  return b.confidence - a.confidence;
}
