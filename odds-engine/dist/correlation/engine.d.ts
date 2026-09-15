/**
 * Correlation Engine.
 *
 * Tres regimenes, y el motor dice siempre en cual esta:
 *
 *  1. MISMO PARTIDO CON MODELO  -> conjunta exacta sobre la rejilla de
 *     marcadores ajustada a las cuotas. Es un calculo, no una suposicion.
 *  2. MISMO PARTIDO SIN MODELO  -> cotas de Frechet-Hoeffding. La conjunta esta
 *     acotada pero no determinada: se devuelve el punto independiente con una
 *     banda ancha, y la banda mata la combinada en el optimizador.
 *  3. PARTIDOS DISTINTOS        -> independencia, con un ajuste opcional de
 *     choque comun (misma liga, misma jornada, mismo arbitro...).
 *
 * Regla que no se rompe: si no hay datos para ajustar la correlacion, sube la
 * incertidumbre; NUNCA se mueve la probabilidad hacia donde interesa.
 */
import type { CorrelationRisk } from '../core/types.js';
import type { ScoreGrid } from './scoreGrid.js';
import type { ScorePredicate } from './predicates.js';
export interface CorrelationLeg {
    readonly selectionId: string;
    readonly matchId: string;
    readonly marketId: string;
    readonly fair: number;
    readonly odds: number;
    readonly predicate?: ScorePredicate;
}
export type CorrelationRegime = 'SAME_MATCH_MODEL' | 'SAME_MATCH_BOUNDS' | 'CROSS_MATCH';
export interface PairAnalysis {
    readonly a: string;
    readonly b: string;
    readonly regime: CorrelationRegime;
    readonly pA: number;
    readonly pB: number;
    readonly jointIndependent: number;
    readonly joint: number;
    readonly ratio: number;
    /** Coeficiente phi entre los dos sucesos binarios. */
    readonly coefficient: number;
    readonly frechetLow: number;
    readonly frechetHigh: number;
    readonly redundant: boolean;
    readonly incompatible: boolean;
}
export interface CorrelationReport {
    readonly pairs: readonly PairAnalysis[];
    readonly maxAbsCoefficient: number;
    readonly risk: CorrelationRisk;
    readonly hasRedundancy: boolean;
    readonly hasIncompatibility: boolean;
    readonly warnings: readonly string[];
}
export interface CorrelationContext {
    /** Rejilla ajustada por partido. Ausente => regimen de cotas. */
    readonly grids: ReadonlyMap<string, ScoreGrid>;
    /**
     * Correlacion residual supuesta entre patas de partidos DISTINTOS.
     * Por defecto 0 (independencia). Subirla es una hipotesis que hay que medir.
     */
    readonly crossMatchCoefficient?: number;
    readonly redundancyTolerance?: number;
}
export declare function analysePair(a: CorrelationLeg, b: CorrelationLeg, ctx: CorrelationContext): PairAnalysis;
export declare function analyseCorrelation(legs: readonly CorrelationLeg[], ctx: CorrelationContext): CorrelationReport;
