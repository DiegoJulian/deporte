import type { DevigMethod } from '../config/index.js';
export interface DevigResult {
    readonly method: DevigMethod;
    readonly fair: readonly number[];
    readonly overround: number;
    /** Parametro estimado: k en potencia, z en Shin, c en odds-ratio. */
    readonly parameter: number | null;
    readonly converged: boolean;
    /**
     * A cuanto tienen que sumar las probabilidades fair de este mercado.
     * Es 1 en casi todos, pero NO en doble oportunidad: 1X + 12 + X2 cubre cada
     * resultado dos veces, asi que suma 2. Normalizar a 1 un bloque de doble
     * oportunidad da probabilidades a la mitad de lo que valen.
     * (Comprobado contra la respuesta real del feed, `ampliacion-de-mercados.md`.)
     */
    readonly target: number;
    readonly warnings: readonly string[];
}
/** Reparto proporcional: p_i = T · r_i / S. Asume margen uniforme EN PROBABILIDAD. */
export declare function devigProportional(raw: readonly number[], target?: number): DevigResult;
/**
 * Reparto aditivo (Vovk): p_i = r_i - (S-1)/n. Asume margen uniforme EN PUNTOS.
 * Puede dar probabilidades negativas en mercados muy desequilibrados; cuando
 * pasa, `converged` es false y el resultado NO debe usarse.
 */
export declare function devigAdditive(raw: readonly number[], target?: number): DevigResult;
/**
 * Metodo de potencia (Clarke): p_i = r_i^k con sum(p_i) = 1, k > 1.
 * Quita proporcionalmente MAS margen a las cuotas altas, que es donde la casa
 * lo carga de verdad (sesgo favorito-longshot, medido en este proyecto:
 * -0,5 % de peaje a cuota 1,30 frente a -13,5 % a cuota 5). Es el que usa el
 * panel por defecto.
 */
export declare function devigPower(raw: readonly number[], target?: number): DevigResult;
/**
 * Odds-ratio (Cheung): mantiene constante la razon de momios entre la cuota
 * publicada y la justa:  r/(1-r) = c * p/(1-p)  =>  p = r / (c(1-r) + r).
 */
export declare function devigOddsRatio(raw: readonly number[], target?: number): DevigResult;
/**
 * Shin. Es el unico con un modelo economico detras: supone que una fraccion z
 * del dinero apostado viene de gente con informacion privilegiada, y que la
 * casa ensancha el precio para protegerse de ella. Como los informados apuestan
 * sobre todo a cuotas altas, Shin tambien carga mas margen ahi.
 *
 *     p_i = ( sqrt(z^2 + 4(1-z) r_i^2 / S) - z ) / (2(1-z))
 */
export declare function devigShin(raw: readonly number[], target?: number): DevigResult;
export declare function devig(raw: readonly number[], method: DevigMethod, target?: number): DevigResult;
/** Ejecuta todos los metodos. Sirve para medir cuanto discrepan entre si. */
export declare function devigAll(raw: readonly number[], target?: number): Record<DevigMethod, DevigResult>;
/**
 * Cuanto se separan los metodos entre si para la misma salida. Es una medida de
 * incertidumbre de MODELO: si los cinco coinciden, el reparto del margen apenas
 * importa; si discrepan, la probabilidad "fair" es una eleccion nuestra y hay
 * que decirlo.
 */
export declare function devigModelSpread(raw: readonly number[], index: number, target?: number): number;
