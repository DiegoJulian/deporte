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
import { type CoherenceReport } from './market/coherence.js';
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
    /**
     * Coherencia entre 1X2, doble oportunidad y empate no valido, partido a
     * partido. Solo aparece el partido que traiga al menos dos de las tres.
     */
    readonly coherence: ReadonlyMap<string, CoherenceReport>;
    readonly warnings: readonly string[];
}
/**
 * 1X2, doble oportunidad y empate no valido NO son tres mercados: son la MISMA
 * distribucion del resultado escrita de tres maneras.
 *
 *   DC(1X) = P(1) + P(X)      DC(12) = P(1) + P(2)     DC(X2) = P(X) + P(2)
 *   DNB(1) = P(1) / (P(1) + P(2))
 *
 * Consecuencia para el ajuste de la rejilla de marcadores: las tres juntas
 * aportan como mucho DOS ecuaciones independientes sobre (lambda, mu, rho),
 * exactamente las mismas dos que aporta el 1X2 solo. Contarlas por separado
 * haria creer al motor que tiene cuatro o cinco restricciones cuando tiene dos,
 * y volveria a ajustar tres parametros con informacion para menos: es el mismo
 * fallo que el deduplicado roto, en version mas dificil de ver.
 *
 * Lo que SI aportan es otra cosa, y es valiosa: como la casa las cotiza por
 * separado, la discrepancia entre ellas delata un precio mal puesto SIN
 * necesidad de una segunda casa. Eso lo mide `checkCoherence`, no el ajuste.
 */
export declare const FAMILIAS_DEL_RESULTADO: ReadonlySet<string>;
export declare function analyse(input: AnalyseInput, cfg?: EngineConfig): AnalyseResult;
export interface BuildResult extends AnalyseResult {
    readonly optimisation: OptimizerResult;
}
/** Analisis completo + construccion de la combinada. */
export declare function buildCombinations(input: AnalyseInput, cfg?: EngineConfig, opts?: OptimizerOptions): BuildResult;
