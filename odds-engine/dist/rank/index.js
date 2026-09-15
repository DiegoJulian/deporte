import { clamp } from '../core/numeric.js';
import { findBand } from '../devig/singleOdds.js';
/** Prior de mercado: probabilidad bruta corregida por el peaje medido de la banda. */
export function marketPrior(combinedOdds, universe = 'all') {
    const band = findBand(combinedOdds);
    const edge = band === null ? -0.18 : universe === 'top' ? band.edgeTop : band.edgeAll;
    return clamp((1 / combinedOdds) * (1 + edge), 1e-6, 0.999999);
}
/**
 * Prior de mercado de una COMBINADA, pata a pata.
 *
 * `marketPrior` aplicado a la cuota combinada es una extrapolacion silenciosa:
 * MARGIN_BANDS esta medida sobre apuestas SIMPLES de 1X2, y preguntarle por una
 * cuota de 12,0 que en realidad son cuatro patas de 1,86 devuelve el peaje de
 * la banda 4,50–8,00 (o el -18 % de fuera de rango) en vez del peaje compuesto
 * que se paga de verdad. Y lo hace SIEMPRE en la direccion mala: subestima el
 * peaje, con lo que el prior queda alto y la combinada parece mejor de lo que
 * es. Justo el error que este motor existe para no cometer.
 *
 *     prior = prod_i  (1/cuota_i) * (1 + ventaja_de_su_banda)
 *
 * Cada pata se evalua en SU banda, que es donde la tabla si esta medida, y el
 * peaje se compone N veces, que es como se cobra.
 */
export function combinedMarketPrior(legOdds, universe = 'all') {
    if (legOdds.length === 0)
        return clamp(1e-6, 1e-6, 0.999999);
    let p = 1;
    for (const o of legOdds) {
        const band = findBand(o);
        const edge = band === null ? -0.18 : universe === 'top' ? band.edgeTop : band.edgeAll;
        p *= (1 / o) * (1 + edge);
    }
    return clamp(p, 1e-9, 0.999999);
}
export function kellyGrowth(p, odds) {
    const b = odds - 1;
    if (b <= 0)
        return { fraction: 0, growth: 0 };
    const f = (p * odds - 1) / b;
    if (!(f > 0))
        return { fraction: 0, growth: 0 };
    const fr = Math.min(f, 0.999999);
    const growth = p * Math.log(1 + fr * b) + (1 - p) * Math.log(1 - fr);
    return { fraction: fr, growth: Math.max(growth, 0) };
}
export function rankCombination(input) {
    const w = clamp(input.confidence / 100, 0, 1);
    const pEstimate = input.conservative === true ? input.adjustedLowerBound : input.adjustedJointProbability;
    const universe = input.universe ?? 'all';
    const prior = input.legOdds !== undefined && input.legOdds.length > 0
        ? combinedMarketPrior(input.legOdds, universe)
        : marketPrior(input.combinedOdds, universe);
    const posterior = clamp(w * pEstimate + (1 - w) * prior, 1e-9, 1 - 1e-9);
    const ev = posterior * input.combinedOdds - 1;
    const { fraction, growth } = kellyGrowth(posterior, input.combinedOdds);
    const hasEdge = ev > 0 && growth > 0;
    const explanation = hasEdge
        ? `EV ${(ev * 100).toFixed(2)} % con confianza ${input.confidence.toFixed(0)}/100; Kelly pleno ${(fraction * 100).toFixed(1)} % del bankroll, crecimiento ${(growth * 1e4).toFixed(1)} puntos base por apuesta.`
        : `Sin ventaja: EV ${(ev * 100).toFixed(2)} %. La combinada paga un peaje compuesto del ${(input.compoundMargin * 100).toFixed(2)} % repartido en ${input.legs} pata(s).`;
    return {
        posteriorProbability: posterior,
        expectedValue: ev,
        kellyFraction: fraction,
        growthRate: growth,
        score: growth * 1e4,
        tollScore: -ev,
        hasEdge,
        explanation,
    };
}
/**
 * Orden final. Lexicografico, en el orden de prioridades del encargo:
 *   1. crecimiento (ventaja real)
 *   2. si nadie tiene ventaja: menor peaje
 *   3. menos patas
 *   4. menor correlacion
 *   5. mayor confianza
 */
const RISK_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2, EXTREME: 3 };
export function compareCombinations(a, b) {
    if (a.rank.score !== b.rank.score)
        return b.rank.score - a.rank.score;
    if (a.rank.tollScore !== b.rank.tollScore)
        return a.rank.tollScore - b.rank.tollScore;
    if (a.legs !== b.legs)
        return a.legs - b.legs;
    const ra = RISK_ORDER[a.correlationRisk];
    const rb = RISK_ORDER[b.correlationRisk];
    if (ra !== rb)
        return ra - rb;
    return b.confidence - a.confidence;
}
//# sourceMappingURL=index.js.map