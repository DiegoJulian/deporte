/**
 * Confidence Engine (seccion 15).
 *
 * confidenceScore NO es probabilidad x 100. Mide cuanto nos podemos fiar de la
 * ESTIMACION, no cuanto de probable es el suceso. Una combinada puede tener
 * 88 % de probabilidad y 40 de confianza: probable segun un dato pobre.
 *
 * Forma: producto de factores en (0,1]. Cada defecto multiplica. Se eligio
 * producto y no media ponderada porque con una media un solo factor
 * inservible queda tapado por los demas, y ese es justo el fallo que se
 * quiere evitar.
 *
 * El confidenceScore no vale nada mientras no se calibre. El modulo
 * `calibration` incluye la prueba: agrupar por decil de confianza y comprobar
 * que el error de calibracion baja al subir la confianza. Si no baja, el
 * numero es decorativo y hay que decirlo.
 */
import type { CorrelationRisk, ProbabilitySource } from '../core/types.js';
import type { EngineConfig } from '../config/index.js';
export interface ConfidenceInput {
    /** oddsQualityScore (0-100) de cada pata. */
    readonly legQuality: readonly number[];
    readonly sources: readonly ProbabilitySource[];
    readonly correlationRisk: CorrelationRisk;
    /** true si TODA pata del mismo partido tiene modelo de marcadores ajustado. */
    readonly correlationModelled: boolean;
    /** Incertidumbre de la probabilidad conjunta, en puntos. */
    readonly jointUncertainty: number;
    readonly adjustedJointProbability: number;
    /** Error maximo del ajuste de la rejilla, si lo hubo. */
    readonly gridMaxError?: number;
}
export interface ConfidenceResult {
    readonly score: number;
    readonly factors: Readonly<Record<string, number>>;
    readonly reasons: readonly string[];
}
export declare function confidenceScore(input: ConfidenceInput, cfg: EngineConfig): ConfidenceResult;
