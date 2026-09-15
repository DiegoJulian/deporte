/**
 * Que hacer cuando SOLO tenemos una cuota (seccion 6 del encargo).
 *
 * Con una sola cuota el margen es inobservable: 1/c mezcla probabilidad y
 * comision sin forma de separarlas dentro de ese mercado. La respuesta ingenua
 * es no tocar nada y llamarlo "raw". La respuesta util es usar un PRIOR: el
 * peaje medio medido POR BANDA DE CUOTA sobre el historico del propio proyecto.
 *
 *     ventaja(banda) = retorno_por_euro - 1 = p_real * c - 1
 *     =>  p_real = (1 + ventaja) / c = p_raw * (1 + ventaja)
 *
 * Con ventaja negativa, p_real < p_raw: se le quita margen, como debe ser.
 * El resultado NUNCA se etiqueta FAIR_SINGLE_BOOK: va como
 * RAW_ODDS_BAND_ADJUSTED y arrastra el error tipico de su banda.
 *
 * Fuente de la tabla: `margen-por-banda-de-cuota.md` del proyecto —
 * 1X2 de Bet365, football-data.co.uk, desde agosto de 2015.
 * LIMITE IMPORTANTE: esta medido sobre 1X2. Aplicarla a un mercado binario
 * (over/under, ambos marcan, corners) es una extrapolacion, y el motor lo
 * senala con un aviso y con incertidumbre extra.
 */
import type { ProbabilitySource } from '../core/types.js';
export interface MarginBand {
    readonly minOdds: number;
    readonly maxOdds: number;
    /** Ventaja medida (retorno por euro - 1) en el universo "todas las ligas". */
    readonly edgeAll: number;
    readonly nAll: number;
    /** Ventaja medida restringiendo a las grandes ligas europeas. */
    readonly edgeTop: number;
    readonly nTop: number;
}
/** Tabla medida. Editarla es la unica forma de cambiar el prior. */
export declare const MARGIN_BANDS: readonly MarginBand[];
export declare function findBand(odds: number): MarginBand | null;
/**
 * Error tipico de la ventaja de la banda. Varianza de una apuesta a cuota c con
 * probabilidad p:  p(c-1)^2 + (1-p) - EV^2 . Dividido por sqrt(n).
 */
export declare function bandStandardError(band: MarginBand, universe: 'all' | 'top'): number;
export interface SingleOddsEstimate {
    readonly raw: number;
    readonly estimated: number;
    readonly source: ProbabilitySource;
    /** Desviacion tipica aproximada de `estimated`, en puntos de probabilidad. */
    readonly uncertainty: number;
    readonly band: MarginBand | null;
    readonly warnings: readonly string[];
}
export interface SingleOddsOptions {
    /** 'top' usa la columna de grandes ligas europeas. */
    readonly universe?: 'all' | 'top';
    /** true cuando el mercado NO es 1X2: la tabla esta medida sobre 1X2. */
    readonly extrapolatedFamily?: boolean;
}
/**
 * Estimacion desde una sola cuota. Devuelve SIEMPRE `source` distinto de
 * FAIR_SINGLE_BOOK: no se puede afirmar que el margen se haya retirado.
 */
export declare function estimateFromSingleOdds(odds: number, opts?: SingleOddsOptions): SingleOddsEstimate;
