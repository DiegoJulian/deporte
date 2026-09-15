/**
 * Toda la parametrizacion del motor. Nada esta escrito a fuego en los modulos:
 * cada umbral, cada penalizacion y cada limite vive aqui (seccion 24 del encargo).
 */
export const DEFAULT_CONFIG = {
    devigMethod: 'POWER',
    devigShadowMethods: ['SHIN', 'PROPORTIONAL', 'ADDITIVE', 'ODDS_RATIO'],
    individual: {
        threeWay: {
            veryLowMax: 0.25,
            redMin: 0.25, redMax: 0.40,
            yellowMin: 0.45, yellowMax: 0.65,
            greenMin: 0.65, greenMax: 0.95,
            extremeMin: 0.95,
        },
        binary: {
            discardMax: 0.25,
            redMin: 0.25, redMax: 0.40,
            yellowMin: 0.40, yellowMax: 0.55,
            neutralMin: 0.55, neutralMax: 0.65,
            greenMin: 0.65,
            extremeMin: 0.95,
        },
    },
    combination: {
        mode: 'RELATIVE_TO_TARGET',
        discardMax: 0.55,
        redMin: 0.55,
        yellowMin: 0.65,
        greenMin: 0.85,
        maxCombinationSize: 6,
        minCombinationSize: 1,
    },
    value: { positiveMin: 0.02, negativeMax: 0.0, suspiciousMin: 0.15 },
    confidence: {
        overroundReference: 0.05,
        overroundDecay: 8,
        booksFloor: 0.55,
        booksScale: 3,
        dispersionReference: 0.025,
        staleHalfLifePrematch: 6 * 3600_000,
        staleHalfLifeLive: 60_000,
        staleFloor: 0.15,
        movementReference: 0.10,
        movementMaxPenalty: 0.30,
        correlationFactor: { LOW: 1.0, MEDIUM: 0.85, HIGH: 0.60, EXTREME: 0.30 },
        sourceFactor: {
            RAW_ODDS: 0.55,
            RAW_ODDS_BAND_ADJUSTED: 0.70,
            FAIR_SINGLE_BOOK: 0.90,
            MARKET_CONSENSUS: 1.0,
            SCORE_MODEL: 0.95,
        },
    },
    filters: {
        maxOverround: 0.35,
        minOverround: 0.001,
        maxCorrelation: 0.35,
        minimumConfidenceScore: 50,
        minimumOddsQuality: 40,
        maximumMarketDispersion: 0.06,
        greenValidationConfidence: 85,
        maxLegsPerMatch: 3,
    },
    optimizer: {
        targetOdds: 2.5120,
        targetTolerance: 0.06,
        maxCandidatesReturned: 25,
        maxNodesExplored: 2_000_000,
    },
};
export function withConfig(patch) {
    return mergeDeep(DEFAULT_CONFIG, patch);
}
function mergeDeep(base, patch) {
    if (patch === undefined)
        return base;
    if (typeof base !== 'object' || base === null || Array.isArray(base))
        return patch;
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch))
        return patch;
    const out = { ...base };
    for (const [k, v] of Object.entries(patch)) {
        out[k] = mergeDeep(base[k], v);
    }
    return out;
}
//# sourceMappingURL=index.js.map