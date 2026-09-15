/**
 * Fair Probability Engine. Convierte un Market en probabilidades, manteniendo
 * SIEMPRE separadas raw y fair, y etiquetando el origen.
 */
import type { Market, ProbabilitySource } from '../core/types.js';
import type { EngineConfig, DevigMethod } from '../config/index.js';
import { type DevigResult } from '../devig/methods.js';
import { type ValidationReport } from './validator.js';
export interface OutcomeProbability {
    readonly outcomeId: string;
    readonly label: string;
    readonly odds: number;
    readonly raw: number;
    readonly fair: number;
    readonly source: ProbabilitySource;
    readonly uncertainty: number;
    readonly warnings: readonly string[];
}
export interface MarketProbabilities {
    readonly marketId: string;
    readonly matchId: string;
    readonly bookmaker: string;
    readonly overround: number | null;
    readonly method: DevigMethod;
    readonly methodParameter: number | null;
    readonly outcomes: readonly OutcomeProbability[];
    readonly validation: ValidationReport;
    /** Dispersion entre los cinco metodos de devig, por salida. Incertidumbre de modelo. */
    readonly methodSpread: readonly number[];
    readonly shadows: Readonly<Partial<Record<DevigMethod, DevigResult>>>;
}
export interface FairProbabilityOptions {
    readonly universe?: 'all' | 'top';
}
export declare function computeMarketProbabilities(market: Market, bookmaker: string, cfg: EngineConfig, opts?: FairProbabilityOptions): MarketProbabilities;
