import { devig, devigAll } from '../devig/methods.js';
import { estimateFromSingleOdds } from '../devig/singleOdds.js';
import { validateMarket } from './validator.js';
export function computeMarketProbabilities(market, bookmaker, cfg, opts = {}) {
    const validation = validateMarket(market, cfg, bookmaker);
    const quotes = market.outcomes.map((o) => ({ o, q: o.quotes.find((x) => x.bookmaker === bookmaker) }));
    const present = quotes.filter((x) => x.q !== undefined);
    // --- Camino degradado: no hay mercado completo de esa casa ---
    if (!validation.usable || present.length < 2 || present.length !== market.outcomes.length) {
        const outcomes = present.map(({ o, q }) => {
            const odds = q.odds;
            const est = estimateFromSingleOdds(odds, {
                ...(opts.universe !== undefined ? { universe: opts.universe } : {}),
                extrapolatedFamily: market.family !== '1X2',
            });
            return {
                outcomeId: o.id, label: o.label, odds,
                raw: est.raw, fair: est.estimated, source: est.source,
                uncertainty: est.uncertainty, warnings: est.warnings,
            };
        });
        return {
            marketId: market.id, matchId: market.matchId, bookmaker,
            overround: validation.overround, method: cfg.devigMethod, methodParameter: null,
            outcomes, validation, methodSpread: outcomes.map(() => 0), shadows: {},
        };
    }
    // --- Camino normal: mercado completo, se retira el margen ---
    const target = market.normalisationTarget ?? 1;
    const odds = present.map((x) => x.q.odds);
    const raw = odds.map((c) => 1 / c);
    const main = devig(raw, cfg.devigMethod, target);
    const all = devigAll(raw, target);
    const shadows = {};
    for (const m of cfg.devigShadowMethods)
        shadows[m] = all[m];
    const spread = raw.map((_, i) => {
        const vals = Object.values(all).filter((r) => r.converged).map((r) => r.fair[i]);
        return vals.length < 2 ? 0 : Math.max(...vals) - Math.min(...vals);
    });
    const fair = main.converged ? main.fair : all.PROPORTIONAL.fair;
    const outcomes = present.map(({ o }, i) => {
        const warnings = [...main.warnings];
        if (spread[i] > 0.02)
            warnings.push(`Los metodos de devig discrepan en ${(spread[i] * 100).toFixed(1)} puntos: el reparto del margen es una eleccion, no un dato.`);
        return {
            outcomeId: o.id, label: o.label, odds: odds[i],
            raw: raw[i], fair: fair[i],
            source: 'FAIR_SINGLE_BOOK',
            // Incertidumbre = mitad de la horquilla entre metodos (incertidumbre de modelo)
            uncertainty: Math.max(spread[i] / 2, 0.002),
            warnings,
        };
    });
    return {
        marketId: market.id, matchId: market.matchId, bookmaker,
        overround: validation.overround, method: main.method, methodParameter: main.parameter,
        outcomes, validation, methodSpread: spread, shadows,
    };
}
//# sourceMappingURL=fairProbability.js.map