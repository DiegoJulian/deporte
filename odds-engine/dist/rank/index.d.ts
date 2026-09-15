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
    /**
     * Cuotas de cada pata. Cuando estan, el prior se compone pata a pata con la
     * banda de cada una (lo correcto). Sin ellas se cae a `marketPrior` sobre la
     * cuota combinada, que extrapola la tabla de simples y subestima el peaje.
     */
    readonly legOdds?: readonly number[];
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
export declare function marketPrior(combinedOdds: number, universe?: 'all' | 'top'): number;
/**
 * Prior de mercado de una COMBINADA, pata a pata.
 *
 * `marketPrior` aplicado a la cuota combinada es una extrapolacion silenciosa:
 * MARGIN_BANDS esta medida sobre apuestas SIMPLES de 1X2, y preguntarle por una
 * cuota de 12,0 que en realidad son cuatro patas de 1,86 devuelve el peaje de
 * la banda 4,50–8,00 (o el -18 % de fuera de rango) en vez del peaje compuesto
 * que se paga de verdad. Y lo hace SIEMPRE en la direccion mala: subestima el
 * peaje, con lo que el prior queda alto y la combinada parece mejor de lo que
 * es. Justo el error que este motor existe para no cometer.
 *
 *     prior = prod_i  (1/cuota_i) * (1 + ventaja_de_su_banda)
 *
 * Cada pata se evalua en SU banda, que es donde la tabla si esta medida, y el
 * peaje se compone N veces, que es como se cobra.
 */
export declare function combinedMarketPrior(legOdds: readonly number[], universe?: 'all' | 'top'): number;
export declare function kellyGrowth(p: number, odds: number): {
    fraction: number;
    growth: number;
};
export declare function rankCombination(input: RankInput): RankResult;
export interface Rankable {
    readonly rank: RankResult;
    readonly legs: number;
    readonly correlationRisk: CorrelationRisk;
    readonly confidence: number;
}
export declare function compareCombinations(a: Rankable, b: Rankable): number;
