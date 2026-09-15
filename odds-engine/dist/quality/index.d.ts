/**
 * Odds Quality Score (0-100). Mide la calidad del DATO, nunca la bondad de la
 * apuesta. No modifica jamas la cuota original: solo alimenta el
 * confidenceScore.
 *
 * Es un producto de factores en (0,1]: cada defecto multiplica. Un producto y
 * no una suma ponderada a proposito — con una suma, un dato excelente en cinco
 * factores compensa uno inservible en el sexto, y eso es exactamente lo que no
 * queremos.
 */
import type { EngineConfig } from '../config/index.js';
export interface OddsQualityInput {
    /** Margen del mercado, o null si no se pudo calcular. */
    readonly overround: number | null;
    readonly marketComplete: boolean;
    readonly booksUsed: number;
    readonly dispersion: number | null;
    readonly ageMs: number;
    readonly live: boolean;
    /** |cambio de probabilidad implicita| desde la apertura. */
    readonly movement?: number;
    readonly liquidity?: number;
    /** Reputacion de la casa en (0,1]. */
    readonly bookReputation?: number;
}
export interface OddsQualityResult {
    readonly score: number;
    readonly factors: Readonly<Record<string, number>>;
    readonly reasons: readonly string[];
}
export declare function oddsQualityScore(input: OddsQualityInput, cfg: EngineConfig): OddsQualityResult;
