/** Utilidades numericas. Sin dependencias externas: el backend no tiene ninguna. */
export declare const clamp: (x: number, lo: number, hi: number) => number;
export declare const sum: (xs: readonly number[]) => number;
export declare const mean: (xs: readonly number[]) => number;
export declare function median(xs: readonly number[]): number;
export declare function stdev(xs: readonly number[]): number;
/** Desviacion absoluta mediana, escalada para ser comparable a la desv. tipica. */
export declare function mad(xs: readonly number[]): number;
/**
 * Busqueda de raiz por Brent. Requiere que f(a) y f(b) tengan signo opuesto.
 * Devuelve null si no hay cambio de signo o no converge: el llamante decide,
 * el motor NUNCA devuelve un numero inventado.
 */
export declare function brent(f: (x: number) => number, a: number, b: number, tol?: number, maxIter?: number): number | null;
/** Nelder-Mead para el ajuste de la distribucion de marcadores (3 parametros). */
export declare function nelderMead(f: (x: readonly number[]) => number, x0: readonly number[], opts?: {
    step?: number;
    maxIter?: number;
    tol?: number;
}): {
    x: number[];
    fx: number;
    iterations: number;
    converged: boolean;
};
export declare function lnFactorial(n: number): number;
export declare const poissonPmf: (k: number, lambda: number) => number;
/** Funcion de distribucion normal estandar (Abramowitz & Stegun 26.2.17). */
export declare function normalCdf(z: number): number;
/** Cuantil normal estandar (algoritmo de Acklam). */
export declare function normalQuantile(p: number): number;
