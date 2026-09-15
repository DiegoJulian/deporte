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
export declare function generateCombinations(candidates: readonly CandidateLeg[], cfg: EngineConfig, opts?: GeneratorOptions): GeneratorResult;
/**
 * Elimina combinadas dominadas: C2 esta dominada por C1 si C1 paga igual o mas,
 * tiene igual o mas probabilidad y no usa mas patas, con alguna desigualdad
 * estricta.
 */
export declare function removeDominated(list: readonly GeneratedCombination[]): GeneratedCombination[];
