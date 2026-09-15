import { asFair, asOdds, asRaw, asConsensus } from './core/types.js';
import { DEFAULT_CONFIG } from './config/index.js';
import { computeMarketProbabilities } from './market/fairProbability.js';
import { computeConsensus } from './consensus/index.js';
import { oddsQualityScore } from './quality/index.js';
import { classifyBinary, classifyThreeWay, classifyValue } from './classify/index.js';
import { fitGridFromMarkets } from './correlation/scoreGrid.js';
import { parsePredicate } from './correlation/predicates.js';
import { optimiseCombinations } from './optimize/index.js';
/**
 * Clave canonica de la salida, para construir el predicado sobre el marcador.
 *
 * OJO con el handicap: la `line` del mercado va SIEMPRE en perspectiva del
 * local (asi la normaliza el adaptador). La pata del visitante necesita el
 * signo cambiado, o se evalua un mercado distinto del que se apuesta.
 */
function predicateKey(family, outcomeId, line) {
    const flip = (family === 'AH' || family === 'EH') && outcomeId === 'AWAY';
    const effective = line === undefined ? undefined : flip ? -line : line;
    const l = effective === undefined ? '' : `@${effective}`;
    switch (family) {
        case '1X2': return `1X2:${outcomeId}`;
        case 'OU': return `OU:${outcomeId}${l}`;
        case 'BTTS': return `BTTS:${outcomeId}`;
        case 'DC': return `DC:${outcomeId}`;
        case 'DNB': return `DNB:${outcomeId}`;
        case 'AH': return `AH:${outcomeId}${l}`;
        case 'EH': return `EH:${outcomeId}${l}`; // la DRAW usa la linea del local
        case 'ODDEVEN': return `ODDEVEN:${outcomeId}`;
        case 'CS': return `CS:${outcomeId}`;
        case 'TT': return `TT:${outcomeId}${l}`;
        default: return `${family}:${outcomeId}${l}`;
    }
}
export function analyse(input, cfg = DEFAULT_CONFIG) {
    const now = input.now ?? Date.now();
    const warnings = [];
    const selections = [];
    const fitTargets = new Map();
    for (const market of input.markets) {
        const probs = computeMarketProbabilities(market, input.bookmaker, cfg, {
            ...(input.universe !== undefined ? { universe: input.universe } : {}),
        });
        const consensus = computeConsensus(market, cfg, { now });
        const live = market.live === true;
        probs.outcomes.forEach((o, i) => {
            const idx = consensus.outcomeIds.indexOf(o.outcomeId);
            const consensusP = idx >= 0 ? consensus.consensus[idx] : undefined;
            const dispersion = idx >= 0 ? consensus.dispersion[idx] : undefined;
            const quote = market.outcomes.find((x) => x.id === o.outcomeId)?.quotes.find((q) => q.bookmaker === input.bookmaker);
            const ageMs = quote === undefined ? 0 : Math.max(0, now - quote.observedAt);
            const movement = quote?.openingOdds === undefined ? undefined : Math.abs(1 / o.odds - 1 / quote.openingOdds);
            const quality = oddsQualityScore({
                overround: probs.overround,
                marketComplete: market.complete && probs.validation.usable,
                booksUsed: consensus.booksUsed,
                dispersion: dispersion === undefined || Number.isNaN(dispersion) ? null : dispersion,
                ageMs, live,
                ...(movement !== undefined ? { movement } : {}),
                ...(quote?.liquidity !== undefined ? { liquidity: quote.liquidity } : {}),
            }, cfg);
            // El consenso solo sirve como referencia de valor si excluye a la casa propia.
            const externalBooks = consensus.books.filter((b) => b.bookmaker !== input.bookmaker && b.weight > 0).length;
            const hasExternalReference = externalBooks >= 2 && consensusP !== undefined && Number.isFinite(consensusP);
            const value = classifyValue({
                odds: o.odds,
                reference: hasExternalReference ? consensusP : null,
                basis: hasExternalReference ? 'consensus' : externalBooks === 0 ? 'self' : null,
                ...(dispersion !== undefined && Number.isFinite(dispersion)
                    ? { referenceUncertainty: dispersion / Math.sqrt(Math.max(consensus.effectiveBooks, 1)) }
                    : {}),
            }, cfg);
            const riskLight = market.kind === 'THREE_WAY'
                ? classifyThreeWay(o.fair, cfg)
                : classifyBinary(o.fair, cfg);
            const selWarnings = [
                ...o.warnings,
                ...probs.validation.issues.filter((x) => x.severity !== 'INFO').map((x) => x.message),
                ...quality.reasons,
            ];
            if (riskLight === 'EXTREMA')
                selWarnings.push('Probabilidad por encima del 95 %: revisar el origen de la cuota antes de usarla. A esta altura el margen relativo se dispara y un error palpable de la casa es anulable.');
            selections.push({
                selectionId: `${market.id}::${o.outcomeId}`,
                matchId: market.matchId,
                marketId: market.id,
                family: market.family,
                outcomeId: o.outcomeId,
                label: o.label,
                period: market.period ?? 'FULL_TIME',
                odds: asOdds(o.odds),
                bookmaker: input.bookmaker,
                raw: asRaw(o.raw),
                fair: asFair(o.fair),
                source: o.source,
                uncertainty: o.uncertainty,
                overround: probs.overround,
                consensus: hasExternalReference ? asConsensus(consensusP) : null,
                dispersion: dispersion === undefined || Number.isNaN(dispersion) ? null : dispersion,
                oddsQuality: quality.score,
                confidence: quality.score,
                riskLight,
                valueLight: value.light,
                expectedValue: value.expectedValue,
                evBasis: value.basis,
                warnings: selWarnings,
            });
            // Objetivo para ajustar la rejilla de marcadores del partido.
            // SOLO mercados de partido completo: la rejilla modela el marcador final.
            // Un mercado de 1a parte NO se puede evaluar sobre ella, y meterlo en el
            // ajuste corrompe los parametros.
            if (probs.validation.usable && (market.period ?? 'FULL_TIME') === 'FULL_TIME') {
                const np = parsePredicate(predicateKey(market.family, o.outcomeId, market.line));
                if (np !== null) {
                    const list = fitTargets.get(market.matchId) ?? [];
                    list.push({ key: np.key, predicate: np.predicate, probability: o.fair });
                    fitTargets.set(market.matchId, list);
                }
            }
        });
        warnings.push(...consensus.warnings.map((w) => `[${market.id}] ${w}`));
    }
    // --- Ajuste de la distribucion de marcadores, un partido cada vez ---
    const grids = new Map();
    const gridFits = new Map();
    for (const [matchId, targets] of fitTargets) {
        // Se quita una salida por mercado para no meter ecuaciones redundantes
        // (en un 1X2 desmarginado, la tercera sale de las otras dos).
        //
        // OJO CON EL CONTADOR: esto llevaba un Set y `[...seen].filter(...).length`,
        // que en un Set vale SIEMPRE 0 o 1 y nunca 2. Con eso la condicion del 1X2
        // (`count < 2`) se cumplia siempre y pasaban las TRES salidas, asi que un
        // partido con solo 1X2 llegaba al ajuste con 3 objetivos —dos de ellos
        // independientes— y salia una rejilla de 3 parametros con residuo cero y
        // nota maxima de ajuste. Es decir: el motor se inventaba la precision que
        // dice no inventarse nunca. Hace falta un multiconjunto, no un conjunto.
        const seen = new Map();
        const independent = targets.filter((t) => {
            const fam = t.key.split(':')[0];
            const line = t.key.includes('@') ? t.key.slice(t.key.indexOf('@')) : '';
            const k = `${fam}${line}`;
            const count = seen.get(k) ?? 0;
            seen.set(k, count + 1);
            return count < (fam === '1X2' ? 2 : 1);
        });
        const fit = fitGridFromMarkets(independent);
        if (fit !== null && fit.converged) {
            grids.set(matchId, fit.grid);
            gridFits.set(matchId, fit);
            warnings.push(...fit.warnings.map((w) => `[${matchId}] ${w}`));
        }
        else {
            warnings.push(`[${matchId}] No se pudo ajustar la distribucion de marcadores (${independent.length} mercados independientes, hacen falta 3). Las combinadas de este partido usaran cotas, no calculo.`);
        }
    }
    return { selections, grids, gridFits, warnings };
}
/** Analisis completo + construccion de la combinada. */
export function buildCombinations(input, cfg = DEFAULT_CONFIG, opts = {}) {
    const analysis = analyse(input, cfg);
    const candidates = analysis.selections.map((s) => {
        // Sin predicado -> la pata no se puede evaluar sobre la rejilla y su
        // correlacion se acota en vez de calcularse. Es el caso de los mercados que
        // no son de partido completo, y de cualquier familia sin traduccion a
        // marcador (corners, tarjetas, jugador).
        if (s.period !== 'FULL_TIME')
            return { selection: s };
        const market = input.markets.find((m) => m.id === s.marketId);
        const np = parsePredicate(predicateKey(s.family, s.outcomeId, market?.line));
        return np === null ? { selection: s } : { selection: s, predicate: np.predicate };
    });
    const gridMaxErrors = new Map();
    for (const [matchId, fit] of analysis.gridFits)
        gridMaxErrors.set(matchId, fit.maxAbsError);
    const optimisation = optimiseCombinations(candidates, cfg, {
        ...opts,
        grids: analysis.grids,
        gridMaxErrors,
        ...(input.universe !== undefined ? { universe: input.universe } : {}),
    });
    return { ...analysis, optimisation };
}
//# sourceMappingURL=pipeline.js.map