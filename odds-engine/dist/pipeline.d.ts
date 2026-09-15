/**
 * Orquestador. Es la arquitectura de la seccion 23 del encargo, cableada:
 *
 *   Odds Collector -> Odds Normalizer -> Market Validator -> Overround
 *   -> Fair Probability -> Market Consensus -> Semaforo individual
 *   -> Correlation (rejilla de marcadores) -> Combination Generator
 *   -> Combined Odds -> Joint Probability -> Optimizer -> Confidence
 *   -> Ranking -> API
 *
 * El colector no vive aqui: entra `Market[]` ya normalizado por el backend.
 */
import type { Market, MatchContext, Selection } from './core/types.js';
import type { EngineConfig } from './config/index.js';
import { type GridFit, type ScoreGrid } from './correlation/scoreGrid.js';
import { type OptimizerResult, type OptimizerOptions } from './optimize/index.js';
export interface AnalyseInput {
    readonly matches: readonly MatchContext[];
    readonly markets: readonly Market[];
    /** Casa en la que se apuesta. Su precio es el que se toma. */
    readonly bookmaker: string;
    /** Casas usadas SOLO como referencia de consenso. */
    readonly referenceBookmakers?: readonly string[];
    readonly now?: number;
    readonly universe?: 'all' | 'top';
}
export interface AnalyseResult {
    readonly selections: readonly Selection[];
    readonly grids: ReadonlyMap<string, ScoreGrid>;
    readonly gridFits: ReadonlyMap<string, GridFit>;
    readonly warnings: readonly string[];
}
export declare function analyse(input: AnalyseInput, cfg?: EngineConfig): AnalyseResult;
export interface BuildResult extends AnalyseResult {
    readonly optimisation: OptimizerResult;
}
/** Analisis completo + construccion de la combinada. */
export declare function buildCombinations(input: AnalyseInput, cfg?: EngineConfig, opts?: OptimizerOptions): BuildResult;
