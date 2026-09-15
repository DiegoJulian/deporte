/**
 * Market Validator. Se ejecuta ANTES de calcular nada: un mercado que no pasa
 * por aqui no genera probabilidades, genera avisos.
 */
import type { Market } from '../core/types.js';
import type { EngineConfig } from '../config/index.js';
export type ValidationSeverity = 'INFO' | 'WARN' | 'ERROR';
export interface ValidationIssue {
    readonly code: string;
    readonly severity: ValidationSeverity;
    readonly message: string;
}
export interface ValidationReport {
    readonly ok: boolean;
    readonly usable: boolean;
    readonly overround: number | null;
    readonly issues: readonly ValidationIssue[];
}
/** Mejor cuota por salida entre todas las casas presentes. */
export declare function bestOddsPerOutcome(market: Market): number[];
export declare function validateMarket(market: Market, cfg: EngineConfig, bookmaker?: string): ValidationReport;
