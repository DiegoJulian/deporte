/**
 * Combination Optimizer (seccion 11).
 *
 * No busca "la combinada con mas patas" ni "la de mas probabilidad": busca la
 * mejor relacion entre probabilidad ajustada, numero de patas, cuota, margen,
 * correlacion e incertidumbre, con la cuota objetivo como restriccion.
 *
 * PRINCIPIO DE CONSERVADURISMO (seccion 27): si despues de todo esto ninguna
 * combinada supera los filtros, la salida es "NO EXISTE COMBINACION VERDE CON
 * SUFICIENTE CONFIANZA". El motor no baja el liston para tener algo que
 * ensenar.
 */
import type { CorrelationRisk, Selection } from '../core/types.js';
import type { EngineConfig } from '../config/index.js';
import type { ScoreGrid } from '../correlation/scoreGrid.js';
import type { CandidateLeg, GeneratorOptions, GeneratorStats } from '../combine/generator.js';
import { type JointProbabilityResult } from '../combine/index.js';
import { type CombinationClassification } from '../classify/index.js';
import { type RankResult } from '../rank/index.js';
export interface EvaluatedCombination {
    readonly selections: readonly Selection[];
    readonly combinedOdds: number;
    readonly joint: JointProbabilityResult;
    readonly confidence: number;
    readonly confidenceReasons: readonly string[];
    readonly correlationRisk: CorrelationRisk;
    readonly rank: RankResult;
    readonly classification: CombinationClassification;
    readonly legs: number;
    readonly warnings: readonly string[];
}
export interface OptimizerResult {
    readonly candidates: readonly EvaluatedCombination[];
    readonly best: EvaluatedCombination | null;
    readonly bestAttainableProbability: number | null;
    readonly verdict: string;
    readonly anyEdge: boolean;
    readonly stats: GeneratorStats;
    readonly rejected: {
        readonly reason: string;
        readonly count: number;
    }[];
    readonly warnings: readonly string[];
}
export interface OptimizerOptions extends GeneratorOptions {
    readonly grids?: ReadonlyMap<string, ScoreGrid>;
    readonly gridMaxErrors?: ReadonlyMap<string, number>;
    readonly conservative?: boolean;
    readonly universe?: 'all' | 'top';
    /** Aplicar los filtros duros de configuracion. */
    readonly applyFilters?: boolean;
}
export declare function optimiseCombinations(candidates: readonly CandidateLeg[], cfg: EngineConfig, opts?: OptimizerOptions): OptimizerResult;
