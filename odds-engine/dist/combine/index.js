import { expectedReturnOnGrid, jointOnGrid } from '../correlation/scoreGrid.js';
import { analyseCorrelation } from '../correlation/engine.js';
/** Producto de cuotas. Valido siempre: es aritmetica del boleto, no probabilidad. */
export function combinedOdds(odds) {
    if (odds.length === 0)
        throw new RangeError('Una combinada necesita al menos una pata');
    return { odds: odds.reduce((a, b) => a * b, 1), legs: odds.length };
}
const Z95 = 1.959963985;
export function jointProbability(input) {
    const { legs, uncertainties, grids } = input;
    if (legs.length === 0)
        throw new RangeError('Una combinada necesita al menos una pata');
    const ctx = {
        grids,
        ...(input.crossMatchCoefficient !== undefined ? { crossMatchCoefficient: input.crossMatchCoefficient } : {}),
    };
    const correlation = analyseCorrelation(legs, ctx);
    const warnings = [...correlation.warnings];
    const O = legs.reduce((a, l) => a * l.odds, 1);
    const rawJoint = 1 / O;
    const fairJoint = legs.reduce((a, l) => a * l.fair, 1);
    // --- Agrupar por partido ---
    const byMatch = new Map();
    legs.forEach((l, i) => {
        const g = byMatch.get(l.matchId) ?? { legs: [], idx: [] };
        g.legs.push(l);
        g.idx.push(i);
        byMatch.set(l.matchId, g);
    });
    const regimes = {};
    let adjusted = 1;
    let relVar = 0;
    let boundsPenalty = 0;
    for (const [matchId, group] of byMatch) {
        const grid = grids.get(matchId);
        const preds = group.legs.map((l) => l.predicate);
        const allHavePredicates = preds.every((p) => p !== undefined);
        if (group.legs.length === 1) {
            regimes[matchId] = 'SINGLE';
            adjusted *= group.legs[0].fair;
        }
        else if (grid !== undefined && allHavePredicates) {
            regimes[matchId] = 'MODEL';
            adjusted *= jointOnGrid(grid, preds, 'STRICT');
        }
        else {
            regimes[matchId] = 'BOUNDS';
            const indep = group.legs.reduce((a, l) => a * l.fair, 1);
            adjusted *= indep;
            // Ancho de la banda de Frechet del grupo, como incertidumbre anadida.
            const lo = Math.max(0, group.legs.reduce((a, l) => a + l.fair, 0) - (group.legs.length - 1));
            const hi = Math.min(...group.legs.map((l) => l.fair));
            boundsPenalty += ((hi - lo) / 2) ** 2;
            warnings.push(`Partido ${matchId}: ${group.legs.length} patas del mismo encuentro sin modelo de marcadores. La conjunta real esta entre ${(lo * 100).toFixed(1)} % y ${(hi * 100).toFixed(1)} %; se usa el producto como punto medio y se le pone esa banda encima.`);
        }
        for (const i of group.idx) {
            const p = legs[i].fair;
            const s = uncertainties[i] ?? 0;
            if (p > 1e-9)
                relVar += (s / p) ** 2;
        }
    }
    const frechetLow = Math.max(0, legs.reduce((a, l) => a + l.fair, 0) - (legs.length - 1));
    const frechetHigh = Math.min(...legs.map((l) => l.fair));
    adjusted = Math.min(frechetHigh, Math.max(frechetLow, adjusted));
    const uncertainty = Math.sqrt((adjusted ** 2) * relVar + boundsPenalty);
    const adjustedLowerBound = Math.max(frechetLow, Math.min(adjusted, adjusted - Z95 * uncertainty));
    // Peaje compuesto: lo que se paga por montar ESTA combinada.
    const compoundMargin = 1 - legs.reduce((a, l) => a * (l.fair * l.odds), 1);
    if (legs.length >= 4) {
        warnings.push(`${legs.length} patas: el peaje compuesto es del ${(compoundMargin * 100).toFixed(2)} %. Cada pata extra multiplica el margen, no lo reparte.`);
    }
    return {
        rawJointProbability: rawJoint,
        fairJointProbability: fairJoint,
        adjustedJointProbability: adjusted,
        adjustedLowerBound,
        uncertainty,
        frechetLow, frechetHigh,
        combinedOdds: O,
        compoundMargin,
        correlation,
        regimes,
        warnings,
    };
}
/**
 * Valor esperado exacto de una combinada cuyas patas son TODAS del mismo
 * partido, usando la rejilla y respetando los empates (push) del handicap
 * asiatico y del empate no valido.
 */
export function exactSameMatchExpectedReturn(grid, legs) {
    if (legs.some((l) => l.predicate === undefined))
        return null;
    return expectedReturnOnGrid(grid, legs.map((l) => ({ predicate: l.predicate, odds: l.odds })));
}
//# sourceMappingURL=index.js.map