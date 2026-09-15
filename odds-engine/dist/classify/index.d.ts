/**
 * Semaforos.
 *
 * DOS EJES, y no son intercambiables:
 *
 *   RIESGO  (el semaforo del encargo) = probabilidad de que la seleccion ocurra.
 *           Es una funcion monotona de la cuota: VERDE equivale a cuota corta.
 *           NO dice nada sobre si la apuesta es rentable.
 *
 *   VALOR   = EV frente a una referencia EXTERNA (consenso de otras casas o
 *           modelo de marcadores). Es el unico eje que puede ser rentable.
 *
 * Guardia critica: si la referencia para el EV es el propio precio desmarginado
 * de la MISMA casa, el EV sale negativo por construccion y no significa nada.
 * En ese caso el eje de valor devuelve SIN_REFERENCIA, nunca NEGATIVO.
 */
import type { CombinationLight, RiskLight, ValueLight } from '../core/types.js';
import type { EngineConfig } from '../config/index.js';
export declare function classifyThreeWay(fair: number, cfg: EngineConfig): RiskLight;
export declare function classifyBinary(fair: number, cfg: EngineConfig): RiskLight;
export interface ValueInput {
    readonly odds: number;
    /** Probabilidad de referencia EXTERNA. */
    readonly reference: number | null;
    readonly basis: 'consensus' | 'model' | 'self' | null;
    /** Desv. tipica de `reference`, en puntos de probabilidad. */
    readonly referenceUncertainty?: number;
}
export interface ValueVerdict {
    readonly light: ValueLight;
    readonly expectedValue: number | null;
    /** Cota inferior del EV al 95 % usando la incertidumbre de la referencia. */
    readonly expectedValueLcb: number | null;
    readonly basis: 'consensus' | 'model' | null;
    readonly reason: string;
}
export declare function classifyValue(input: ValueInput, cfg: EngineConfig): ValueVerdict;
export interface CombinationClassification {
    readonly light: CombinationLight;
    readonly validated: boolean;
    readonly label: string;
    readonly basis: 'ABSOLUTE' | 'RELATIVE_TO_TARGET';
    readonly scale: number;
}
/**
 * Semaforo de combinada.
 *
 * En modo RELATIVE_TO_TARGET la escala no es la probabilidad absoluta sino
 * `P_adj / P_mejor_alcanzable` para la cuota objetivo. Motivo, con numeros:
 * una combinada que paga 2,5120 tiene como mucho 39,81 % de probabilidad
 * (1/2,5120) y eso es ANTES de margen; con los umbrales absolutos del encargo
 * (VERDE > 85 %, DESCARTAR < 55 %) toda combinada que llegue a esa cuota sale
 * DESCARTAR, siempre, por aritmetica. El modo relativo conserva los mismos
 * numeros pero midiendo lo que si se puede comparar: como de buena es esta
 * combinada frente a la mejor posible para el mismo objetivo.
 */
export declare function classifyCombination(adjustedJointProbability: number, confidence: number, cfg: EngineConfig, bestAttainable?: number): CombinationClassification;
