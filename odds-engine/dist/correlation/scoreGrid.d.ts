import type { ScorePredicate } from './predicates.js';
export declare const MAX_GOALS = 12;
export interface ScoreGrid {
    readonly lambda: number;
    readonly mu: number;
    readonly rho: number;
    /** matrix[x][y] = P(local = x, visitante = y). Suma 1. */
    readonly matrix: readonly (readonly number[])[];
    readonly maxGoals: number;
}
export declare function buildGrid(lambda: number, mu: number, rho: number, maxGoals?: number): ScoreGrid;
/** P(WIN) y P(PUSH) de un predicado sobre la rejilla. */
export declare function evaluate(grid: ScoreGrid, predicate: ScorePredicate): {
    win: number;
    push: number;
    loss: number;
};
export interface FitTarget {
    readonly key: string;
    readonly predicate: ScorePredicate;
    /** Probabilidad fair observada (ya desmarginada). */
    readonly probability: number;
    readonly weight?: number;
}
export interface GridFit {
    readonly grid: ScoreGrid;
    /** Raiz del error cuadratico medio ponderado, en puntos de probabilidad. */
    readonly rmse: number;
    readonly maxAbsError: number;
    readonly residuals: readonly {
        key: string;
        target: number;
        fitted: number;
        error: number;
    }[];
    readonly converged: boolean;
    readonly targetsUsed: number;
    readonly warnings: readonly string[];
}
/**
 * Ajusta (lambda, mu, rho) a las probabilidades fair observadas.
 * Necesita al menos 3 objetivos independientes; con menos devuelve null y el
 * motor cae a las cotas de Frechet. Nunca extrapola con un ajuste que no tiene
 * grados de libertad.
 */
export declare function fitGridFromMarkets(targets: readonly FitTarget[], maxGoals?: number): GridFit | null;
/**
 * Probabilidad conjunta exacta de varias patas del MISMO partido.
 * `mode`:
 *  - 'STRICT'  : todas WIN (el push cuenta como fallo)
 *  - 'PUSH_OK' : las patas en PUSH se anulan y no rompen la combinada
 */
export declare function jointOnGrid(grid: ScoreGrid, predicates: readonly ScorePredicate[], mode?: 'STRICT' | 'PUSH_OK'): number;
/**
 * Valor esperado exacto de una combinada del mismo partido, teniendo en cuenta
 * que una pata en PUSH se anula y su cuota sale del producto.
 * Devuelve el retorno medio por euro apostado (1 = devolver lo apostado).
 */
export declare function expectedReturnOnGrid(grid: ScoreGrid, legs: readonly {
    predicate: ScorePredicate;
    odds: number;
}[]): number;
