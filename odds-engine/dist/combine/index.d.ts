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
import type { CorrelationLeg, CorrelationReport } from '../correlation/engine.js';
export interface CombinedOddsResult {
    readonly odds: number;
    readonly legs: number;
}
/** Producto de cuotas. Valido siempre: es aritmetica del boleto, no probabilidad. */
export declare function combinedOdds(odds: readonly number[]): CombinedOddsResult;
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
export declare function jointProbability(input: JointProbabilityInput): JointProbabilityResult;
/**
 * Valor esperado exacto de una combinada cuyas patas son TODAS del mismo
 * partido, usando la rejilla y respetando los empates (push) del handicap
 * asiatico y del empate no valido.
 */
export declare function exactSameMatchExpectedReturn(grid: ScoreGrid, legs: readonly CorrelationLeg[]): number | null;
