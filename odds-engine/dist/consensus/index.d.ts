/**
 * Market Consensus Engine + Market Dispersion (secciones 16 y 17).
 *
 * El error que hay que evitar es promediar 1/cuota entre casas. Eso promedia
 * probabilidades infladas cada una con un margen distinto, y el resultado
 * no suma 1 ni significa nada. La secuencia correcta es:
 *
 *   1. quedarse SOLO con las casas que cotizan el mercado COMPLETO;
 *   2. desmarginar cada casa por separado;
 *   3. detectar atipicas con mediana + MAD sobre el logit;
 *   4. ponderar: menos margen y mas frescura pesan mas;
 *   5. agregar EN ESPACIO LOGIT y renormalizar a 1.
 *
 * Se agrega en logit y no en probabilidad porque la media aritmetica de
 * probabilidades esta sesgada hacia el centro en los extremos y rompe la
 * estructura de momios que es justo lo que las casas cotizan.
 */
import type { Market } from '../core/types.js';
import type { EngineConfig } from '../config/index.js';
export interface BookFair {
    readonly bookmaker: string;
    readonly fair: readonly number[];
    readonly overround: number;
    readonly observedAt: number;
    readonly weight: number;
    readonly outlier: boolean;
    /** z robusto sobre el logit de la salida mas discrepante. */
    readonly maxRobustZ: number;
}
export interface ConsensusResult {
    readonly outcomeIds: readonly string[];
    readonly consensus: readonly number[];
    readonly books: readonly BookFair[];
    readonly booksUsed: number;
    readonly booksExcluded: number;
    /** Tamano de muestra efectivo de Kish: (sum w)^2 / sum w^2. */
    readonly effectiveBooks: number;
    /** Dispersion por salida, en puntos de probabilidad (desv. tipica ponderada). */
    readonly dispersion: readonly number[];
    /** Dispersion robusta por salida (MAD escalado). */
    readonly dispersionRobust: readonly number[];
    readonly range: readonly number[];
    readonly warnings: readonly string[];
}
export interface ConsensusOptions {
    /** Peso de reputacion por casa. Ausente => 1. */
    readonly bookWeights?: Readonly<Record<string, number>>;
    /** Semivida de frescura en ms. */
    readonly freshnessHalfLife?: number;
    /** Umbral de z robusto para marcar atipica. */
    readonly outlierZ?: number;
    readonly now?: number;
}
export declare function computeConsensus(market: Market, cfg: EngineConfig, opts?: ConsensusOptions): ConsensusResult;
