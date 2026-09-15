import { evaluate, jointOnGrid } from './scoreGrid.js';
const phi = (pAB, pA, pB) => {
    const d = Math.sqrt(pA * (1 - pA) * pB * (1 - pB));
    return d < 1e-12 ? 0 : (pAB - pA * pB) / d;
};
export function analysePair(a, b, ctx) {
    const tol = ctx.redundancyTolerance ?? 1e-4;
    const grid = ctx.grids.get(a.matchId);
    const sameMatch = a.matchId === b.matchId;
    let pA = a.fair;
    let pB = b.fair;
    let joint;
    let regime;
    if (sameMatch && grid !== undefined && a.predicate !== undefined && b.predicate !== undefined) {
        regime = 'SAME_MATCH_MODEL';
        pA = evaluate(grid, a.predicate).win;
        pB = evaluate(grid, b.predicate).win;
        joint = jointOnGrid(grid, [a.predicate, b.predicate], 'STRICT');
    }
    else if (sameMatch) {
        regime = 'SAME_MATCH_BOUNDS';
        joint = pA * pB;
    }
    else {
        regime = 'CROSS_MATCH';
        const r = ctx.crossMatchCoefficient ?? 0;
        joint = pA * pB + r * Math.sqrt(pA * (1 - pA) * pB * (1 - pB));
    }
    const low = Math.max(0, pA + pB - 1);
    const high = Math.min(pA, pB);
    joint = Math.min(high, Math.max(low, joint));
    const indep = pA * pB;
    return {
        a: a.selectionId, b: b.selectionId, regime, pA, pB,
        jointIndependent: indep,
        joint,
        ratio: indep < 1e-12 ? 1 : joint / indep,
        coefficient: phi(joint, pA, pB),
        frechetLow: low, frechetHigh: high,
        redundant: Math.abs(joint - high) < tol && Math.abs(pA - pB) > tol,
        incompatible: joint < tol,
    };
}
export function analyseCorrelation(legs, ctx) {
    const pairs = [];
    for (let i = 0; i < legs.length; i++) {
        for (let j = i + 1; j < legs.length; j++) {
            pairs.push(analysePair(legs[i], legs[j], ctx));
        }
    }
    const maxAbs = pairs.length === 0 ? 0 : Math.max(...pairs.map((p) => Math.abs(p.coefficient)));
    const hasRedundancy = pairs.some((p) => p.redundant);
    const hasIncompatibility = pairs.some((p) => p.incompatible);
    let risk = 'LOW';
    if (hasIncompatibility || hasRedundancy || maxAbs >= 0.5)
        risk = 'EXTREME';
    else if (maxAbs >= 0.25)
        risk = 'HIGH';
    else if (maxAbs >= 0.10)
        risk = 'MEDIUM';
    const warnings = [];
    const boundsPairs = pairs.filter((p) => p.regime === 'SAME_MATCH_BOUNDS');
    if (boundsPairs.length > 0) {
        warnings.push(`${boundsPairs.length} par(es) del mismo partido sin modelo de marcadores ajustado: la conjunta no se puede calcular, solo acotar. La incertidumbre sube en consecuencia.`);
    }
    for (const p of pairs) {
        if (p.incompatible)
            warnings.push(`${p.a} y ${p.b} son incompatibles: no pueden darse a la vez.`);
        if (p.redundant)
            warnings.push(`${p.a} implica a ${p.b} (o al reves): la segunda pata no anade riesgo, solo cuota. La casa normalmente no deja combinarlas.`);
        if (p.regime === 'SAME_MATCH_MODEL' && p.ratio > 1.15) {
            warnings.push(`${p.a} + ${p.b}: correlacion positiva fuerte (x${p.ratio.toFixed(2)} sobre el producto). Multiplicar las cuotas INFRAVALORA la probabilidad real.`);
        }
        if (p.regime === 'SAME_MATCH_MODEL' && p.ratio < 0.85) {
            warnings.push(`${p.a} + ${p.b}: correlacion negativa (x${p.ratio.toFixed(2)}). Multiplicar las cuotas SOBREVALORA la probabilidad real: es una trampa clasica.`);
        }
    }
    return { pairs, maxAbsCoefficient: maxAbs, risk, hasRedundancy, hasIncompatibility, warnings };
}
//# sourceMappingURL=engine.js.map