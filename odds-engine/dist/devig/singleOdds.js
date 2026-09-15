/** Tabla medida. Editarla es la unica forma de cambiar el prior. */
export const MARGIN_BANDS = [
    { minOdds: 1.00, maxOdds: 1.18, edgeAll: -0.0068, nAll: 1446, edgeTop: -0.0056, nTop: 792 },
    { minOdds: 1.18, maxOdds: 1.25, edgeAll: -0.0099, nAll: 1958, edgeTop: -0.0269, nTop: 923 },
    { minOdds: 1.25, maxOdds: 1.33, edgeAll: -0.0053, nAll: 2873, edgeTop: -0.0035, nTop: 1191 },
    { minOdds: 1.33, maxOdds: 1.42, edgeAll: -0.0190, nAll: 4752, edgeTop: -0.0141, nTop: 1699 },
    { minOdds: 1.42, maxOdds: 1.55, edgeAll: -0.0288, nAll: 8025, edgeTop: -0.0059, nTop: 2403 },
    { minOdds: 1.55, maxOdds: 1.70, edgeAll: -0.0346, nAll: 12005, edgeTop: -0.0350, nTop: 3024 },
    { minOdds: 1.70, maxOdds: 1.90, edgeAll: -0.0312, nAll: 18258, edgeTop: -0.0162, nTop: 4275 },
    { minOdds: 1.90, maxOdds: 2.15, edgeAll: -0.0482, nAll: 26118, edgeTop: -0.0383, nTop: 5964 },
    { minOdds: 2.15, maxOdds: 2.45, edgeAll: -0.0493, nAll: 30431, edgeTop: -0.0378, nTop: 6583 },
    { minOdds: 2.45, maxOdds: 2.80, edgeAll: -0.0701, nAll: 29522, edgeTop: -0.0705, nTop: 6386 },
    { minOdds: 2.80, maxOdds: 3.30, edgeAll: -0.0499, nAll: 68614, edgeTop: -0.0498, nTop: 15803 },
    { minOdds: 3.30, maxOdds: 4.50, edgeAll: -0.0810, nAll: 116887, edgeTop: -0.0620, nTop: 26835 },
    { minOdds: 4.50, maxOdds: 8.00, edgeAll: -0.1352, nAll: 42223, edgeTop: -0.1445, nTop: 13804 },
];
/** Peaje supuesto fuera de la tabla: peor que la peor banda medida. */
const OUT_OF_RANGE_EDGE = -0.18;
export function findBand(odds) {
    return MARGIN_BANDS.find((b) => odds >= b.minOdds && odds < b.maxOdds) ?? null;
}
/**
 * Error tipico de la ventaja de la banda. Varianza de una apuesta a cuota c con
 * probabilidad p:  p(c-1)^2 + (1-p) - EV^2 . Dividido por sqrt(n).
 */
export function bandStandardError(band, universe) {
    const n = universe === 'top' ? band.nTop : band.nAll;
    const edge = universe === 'top' ? band.edgeTop : band.edgeAll;
    const c = (band.minOdds + band.maxOdds) / 2;
    const p = (1 + edge) / c;
    const variance = p * (c - 1) ** 2 + (1 - p) * 1 - edge ** 2;
    return Math.sqrt(Math.max(variance, 0) / Math.max(n, 1));
}
/**
 * Estimacion desde una sola cuota. Devuelve SIEMPRE `source` distinto de
 * FAIR_SINGLE_BOOK: no se puede afirmar que el margen se haya retirado.
 */
export function estimateFromSingleOdds(odds, opts = {}) {
    if (!(odds > 1))
        throw new RangeError(`Cuota decimal invalida: ${odds}`);
    const universe = opts.universe ?? 'all';
    const raw = 1 / odds;
    const band = findBand(odds);
    const warnings = [
        'Probabilidad derivada de UNA sola cuota: el margen no es observable en este mercado.',
    ];
    if (band === null) {
        const estimated = Math.min(0.999, Math.max(1e-6, raw * (1 + OUT_OF_RANGE_EDGE)));
        warnings.push(`Cuota ${odds} fuera de la tabla medida: peaje supuesto ${(OUT_OF_RANGE_EDGE * 100).toFixed(1)} %, sin respaldo empirico.`);
        return { raw, estimated, source: 'RAW_ODDS', uncertainty: 0.05, band: null, warnings };
    }
    const edge = universe === 'top' ? band.edgeTop : band.edgeAll;
    const se = bandStandardError(band, universe);
    let uncertainty = se * raw; // el error de la ventaja se traslada a la probabilidad
    // La banda es ancha: la ventaja real dentro de ella no es constante.
    uncertainty = Math.sqrt(uncertainty ** 2 + (0.25 * Math.abs(edge) * raw) ** 2);
    if (opts.extrapolatedFamily === true) {
        uncertainty *= 2;
        warnings.push('Peaje extrapolado desde el 1X2: esta banda no esta medida para esta familia de mercado.');
    }
    return {
        raw,
        estimated: Math.min(0.999, Math.max(1e-6, raw * (1 + edge))),
        source: 'RAW_ODDS_BAND_ADJUSTED',
        uncertainty,
        band,
        warnings,
    };
}
//# sourceMappingURL=singleOdds.js.map